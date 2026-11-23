import type { CrmBaseTarif, CrmTypeLigne } from "@prisma/client";
import { PRODUIT_DESK, PRODUIT_KONNECT, PRODUIT_NOSHOW, PRODUIT_TALK } from "@/pilot/lib/checklist/definition";
import { LIBELLES_LIGNE } from "@/pilot/lib/propositions/regles";

/**
 * Le rôle d'un tarif (lot S) : ce qu'il est pour le préremplissage, l'apport
 * d'affaires et l'estimation, qui le retrouvent par son code. Le rôle fixe le
 * code ; l'utilisateur choisit un rôle, jamais un code, et le code ne se tire
 * jamais d'un libellé (un libellé est du texte saisi). « Autre prestation »
 * reçoit un code opaque, `TARIF_<n>`, unique dans la grille.
 *
 * Fonctions pures : la page, la validation et le service s'en servent tous, la
 * garde reste côté serveur.
 */

export const ROLES_TARIF = ["TALK", "KONNECT", "DESK", "NOSHOW", "CONNECTEUR_RIS", "INSTALLATION_TALK", "INSTALLATION_KONNECT", "FORMATION_POC", "AUTRE"] as const;
export type RoleTarif = (typeof ROLES_TARIF)[number];
/** Un rôle qui a son propre code, lu par les calculs. */
export type RoleReference = Exclude<RoleTarif, "AUTRE">;

type DefinitionRole = {
  /** Le nom du rôle à l'écran : « Abonnement Talk ». */
  libelle: string;
  /** Le nom dans une phrase : « l'abonnement Talk ». */
  nom: string;
  /** Le libellé proposé à l'ajout, modifiable. */
  libelleParDefaut: string;
  /** Les types permis, le premier proposé par défaut. */
  types: readonly CrmTypeLigne[];
  /** Les bases permises, la première proposée par défaut. */
  bases: readonly CrmBaseTarif[];
  /** Le produit du catalogue (`Product.name`) auquel le tarif se relie, ou null. */
  produit: string | null;
};

const BASES_MONTANT: readonly CrmBaseTarif[] = ["PAR_SALLE", "PAR_SITE", "PAR_ORGANISATION"];
/** Une installation se facture d'abord par site, comme la reprise de l'apport. */
const BASES_INSTALLATION: readonly CrmBaseTarif[] = ["PAR_SITE", "PAR_ORGANISATION", "PAR_SALLE"];

export const ROLES: Record<RoleTarif, DefinitionRole> = {
  FORMATION_POC: { libelle: "Formation du POC", nom: "la formation du POC", libelleParDefaut: "Formation du POC", types: ["PRESTATION"], bases: ["PAR_ORGANISATION"], produit: null },
  TALK: { libelle: "Abonnement Talk", nom: "l'abonnement Talk", libelleParDefaut: "Talk", types: ["ABONNEMENT"], bases: BASES_MONTANT, produit: PRODUIT_TALK },
  KONNECT: { libelle: "Abonnement Konnect", nom: "l'abonnement Konnect", libelleParDefaut: "Konnect", types: ["ABONNEMENT"], bases: BASES_MONTANT, produit: PRODUIT_KONNECT },
  DESK: { libelle: "Abonnement Desk", nom: "l'abonnement Desk", libelleParDefaut: "Desk", types: ["ABONNEMENT"], bases: BASES_MONTANT, produit: PRODUIT_DESK },
  NOSHOW: { libelle: "Abonnement NoShow", nom: "l'abonnement NoShow", libelleParDefaut: "NoShow", types: ["ABONNEMENT"], bases: BASES_MONTANT, produit: PRODUIT_NOSHOW },
  CONNECTEUR_RIS: { libelle: "Connecteur RIS", nom: "le connecteur RIS", libelleParDefaut: "Connecteur RIS", types: ["ABONNEMENT"], bases: ["POURCENTAGE"], produit: null },
  INSTALLATION_TALK: {
    libelle: "Installation Talk", nom: "l'installation Talk", libelleParDefaut: "Installation et formation Talk", types: ["MISE_EN_SERVICE"], bases: BASES_INSTALLATION, produit: PRODUIT_TALK,
  },
  INSTALLATION_KONNECT: {
    libelle: "Installation Konnect", nom: "l'installation Konnect", libelleParDefaut: "Installation et formation Konnect", types: ["MISE_EN_SERVICE"], bases: BASES_INSTALLATION, produit: PRODUIT_KONNECT,
  },
  AUTRE: {
    libelle: "Autre prestation", nom: "cette prestation", libelleParDefaut: "", types: ["PRESTATION", "MISE_EN_SERVICE", "ABONNEMENT"],
    bases: ["PAR_ORGANISATION", "PAR_SITE", "PAR_SALLE", "POURCENTAGE"], produit: null,
  },
};

