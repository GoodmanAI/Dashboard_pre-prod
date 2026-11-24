import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "./comptes";

export type TracesArgent = { contratsSignes: number; propositionsEnvoyees: number; apport: boolean; moisFiges: number };

/**
 * Pourquoi une fiche ne se supprime pas, ou null (C-86). Une fiche créée par
 * erreur ou en double se supprime tant qu'aucun argent n'y est passé : contrat
 * activé, proposition envoyée, apport d'affaires, mois de chiffre d'affaires figé.
 */
export function refusSuppressionFiche(t: TracesArgent): string | null {
  if (t.contratsSignes) return "Cette fiche porte un contrat activé : elle reste. Si le client est parti, passez-le en « Contrat terminé ».";
  if (t.propositionsEnvoyees) return "Une proposition a été envoyée à ce client : la fiche reste. Passez-la en « Perdu » si l'affaire ne se fait pas.";
  if (t.apport) return "Cette fiche est suivie dans l'apport d'affaires : retirez-la d'abord de l'apport.";
  if (t.moisFiges) return "Du chiffre d'affaires de ce client est déjà figé : la fiche reste.";
  return null;
}

/** Supprime une fiche et tout ce qu'elle porte. Le journal garde une ligne, sans organisation, qui dit qui l'a fait. */
export async function supprimerFiche(id: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, id);
    const org = await tx.crmOrganisation.findUnique({ where: { id }, select: { id: true, raisonSocialeNom: true, etape: true,
      apport: { select: { organisationId: true } },
      _count: { select: { caMensuels: true } } } });
    if (!org) throw new ErreurMetier("Cette fiche n'existe déjà plus.", 404);
    const [contratsSignes, propositionsEnvoyees] = await Promise.all([
      tx.crmContrat.count({ where: { organisationId: id, statut: { not: "BROUILLON" } } }),
      tx.crmProposition.count({ where: { organisationId: id, statut: { not: "BROUILLON" } } }),
    ]);
    const refus = refusSuppressionFiche({ contratsSignes, propositionsEnvoyees, apport: org.apport != null, moisFiges: org._count.caMensuels });
    if (refus) throw new ErreurMetier(refus, 409);
    await tx.crmOrganisation.delete({ where: { id } });
    await journaliser(tx, { type: "ORGANISATION_MODIFIEE", auteurId,
      resume: "Fiche supprimée", avant: { organisationId: id, raisonSocialeNom: org.raisonSocialeNom, etape: org.etape } });
    return { supprime: true };
  });
}
