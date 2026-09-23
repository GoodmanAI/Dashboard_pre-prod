/**
 * Les motifs d'une demande de rappel LyraeKonnect (18/09/2026).
 *
 * Plan : `lyrae/plans/2026-09-konnect-demandes-bloquees.md`. Partagé par la route, qui
 * valide ce que Konnect envoie, et par l'écran, qui les affiche et les filtre.
 *
 * CE SONT DES VALEURS D'ÉNUMÉRATION ÉCHANGÉES AVEC KONNECT : en ajouter est sûr, en
 * renommer casse silencieusement les dépôts (règle 2 du workspace). Le libellé, lui,
 * se change librement.
 *
 * `urgent` fixe la priorité côté Dashboard : Konnect dit ce qui s'est passé, le
 * Dashboard décide de l'ordre de la file.
 */
export const MOTIFS_RAPPEL = {
  examen_non_reservable: { libelle: "Examen à réserver par téléphone", urgent: false },
  plusieurs_examens: { libelle: "Plusieurs examens", urgent: false },
  ordonnance_illisible: { libelle: "Ordonnance à lire", urgent: false },
  examen_non_trouve: { libelle: "Examen non trouvé par le patient", urgent: false },
  aucun_creneau: { libelle: "Aucun créneau en ligne", urgent: false },
  incident_reservation: { libelle: "Problème pendant la réservation", urgent: false },
  contre_indication: { libelle: "Contre-indication à vérifier", urgent: true },
  // 23/09/2026 : le rendez-vous est pris, mais l'ordonnance n'a pas pu être rattachée au
  // logiciel du centre. Pas un rappel du patient : la secrétaire télécharge l'ordonnance
  // par le lien et l'attache à la main. Même file, parce que c'est la seule.
  ordonnance_a_rattacher: { libelle: "Ordonnance à rattacher au logiciel", urgent: false },
} as const;

export type MotifRappel = keyof typeof MOTIFS_RAPPEL;

export const MOTIF_PAR_DEFAUT: MotifRappel = "examen_non_reservable";

export function estMotifRappel(valeur: unknown): valeur is MotifRappel {
  return typeof valeur === "string" && Object.prototype.hasOwnProperty.call(MOTIFS_RAPPEL, valeur);
}