const REFERENCES = new Set<string>(ROLES_TARIF.filter((r) => r !== "AUTRE"));
const CODE_OPAQUE = /^TARIF_([1-9][0-9]{0,8})$/;

export const estCodeReference = (code: string): code is RoleReference => REFERENCES.has(code);
export const estCodeOpaque = (code: string) => CODE_OPAQUE.test(code);

/** Le rôle d'un tarif d'après son code. Un code qui n'est pas un code de référence est une autre prestation. */
export function roleDuCode(code: string): RoleTarif {
  return estCodeReference(code) ? code : "AUTRE";
}

/**
 * Le code qu'on peut écrire au journal : un code de référence ou un code opaque
 * `TARIF_<n>`, qui ne sont pas du texte saisi. Un code plus ancien, tiré d'un
 * libellé avant les rôles, n'y va jamais (C-27).
 */
export function codeJournal(code: string): string | undefined {
  return estCodeReference(code) || estCodeOpaque(code) ? code : undefined;
}

/** Le code d'un tarif ajouté : celui du rôle, ou le code opaque suivant pour une autre prestation. */
export function codePourRole(role: RoleTarif, existants: readonly string[]): string {
  if (role !== "AUTRE") return role;
  const n = existants.reduce((max, c) => { const m = CODE_OPAQUE.exec(c); return m ? Math.max(max, Number(m[1])) : max; }, 0);
  return `TARIF_${n + 1}`;
}

/** Les rôles qu'on peut encore ajouter à une grille : un rôle de référence une seule fois, une autre prestation toujours. */
export function rolesDisponibles(codes: readonly string[]): RoleTarif[] {
  const pris = new Set(codes);
  return ROLES_TARIF.filter((r) => r === "AUTRE" || !pris.has(r));
}

export const messageRoleDejaPris = (role: RoleTarif) =>
  `Cette grille a déjà un tarif « ${ROLES[role].libelle} ». Modifiez-le plutôt que d'en ajouter un second.`;

/**
 * Pourquoi un type ou une base ne conviennent pas au rôle, ou null. Un abonnement
 * Talk est un abonnement ; le connecteur RIS est un pourcentage du montant des
 * salles ; une installation se facture une fois.
 */
export function refusRole(role: RoleTarif, t: { type: CrmTypeLigne; base: CrmBaseTarif }): { champ: "type" | "base"; message: string } | null {
  const d = ROLES[role];
  if (!d.types.includes(t.type)) {
    return { champ: "type", message: `Un tarif « ${d.libelle} » est de type « ${d.types.map((v) => LIBELLES_LIGNE[v]).join(" » ou « ")} ».` };
  }
  if (!d.bases.includes(t.base)) {
    if (role === "FORMATION_POC") return { champ: "base", message: "La formation du POC se facture une fois par dossier. Choisissez par organisation." };
    return { champ: "base", message: d.bases.length === 1 && d.bases[0] === "POURCENTAGE"
      ? `Un tarif « ${d.libelle} » est un pourcentage du montant des salles.`
      : `Un tarif « ${d.libelle} » n'est pas un pourcentage : choisissez par salle, par site ou par organisation.` };
  }
  return null;
}

/** Un rôle relié à un produit du catalogue (Talk, Konnect, Desk, NoShow et leurs installations). */
export const estRoleProduit = (role: RoleTarif) => ROLES[role].produit !== null;

/** Ce que l'écran dit d'un tarif de produit sans produit relié. */
export const PRODUIT_NON_RELIE = "Produit non relié : les lignes préremplies seront hors catalogue.";

/**
 * Le rôle fixe aussi le produit : un tarif « Abonnement Talk » se relie à
 * LyraeTalk ou à aucun produit, jamais à Konnect (ses lignes préremplies
 * gagneraient l'opportunité du mauvais produit). Pourquoi le produit ne convient
 * pas, ou null. `nomProduit` : le nom (`Product.name`) du produit relié, null
 * sans produit. Un rôle sans produit (connecteur RIS, autre prestation) est libre.
 */
export function refusProduit(role: RoleTarif, nomProduit: string | null): string | null {
  const attendu = ROLES[role].produit;
  if (attendu === null || nomProduit === null || nomProduit === attendu) return null;
  return `Un tarif « ${ROLES[role].libelle} » se relie au produit ${attendu}, ou à aucun produit.`;
}

/**
 * Ce que la page Tarifs dit du produit d'un tarif de rôle produit, ou null : un
 * produit absent (lignes hors catalogue) ou un mauvais produit, hérité d'avant
 * la règle (`refusProduit`).
 */
export function avertissementProduit(role: RoleTarif, nomProduit: string | null): string | null {
  if (!estRoleProduit(role)) return null;
  if (nomProduit === null) return PRODUIT_NON_RELIE;
  return refusProduit(role, nomProduit) === null ? null : `Relié à ${nomProduit}, qui n'est pas le produit de ce rôle. ${refusProduit(role, nomProduit)}`;
}
