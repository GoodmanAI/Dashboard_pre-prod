import { ErreurMetier } from "@/pilot/lib/erreurs";
import { debutDuJour } from "@/pilot/lib/dates";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "./comptes";
import { refusProlongationPoc } from "./poc";
import { cyclePocOuvert } from "./cyclesPoc";

export async function prolongerPoc(organisationId: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, organisationId);
    const org = await tx.crmOrganisation.findUnique({ where: { id: organisationId } });
    if (!org) throw new ErreurMetier("Organisation inconnue.", 404);
    const refus = refusProlongationPoc(org);
    if (refus) throw new ErreurMetier(refus, 409);
    if (!await cyclePocOuvert(tx, org)) throw new ErreurMetier("Ce cycle de POC est clos. Démarrez un nouveau cycle avec sa date de début.", 409);
    const pocProlongeLe = debutDuJour(new Date());
    const ecrit = await tx.crmOrganisation.updateMany({ where: { id: organisationId, etape: "EN_POC", pocProlongeLe: null }, data: { pocProlongeLe } });
    if (ecrit.count !== 1) throw new ErreurMetier("Le POC vient de changer. Rechargez la fiche.", 409);
    await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId, auteurId,
      resume: "POC prolongé d'un mois", avant: { pocProlongeLe: null }, apres: { pocProlongeLe } });
    return tx.crmOrganisation.findUniqueOrThrow({ where: { id: organisationId } });
  });
}
