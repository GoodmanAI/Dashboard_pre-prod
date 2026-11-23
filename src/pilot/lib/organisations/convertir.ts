import type { CrmEtapeCommerciale, CrmOrganisation, Prisma } from "@prisma/client";
import type { z } from "zod";
import type { conversionClient } from "@/pilot/lib/validation/conversion";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { cheminVersSigne, estClient, LIBELLES } from "@/pilot/lib/pipeline";
import { transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { creerContratDansTransaction } from "@/pilot/lib/contrats/gerer";
import { changerEtapeDansTransaction, lirePropositionEnAttente, PROPOSITION_EN_ATTENTE } from "./changerEtape";
import { verrouillerOrganisation } from "./comptes";

/** Pourquoi une étape ne se convertit pas. `null` quand la conversion est possible. */
export function refusConversion(etape: CrmEtapeCommerciale): string | null {
  if (cheminVersSigne(etape)) return null;
  if (estClient(etape)) return `Ce client est déjà en « ${LIBELLES[etape]} » : rien à convertir.`;
  return `Ce client est en « ${LIBELLES[etape]} ». Repassez-le en Prospect avant de le convertir.`;
}

/**
 * Franchit, dans la transaction reçue, chaque étape jusqu'à Signé (C-71). Chaque pas
 * est un changement d'étape ordinaire : `changerEtapeDansTransaction` le
 * vérifie par `verifierChangementEtape`, l'écrit sous condition de l'étape lue
 * et le journalise « à la conversion ». Une erreur à n'importe quel pas remonte
 * telle quelle : la transaction appelante est annulée, aucun pas ne reste.
 */
export async function convertirEnClient(tx: Prisma.TransactionClient, { organisationId, auteurId, etapeLue }: {
  organisationId: number; auteurId: number; etapeLue?: CrmEtapeCommerciale;
}): Promise<{ organisation: CrmOrganisation; etapesFranchies: CrmEtapeCommerciale[] }> {
  // Le verrou sérialise avec les autres mutations verrouillées ; un changement
  // d'étape simple, lui, est départagé par l'écriture conditionnelle.
  await verrouillerOrganisation(tx, organisationId);
  const { etape } = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: organisationId }, select: { etape: true } });
  verifierEtapeLue(etape, etapeLue);
  return franchirJusquASigne(tx, { organisationId, auteurId, etape });
}

function verifierEtapeLue(etape: CrmEtapeCommerciale, etapeLue: CrmEtapeCommerciale | undefined) {
  if (etapeLue !== undefined && etape !== etapeLue) throw new ErreurMetier("L'étape vient de changer. Rechargez la page.", 409);
}
/** Les pas, depuis l'étape que l'appelant vient de lire sous le verrou. */
async function franchirJusquASigne(tx: Prisma.TransactionClient, { organisationId, auteurId, etape }: {
  organisationId: number; auteurId: number; etape: CrmEtapeCommerciale;
}) {
  const chemin = cheminVersSigne(etape);
  if (!chemin) throw new ErreurMetier(refusConversion(etape)!, 409);
  let organisation: CrmOrganisation | null = null;
  for (const vers of chemin) {
    organisation = await changerEtapeDansTransaction(tx, { organisationId, vers, auteurId, mention: "conversion" });
  }
  return { organisation: organisation!, etapesFranchies: chemin };
}

export { PROPOSITION_EN_ATTENTE };

/**
 * Sans proposition : la conversion, puis un contrat en brouillon daté, créé par
 * la logique des contrats. Une seule transaction. Une proposition qui attend une
 * réponse (`propositionEnAttente`) bloque : on l'accepte, on ne la contourne pas
 * (garde serveur, l'écran n'est pas la seule barrière). Étape et versions se
 * lisent une fois chacune, sous le verrou.
 *
 * Les opportunités ouvertes ne bougent pas : le contrat n'a pas encore de
 * lignes, rien n'est signé en argent. Elles restent l'estimé de la carte et de
 * la projection, et passent en gagnées quand le contrat actif porte leur
 * produit (`changerStatutContrat`, lignes d'un contrat actif).
 */
export async function convertirAvecContrat(organisationId: number, { etapeLue, signeLe, debuteLe }: z.output<typeof conversionClient>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, organisationId);
    // L'étape d'abord : un client déjà signé reçoit « déjà client », pas « une proposition attend une réponse ».
    const { etape } = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: organisationId }, select: { etape: true } });
    const refus = refusConversion(etape);
    if (refus) throw new ErreurMetier(refus, 409);
    if (await lirePropositionEnAttente(tx, organisationId)) throw new ErreurMetier(PROPOSITION_EN_ATTENTE, 409);
    verifierEtapeLue(etape, etapeLue);
    const { organisation, etapesFranchies } = await franchirJusquASigne(tx, { organisationId, auteurId, etape });
    const contrat = await creerContratDansTransaction(tx, { organisationId, signeLe, debuteLe: debuteLe ?? null, lignes: [] }, auteurId);
    return { organisation, contrat, etapesFranchies };
  });
}
