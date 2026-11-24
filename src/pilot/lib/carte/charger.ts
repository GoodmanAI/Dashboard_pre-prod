import { prisma } from "@/pilot/lib/prisma";
import { chargerTableauProspects } from "@/pilot/lib/prospection/chargerTableau";
import { assemblerCentres, type CentreCarte } from "./affichage";

/**
 * Les centres de la carte (lot U). Un nombre fixe de lectures, quel que soit le
 * nombre de centres : jamais une requête par centre.
 *
 * Tout ce qui vient de l'organisation passe par le chargeur du tableau Prospects,
 * la même règle que ses cartes (C-70 pour le montant, lot R pour la température,
 * calculée en mémoire) : l'étape, le commercial, le RIS de la fiche, le concurrent
 * en place, le gagnant d'une affaire perdue et la date de sortie. Il s'y ajoute
 * une seule lecture : les centres avec leur position et leur dernière écriture
 * (pour dire depuis quand un centre attend sa position).
 *
 * Aucun chiffre d'affaires : le montant est celui d'un dossier, comme sur le
 * tableau, que voit aussi un développeur (C-64). Aucune adresse n'est lue, ni le
 * code postal : le nom du centre, sa commune et sa position suffisent. La latitude
 * et la longitude sont des décimaux en base ; elles passent en chaînes, et ne
 * deviennent des nombres qu'au tracé.
 */
export async function chargerCarte(utilisateurId: number, maintenant = new Date()): Promise<CentreCarte[]> {
  const [cartes, centres] = await Promise.all([
    chargerTableauProspects({ equipe: true, utilisateurId }),
    prisma.crmCentre.findMany({
      select: { id: true, organisationId: true, nom: true, ville: true, ris: true, geocodageStatut: true, latitude: true, longitude: true, majLe: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return assemblerCentres(
    cartes.map((c) => ({
      id: c.id, nom: c.nom, etape: c.etape, ris: c.ris, concurrentId: c.concurrentId, concurrentGagnantId: c.concurrentGagnantId,
      dateSortie: c.dateSortie, responsableId: c.responsableId, responsable: c.responsable, temperature: c.temperature,
      montant: c.montant && { centimes: c.montant.centimes, libelle: c.montant.libelle },
    })),
    centres.map((c) => ({
      id: c.id, organisationId: c.organisationId, nom: c.nom, ville: c.ville, ris: c.ris, majLe: c.majLe,
      geocodageStatut: c.geocodageStatut, latitude: c.latitude?.toFixed(6) ?? null, longitude: c.longitude?.toFixed(6) ?? null,
    })),
    maintenant,
  );
}
