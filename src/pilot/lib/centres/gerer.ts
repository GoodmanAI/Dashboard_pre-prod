import { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { creationCentre, majCentre } from "@/pilot/lib/validation/centre";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { adresseChangee, geocodageARelancer, GEOCODAGE_A_REFAIRE } from "@/pilot/lib/carte/geocoder";
import { geocoderApresCommit } from "@/pilot/lib/carte/localiser";

function erreurCentre(erreur: unknown): never {
  if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
    throw new ErreurMetier("Un centre porte déjà ce nom chez ce client.", 409);
  }
  throw erreur;
}

/** Le centre naît en A_FAIRE : sa position est cherchée après le commit, sans faire attendre (lot U). */
export async function creerCentre(donnees: z.output<typeof creationCentre>, auteurId: number) {
  try {
    const centre = await transactionJournalisee(async (tx) => {
      if (!await tx.crmOrganisation.findUnique({ where: { id: donnees.organisationId }, select: { id: true } })) {
        throw new ErreurMetier("Organisation inconnue.", 404);
      }
      const centre = await tx.crmCentre.create({ data: donnees });
      await journaliser(tx, { type: "CENTRE_CREE", organisationId: centre.organisationId, centreId: centre.id,
        auteurId, resume: `Centre créé : ${centre.nom}`, apres: { nom: centre.nom, codeSite: centre.codeSite, ville: centre.ville } });
      return centre;
    });
    geocoderApresCommit([centre.id]);
    return centre;
  } catch (erreur) { erreurCentre(erreur); }
}

/**
 * Changer la rue, le code postal ou la ville efface la position, dans la transaction, puis la recherche après le commit (lot U).
 * Une adresse réécrite aux espaces près sur un centre encore à faire relance aussi le géocodage : celui en cours a lu l'ancienne écriture.
 */
export async function modifierCentre(id: number, donnees: z.output<typeof majCentre>, auteurId: number) {
  try {
    const { centre, aGeocoder } = await transactionJournalisee(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CrmCentre" WHERE id = ${id} FOR UPDATE`;
      const centre = await tx.crmCentre.findUnique({ where: { id } });
      if (!centre) throw new ErreurMetier("Centre inconnu.", 404);
      const diff = champsChanges(centre, donnees, Object.keys(donnees) as (keyof typeof donnees)[]);
      if (!Object.keys(diff.apres).length) return { centre, aGeocoder: false };
      const adresseNeuve = adresseChangee(centre, diff.apres);
      const modifie = await tx.crmCentre.update({ where: { id }, data: { ...donnees, ...(adresseNeuve ? GEOCODAGE_A_REFAIRE : {}) } });
      await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId: centre.organisationId, centreId: id,
        auteurId, resume: `Centre modifié : ${modifie.nom}`, ...diff });
      // Relancé aussi pour une adresse réécrite aux espaces près sur un centre encore à faire (`geocodageARelancer`).
      return { centre: modifie, aGeocoder: geocodageARelancer(centre, diff.apres) };
    });
    if (aGeocoder) geocoderApresCommit([id]);
    return centre;
  } catch (erreur) { erreurCentre(erreur); }
}
