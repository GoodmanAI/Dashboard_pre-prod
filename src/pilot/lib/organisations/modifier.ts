import type { z } from "zod";
import type { majOrganisation } from "@/pilot/lib/validation/organisation";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerConcurrentLie } from "@/pilot/lib/concurrents/lien";
import { verifierResponsables, verrouillerOrganisation } from "./comptes";
import { evaluerOrganisationSansEchouer } from "@/pilot/lib/checklist/evaluer";
import { sitesSousLesCentres } from "./sites";

export async function modifierOrganisation(id: number, donnees: z.output<typeof majOrganisation>, auteurId: number) {
  let chefChange = false;
  const resultat = await transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, id);
    const organisation = await tx.crmOrganisation.findUniqueOrThrow({ where: { id } });
    await verifierResponsables(tx, donnees);
    if (donnees.utilisateurId != null && !await tx.user.findFirst({ where: { id: donnees.utilisateurId, role: "CLIENT" }, select: { id: true } })) {
      throw new ErreurMetier("Compte Dashboard inconnu.", 400);
    }
    // Un centre créé est un site : on ne saisit pas moins de sites que de centres (C-92). Un centre créé en même temps ne fausse rien : l'affichage prend le plus grand des deux.
    if (donnees.nombreSites != null && donnees.nombreSites !== organisation.nombreSites) {
      const centres = await tx.crmCentre.count({ where: { organisationId: id } });
      if (donnees.nombreSites < centres) throw new ErreurMetier(sitesSousLesCentres(centres), 400);
    }
    // Le concurrent en place doit exister, et ne peut pas être supprimé pendant cette écriture.
    if (donnees.concurrentId != null) await verrouillerConcurrentLie(tx, donnees.concurrentId);
    const diff = champsChanges(organisation, donnees, Object.keys(donnees) as (keyof typeof donnees)[]);
    if (!Object.keys(diff.apres).length) return organisation;
    chefChange = "chefDeProjetId" in diff.apres;
    const modifiee = await tx.crmOrganisation.update({ where: { id }, data: donnees });
    await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId: id, auteurId, resume: "Organisation modifiée", ...diff });
    return modifiee;
  });
  // « Responsable du déploiement désigné » se constate après le commit (C-85).
  if (chefChange) await evaluerOrganisationSansEchouer(id);
  return resultat;
}
