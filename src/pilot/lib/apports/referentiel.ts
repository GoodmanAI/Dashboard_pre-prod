/**
 * Le référentiel de l'apport d'affaires (CHOIX.md, C-63), repris du calculateur
 * des apporteurs. Les listes vivent dans le code, comme la fiche client (C-59) :
 * les compléter ne demande pas de migration. Un code ne se renomme jamais ; une
 * valeur abandonnée reste lisible.
 */

/** Les modalités d'imagerie, dans l'ordre du calculateur. */
export const MODALITES = [
  { code: "RX", libelle: "Radiologie conventionnelle (RX)" },
  { code: "ECHO", libelle: "Échographie" },
  { code: "DOP", libelle: "Doppler" },
  { code: "MAMMO", libelle: "Mammographie" },
  { code: "CT", libelle: "Scanner (CT)" },
  { code: "IRM", libelle: "IRM" },
  { code: "DEXA", libelle: "Ostéodensitométrie (DEXA)" },
  { code: "CBCT", libelle: "Imagerie dentaire / Cone Beam" },
  { code: "PANO", libelle: "Panoramique dentaire" },
  { code: "INTERV", libelle: "Imagerie interventionnelle mammaire" },
  { code: "EOS", libelle: "EOS" },
] as const;
export const CODES_MODALITE = MODALITES.map((m) => m.code) as string[];
export const libelleModalite = (code: string) => MODALITES.find((m) => m.code === code)?.libelle ?? code;

/** Le parcours de commande : le statut est l'étape la plus avancée dont la date est renseignée. */
export const ETAPES_COMMANDE = [
  { cle: "prospect", libelle: "Prospect", court: "Prospect", champ: null, aide: "Identifié, à valider par Neuracorp" },
  { cle: "envoyee", libelle: "Bon de commande envoyé", court: "BC envoyé", champ: "bcEnvoyeLe", aide: null },
  { cle: "validee", libelle: "Commande validée", court: "Validée", champ: "commandeValideeLe", aide: null },
  { cle: "installee", libelle: "Commande installée", court: "Installée", champ: "commandeInstalleeLe", aide: null },
] as const;
export type StatutCommande = (typeof ETAPES_COMMANDE)[number]["cle"];
export type ChampCommande = "bcEnvoyeLe" | "commandeValideeLe" | "commandeInstalleeLe";
export const STATUTS_COMMANDE = ETAPES_COMMANDE.map((e) => e.cle) as StatutCommande[];
export const etapeCommande = (cle: StatutCommande) => ETAPES_COMMANDE.find((e) => e.cle === cle)!;

/** Le type de groupe, au sens du contrat d'apporteur. Distinct du type de client de Pilot. */
export const CATEGORIES = {
  independant: "Groupe privé indépendant",
  investisseur: "Groupe privé investisseur",
  public: "Hôpital public",
  prive: "Hôpital privé",
} as const;
export type Categorie = keyof typeof CATEGORIES;
export const CLES_CATEGORIE = Object.keys(CATEGORIES) as Categorie[];

export const INVESTISSEURS = ["ANODEA", "SIMAGO", "VIDI CAPITAL", "IMDEV", "FIT", "EXCELLENCE IMAGERIE", "IMAPOLE", "CARDINET"] as const;

