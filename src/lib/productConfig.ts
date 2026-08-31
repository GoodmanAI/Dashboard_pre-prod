/**
 * Socle de configuration générique — registre des domaines (lot B).
 *
 * `ProductConfig` stocke un objet JSON par (centre, domaine) et le Dashboard ne
 * l'interprète pas : sa forme n'est connue que du produit consommateur. Ce
 * fichier est donc **le seul garde-fou** du socle, et il porte trois questions
 * auxquelles la table ne peut pas répondre :
 *
 * 1. **Ce domaine existe-t-il ?** Sans liste blanche, un appelant écrirait
 *    n'importe quel slug et la table deviendrait un dépotoir dont personne ne
 *    saurait plus ce qu'il contient ni qui le lit.
 * 2. **À quel produit appartient-il ?** Le produit n'est pas stocké en base — il
 *    se déduit du `userProductId`. C'est ici qu'on sait que
 *    `konnect.regles-fusion` concerne LyraeKonnect, et la route vérifie que le
 *    centre visé porte bien ce produit.
 * 3. **Quelle clé d'API a le droit de le lire ?** Chaque produit a la sienne
 *    (`KONNECT_API_KEY`, `BOT_API_KEY`), délibérément distinctes pour rester
 *    distinguables dans les logs d'audit consommés par Grafana. Sans ce lien,
 *    la clé de Konnect ouvrirait la configuration de LyraeTalk.
 *
 * **Ajouter un domaine se fait ici et nulle part ailleurs** — pas de migration,
 * c'est tout l'intérêt du socle. Retirer une entrée rend en revanche ses données
 * inaccessibles sans les supprimer : préférer la marquer obsolète.
 *
 * ⚠️ **Un domaine ne porte JAMAIS de secret.** Ce dépôt est public et son PostgreSQL
 * exposé (Q33, Q34). `konnect.ris-identite` porte l'adresse de l'instance et le code
 * de site, qui n'en sont pas : le code de site figure dans les messages d'erreur de
 * la passerelle, et l'adresse est bornée par une liste blanche côté Konnect. Le
 * token Xplore et les identifiants de connexion, eux, restent chiffrés chez Konnect
 * et n'ont rien à faire ici.
 */

import { PRODUITS, type SlugProduit } from "@/lib/produits";

export type Domaine = {
  /** Slug stable, namespacé par produit. Le renommer orpheline les données. */
  cle: string;
  produit: SlugProduit;
  /** Variable d'environnement portant la clé d'API du produit consommateur. */
  cleApiEnv: string;
  /** À quoi sert ce domaine — repris tel quel dans l'écran d'administration. */
  libelle: string;
};

/**
 * Domaines déclarés. **Vide de données à ce stade** : le lot B pose le mécanisme
 * et le vérifie à vide ; les lots C à E y déverseront les corpus de Konnect au
 * fur et à mesure, et le lot F ceux de LyraeTalk.
 *
 * Les entrées ci-dessous correspondent aux tables Konnect classées « générique »
 * dans le plan — celles que le cabinet règle à l'installation puis ne touche
 * plus. Les déclarer maintenant permet de tester le socle de bout en bout sans
 * attendre la migration des données.
 */
export const DOMAINES: Record<string, Domaine> = {
  "konnect.regles-etat": {
    cle: "konnect.regles-etat",
    produit: "konnect",
    cleApiEnv: "KONNECT_API_KEY",
    libelle: "Activation des règles cliniques par cabinet",
  },
  "konnect.regles-fusion": {
    cle: "konnect.regles-fusion",
    produit: "konnect",
    cleApiEnv: "KONNECT_API_KEY",
    libelle: "Règles de fusion d'examens",
  },
  "konnect.regles-coexistence": {
    cle: "konnect.regles-coexistence",
    produit: "konnect",
    cleApiEnv: "KONNECT_API_KEY",
    libelle: "Règles de coexistence d'examens",
  },
  "konnect.entonnoir-ordre": {
    cle: "konnect.entonnoir-ordre",
    produit: "konnect",
    cleApiEnv: "KONNECT_API_KEY",
    libelle: "Ordre d'affichage de l'entonnoir",
  },
  "konnect.slot-ranking": {
    cle: "konnect.slot-ranking",
    produit: "konnect",
    cleApiEnv: "KONNECT_API_KEY",
    libelle: "Ordre intelligent des créneaux",
  },
  "konnect.ris-identite": {
    cle: "konnect.ris-identite",
    produit: "konnect",
    cleApiEnv: "KONNECT_API_KEY",
    libelle: "Rattachement au logiciel de gestion du centre",
  },
  "konnect.synonymes": {
    cle: "konnect.synonymes",
    produit: "konnect",
    cleApiEnv: "KONNECT_API_KEY",
    libelle: "Synonymes d'examens propres au cabinet",
  },
};

export function trouverDomaine(cle: string | null): Domaine | null {
  if (!cle) return null;
  return DOMAINES[cle] ?? null;
}

/** Nom de `Product.name` attendu pour ce domaine — jamais une chaîne en dur. */
export function produitDuDomaine(domaine: Domaine): string {
  return PRODUITS[domaine.produit].nom;
}

/**
 * L'ETag d'un domaine. Faible (`W/`) : deux réponses de même version sont
 * équivalentes pour le consommateur sans être forcément identiques octet pour
 * octet (ordre des clés JSON, espaces).
 */
export function etagDe(version: number): string {
  return `W/"v${version}"`;
}

/**
 * La valeur stockée doit être un **objet** JSON à la racine.
 *
 * Un scalaire ou un tableau se lit très bien aujourd'hui mais interdit d'ajouter
 * un champ demain sans casser tous les lecteurs. Un objet, même réduit à
 * `{ items: [...] }`, reste extensible — c'est la seule contrainte de forme que
 * le socle impose, et elle vaut pour tous les domaines.
 */
export function estObjetJson(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}
