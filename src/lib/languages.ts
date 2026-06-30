/**
 * Mapping mutualisé `stats.language` → libellé + drapeau.
 *
 * Le bot envoie une valeur par défaut "fr" sur tous les appels ; les autres
 * langues n'apparaissent que si une bascule de langue a eu lieu pendant l'appel
 * (détection auto ou question explicite). Tolérance aux ajouts futurs : valeur
 * inconnue → bucket `"autre"`.
 */

export type LanguageCode =
  | "fr"
  | "en"
  | "it"
  | "de"
  | "es"
  | "tr"
  | "ar"
  | "ar_ma"
  | "ar_dz"
  | "ar_tn"
  | "autre";

export type LanguageMeta = {
  label: string;
  /** Drapeau emoji (cosmétique, ignoré si la police ne le rend pas). */
  flag: string;
  /** Couleur d'accent pour les chips/charts. */
  color: string;
};

export const LANGUAGE_META: Record<LanguageCode, LanguageMeta> = {
  fr: { label: "Français", flag: "🇫🇷", color: "#1e40af" },
  en: { label: "Anglais", flag: "🇬🇧", color: "#7c3aed" },
  it: { label: "Italien", flag: "🇮🇹", color: "#16a34a" },
  de: { label: "Allemand", flag: "🇩🇪", color: "#f59e0b" },
  es: { label: "Espagnol", flag: "🇪🇸", color: "#ef4444" },
  tr: { label: "Turc", flag: "🇹🇷", color: "#dc2626" },
  ar: { label: "Arabe", flag: "🇸🇦", color: "#0891b2" },
  ar_ma: { label: "Arabe (Maroc)", flag: "🇲🇦", color: "#0d9488" },
  ar_dz: { label: "Arabe (Algérie)", flag: "🇩🇿", color: "#10b981" },
  ar_tn: { label: "Arabe (Tunisie)", flag: "🇹🇳", color: "#06b6d4" },
  autre: { label: "Autre", flag: "🌐", color: "#6b7280" },
};

/** Résout les métadonnées d'une langue. Tolère valeurs inconnues → "autre". */
export function getLanguageMeta(lang: string | null | undefined): {
  code: LanguageCode;
  label: string;
  flag: string;
  color: string;
  isKnown: boolean;
} {
  if (!lang) {
    return { code: "fr", ...LANGUAGE_META.fr, isKnown: true };
  }
  const meta = LANGUAGE_META[lang as LanguageCode];
  if (meta) {
    return { code: lang as LanguageCode, ...meta, isKnown: true };
  }
  return { code: "autre", ...LANGUAGE_META.autre, isKnown: false };
}

/** Détermine si la langue n'est PAS le défaut français (=> mérite un signal visuel). */
export function isNonDefaultLanguage(lang: string | null | undefined): boolean {
  if (!lang) return false;
  return lang !== "fr";
}