/** Les RIS en place rencontrés chez les groupes de radiologie. « Autre » se saisit en clair. */
export const RIS_CONNUS = [
  "XPLORE - EDL", "TSXCARE - THERASOFT", "M-RIS - DOCAPOSTE SANTÉ", "GXD5 - ENNOVACOM", "IMAGING - EVOLUCARE",
  "ONE MANAGER - SOFTWAY", "VENUS - SOFTWAY", "SMART RIS - IMSOFTWARE", "DX IMAGE - DEDALUS",
] as const;
const MOTS_RIS: [string, string][] = [
  ["XPLORE", "XPLORE - EDL"], ["EDL", "XPLORE - EDL"], ["TSX", "TSXCARE - THERASOFT"], ["THERASOFT", "TSXCARE - THERASOFT"],
  ["M-RIS", "M-RIS - DOCAPOSTE SANTÉ"], ["DOCAPOSTE", "M-RIS - DOCAPOSTE SANTÉ"], ["GXD", "GXD5 - ENNOVACOM"],
  ["ENNOVACOM", "GXD5 - ENNOVACOM"], ["ENOVACOM", "GXD5 - ENNOVACOM"], ["EVOLUCARE", "IMAGING - EVOLUCARE"],
  ["ONE MANAGER", "ONE MANAGER - SOFTWAY"], ["VENUS", "VENUS - SOFTWAY"], ["SMART RIS", "SMART RIS - IMSOFTWARE"],
  ["IMSOFT", "SMART RIS - IMSOFTWARE"], ["DX IMAGE", "DX IMAGE - DEDALUS"], ["DEDALUS", "DX IMAGE - DEDALUS"],
];
/** Le RIS connu que désigne un texte (« Xplore (EDL) » donne « XPLORE - EDL »), sinon null. */
export function risReconnu(texte: string | null | undefined): string | null {
  const t = String(texte ?? "").trim().toUpperCase();
  if (!t) return null;
  const exact = RIS_CONNUS.find((r) => r === t);
  if (exact) return exact;
  for (const [mot, ris] of MOTS_RIS) if (t.includes(mot)) return ris;
  return null;
}

export const DECISIONS = { attente: "En attente", valide: "Validé", refuse: "Refusé" } as const;
export type Decision = keyof typeof DECISIONS;
export const CLES_DECISION = Object.keys(DECISIONS) as Decision[];

export const PERIMETRES = {
  sites: "Sites identifiés dans la fiche",
  groupe: "Ensemble des entités contrôlées par le groupe (L. 233-3)",
} as const;
export type Perimetre = keyof typeof PERIMETRES;

/** Le mode d'installation : depuis le lot S, la base du tarif d'installation dans la grille (par site, par groupe, par salle). */
export const MODES_INSTALLATION = { site: "par site", groupe: "par groupe", salle: "par salle" } as const;
export type ModeInstallation = keyof typeof MODES_INSTALLATION;

export const STATUTS_FACTURE = {
  a_emettre: "À émettre", emise: "Émise", payee: "Payée", encours: "Mois en cours", retard: "Échue, non payée",
} as const;
export type StatutFacture = keyof typeof STATUTS_FACTURE;

export const TYPES_PRESTATAIRE_DEFAUT = ["DSI Groupe", "Presta Informatique", "Presta Téléphonie", "Opérateur Téléphonie"];

/**
 * Les réglages par défaut, ceux du calculateur. Les prix n'en font plus partie
 * (lot S) : ils viennent de la grille tarifaire en vigueur (`src/lib/apports/prix.ts`).
 * La TVA reste ici : elle sert à montrer aux apporteurs les montants TTC.
 */
export const PARAMETRES_DEFAUT = {
  tvaPdm: 2000,
  seuil1Centimes: 400000, seuil2Centimes: 1250000, taux1Pdm: 250, taux2Pdm: 500, taux3Pdm: 1000,
  autresClientsCentimes: 0, delaiEncaissementMois: 1, dureeCommissionMois: 0, horizonMois: 18,
  inclureValidees: true, inclureBcEnvoyes: true, inclureProspects: false,
  tvaFacturePdm: 2000, delaiPaiementJours: 15,
  clientNom: "Neuracorp AI, SAS", clientAdresse: "17 rue de la Marine, 56950 Crach", clientRcs: "RCS Lorient 933 852 717",
  typesPrestataires: TYPES_PRESTATAIRE_DEFAUT, apporteurParDefautId: null as number | null,
};

/** « de septembre », « d'octobre », « d'Apporteur Un » : l'élision devant une voyelle. */
export const de = (texte: string) => (/^[aeiouyàâäéèêëîïôöûüœ]/i.test(texte.trim()) ? `d'${texte}` : `de ${texte}`);
