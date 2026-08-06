/**
 * Slug generator pour les ModuleInfoItem (chantier 2026-08-05).
 *
 * Convertit une question francaise en slug URL-safe :
 *   "En cas d'examen demande en urgence, est-il possible..."
 *     -> "en-cas-d-examen-demande-en-urgence-est-il-possible"
 *
 * Truncate a 60 chars pour rester lisible dans les logs Azure et
 * l'URL cote consommateur. Depduplication via suffixe -2, -3, etc.
 * geree dans l'endpoint POST (necessite acces DB).
 */

const MAX_SLUG_LENGTH = 60;

/**
 * Normalise un string francais en slug kebab-case URL-safe :
 *   - lowercase
 *   - retire les accents (NFD + strip diacritics)
 *   - remplace tout non-[a-z0-9] par "-"
 *   - collapse les "-" multiples et trim leading/trailing "-"
 *   - truncate a MAX_SLUG_LENGTH
 */
export function slugifyQuestion(input: string): string {
  if (!input) return "";
  const normalized = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
}

/**
 * Calcule un slug unique pour un userProductId donne en verifiant les
 * collisions parmi les slugs existants passes en argument. Si `base`
 * est deja pris, retourne `base-2`, `base-3`, etc.
 *
 * Usage cote endpoint POST :
 *   const existing = await prisma.moduleInfoItem.findMany({
 *     where: { userProductId }, select: { id: true },
 *   });
 *   const slug = uniqueSlug(slugifyQuestion(question), existing.map(e => e.id));
 */
export function uniqueSlug(base: string, existingSlugs: string[]): string {
  if (!base) base = "item";
  const set = new Set(existingSlugs);
  if (!set.has(base)) return base;
  // Reserve la place du suffixe AVANT troncature. Sinon, une base deja
  // longue de MAX_SLUG_LENGTH voit son suffixe "-2" tronque, et le
  // candidate reste identique a la base -> boucle infinie.
  for (let i = 2; i < 10_000; i++) {
    const suffix = `-${i}`;
    const allowed = MAX_SLUG_LENGTH - suffix.length;
    const candidate = base.slice(0, allowed).replace(/-+$/g, "") + suffix;
    if (!set.has(candidate)) return candidate;
  }
  // Extreme : fallback (ne devrait jamais arriver ; Date.now() interdit
  // dans du code applicatif teste ? OK ici, c'est un helper server-side).
  const ts = String(Date.now());
  const allowed = MAX_SLUG_LENGTH - ts.length - 1;
  return base.slice(0, allowed).replace(/-+$/g, "") + "-" + ts;
}
