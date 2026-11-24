import type { CrmTypeOrganisation } from "@prisma/client";

/**
 * Le référentiel de la fiche client (CHOIX.md, C-59), tiré de deux ans
 * d'échanges commerciaux : ce que l'équipe se demande sans cesse sur un centre.
 * Les listes vivent dans le code, comme la check-list (C-05) : les compléter ne
 * demande pas de migration. Une valeur abandonnée reste lisible.
 */

export const TYPES_ORGANISATION: Record<CrmTypeOrganisation, string> = {
  CABINET: "Cabinet", GROUPE_PRIVE: "Groupe privé", CLINIQUE: "Clinique", GIE: "GIE", HOPITAL: "Hôpital", CHU: "CHU",
};

/** Éditeurs de RIS rencontrés, du plus fréquent au plus rare. Saisie libre possible. */
export const EDITEURS_RIS = ["Xplore (EDL)", "Enovacom", "Therasoft", "Softway (One Manager)", "Evolucare", "Intuitim", "DPI Sillage", "Plusieurs RIS", "Aucun RIS"] as const;

/**
 * Le métier d'un contact (C-88), proposé à la saisie, qui reste libre. Chez le
 * client d'abord, puis ses prestataires. Ne dit rien du rôle dans la décision.
 */
export const METIERS_CONTACT = [
  "Gérant", "Directeur", "Responsable de gestion", "Radiologue", "Manipulateur radio", "Cadre de santé",
  "Secrétaire", "Responsable des secrétaires", "Comptabilité", "Prestataire informatique", "Prestataire téléphonie",
  "Prestataire réseau", "Éditeur du RIS", "Commercial EDL", "Informatique interne",
] as const;

/** Comment le centre prend ses RDV aujourd'hui. Saisie libre possible. */
export const OUTILS_RDV = ["Téléphone seul", "Doctolib", "EasyDoct", "RDV internet du RIS", "Site internet du centre", "Robot vocal concurrent"] as const;

/** Ce qui bloque un déploiement, d'après le terrain. Plusieurs à la fois. */
export const BLOCAGES_TECHNIQUES = {
  API_EDITEUR: "API de l'éditeur du RIS pas encore ouverte",
  VERSION_RIS: "Version du RIS trop ancienne",
  RESEAU: "Réseau : filtrage IP, reverse proxy, VPN",
  RDV_EXTERNE: "Plages pas ouvertes au RDV externe",
  CODES_EXAMENS: "Codes examens différents selon les sites",
  TELEPHONIE: "Téléphonie : renvoi d'appels, matériel ancien",
  HDS_RGPD: "HDS, RGPD, DPO à consulter",
  DECISION_GHT: "Décision prise au niveau du GHT ou du groupe",
} as const;
export type CleBlocage = keyof typeof BLOCAGES_TECHNIQUES;
export const CLES_BLOCAGE = Object.keys(BLOCAGES_TECHNIQUES) as CleBlocage[];

/** D'où vient le client. */
export const ORIGINES = {
  SALON: "Salon (JFR, SantExpo, Medin)", APPORTEUR: "Apporteur d'affaires", EDL: "Commercial EDL",
  APPEL_OFFRES: "Appel d'offres", LINKEDIN: "LinkedIn", RESEAU: "Réseau personnel", AUTRE: "Autre",
} as const;
export type CleOrigine = keyof typeof ORIGINES;
export const CLES_ORIGINE = Object.keys(ORIGINES) as CleOrigine[];

/** Les équipements, un compte par modalité : champ, libellé du formulaire, singulier, pluriel. */
export const EQUIPEMENTS = [
  ["nombreIrm", "IRM", "IRM", "IRM"], ["nombreScanners", "Scanners", "scanner", "scanners"],
  ["nombreRadio", "Salles de radio", "salle de radio", "salles de radio"],
  ["nombreEcho", "Échographes", "échographe", "échographes"], ["nombreMammo", "Mammographes", "mammographe", "mammographes"],
] as const;
export type ChampEquipement = (typeof EQUIPEMENTS)[number][0];

/** « 2 IRM · 1 scanner · 3 salles de radio », ou null si rien n'est renseigné. */
export function resumeEquipements(o: Partial<Record<ChampEquipement, number | null>>): string | null {
  const morceaux = EQUIPEMENTS.flatMap(([champ, , un, plusieurs]) => (o[champ] ? [`${o[champ]} ${o[champ] === 1 ? un : plusieurs}`] : []));
  return morceaux.length ? morceaux.join(" · ") : null;
}
