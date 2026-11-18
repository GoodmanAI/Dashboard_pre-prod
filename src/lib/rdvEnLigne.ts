/**
 * Ponts de Talk vers Konnect (18/11/2026) : l'adresse de la page du site du centre
 * qui porte le portail de prise de RDV en ligne. Domaine `konnect.rdv-en-ligne`.
 * Plan : `lyrae/plans/2026-11-ponts-talk-konnect.md` (§6 et §7), `DECISIONS.md` du 16/11.
 * -----------------------------------------------------------------------------
 * Module PUR : importé par l'écran d'installation et par `/api/product-config`.
 *
 * Le lien envoyé au patient par le robot est celui du **site du client** (la page qui
 * porte l'iframe, ex. une page de `ch-menton.fr`), jamais l'adresse de notre portail
 * (décision 6 d'Enzo). L'équipe la saisit à l'installation : c'est elle qui sait où le
 * prestataire du site a posé l'iframe.
 *
 * Konnect ne lit pas ce domaine. Il descend au robot dans `site.rdvEnLigne` de
 * `GET /api/configuration` (`rdvEnLigneLecture.ts`), seulement si le client a aussi
 * le produit Konnect. Vide : le robot ne propose jamais la prise de RDV en ligne.
 */

export const DOMAINE_RDV_EN_LIGNE = "konnect.rdv-en-ligne";

/**
 * Le lien part dans un SMS de 160 caractères avec le nom du centre : une adresse plus
 * longue le coupe en deux messages. Au-delà, mieux vaut un lien court du site.
 */
export const URL_RDV_EN_LIGNE_MAX = 120;

export type ReglageRdvEnLigne = { url: string | null };

/** L'adresse si elle est utilisable telle quelle par un patient, sinon `null`. */
function urlPropre(brut: string): string | null {
  const t = brut.trim();
  if (!t || /\s/.test(t) || t.length > URL_RDV_EN_LIGNE_MAX) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return null;
    return t;
  } catch {
    return null;
  }
}

/** Lecture tolérante de la valeur stockée : une adresse illisible vaut « aucune ». */
export function lireRdvEnLigne(brut: unknown): ReglageRdvEnLigne {
  const v = brut && typeof brut === "object" ? (brut as { url?: unknown }).url : undefined;
  return { url: typeof v === "string" ? urlPropre(v) : null };
}

export function validerRdvEnLigne(
  brut: unknown
): { valeur: ReglageRdvEnLigne } | { erreur: string } {
  if (!brut || typeof brut !== "object") return { erreur: "Valeur absente." };
  const v = (brut as { url?: unknown }).url;
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) {
    return { valeur: { url: null } };
  }
  if (typeof v !== "string") return { erreur: "L'adresse doit être un texte." };
  const t = v.trim();
  if (t.length > URL_RDV_EN_LIGNE_MAX) {
    return {
      erreur: `L'adresse fait ${t.length} caractères, ${URL_RDV_EN_LIGNE_MAX} au plus : elle part dans un SMS. Demandez au centre un lien plus court vers la même page.`,
    };
  }
  const url = urlPropre(t);
  if (!url) {
    return {
      erreur:
        "Cette adresse n'est pas valide. Copiez-la depuis le navigateur, elle commence par https://.",
    };
  }
  return { valeur: { url } };
}
