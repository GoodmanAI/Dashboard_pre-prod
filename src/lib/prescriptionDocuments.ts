/**
 * Regles du lien de depot d'ordonnance, partagees entre l'init, la page
 * patient et ses routes publiques.
 *
 * Depuis le 08/10/2026 un lien recoit jusqu'a MAX_DOCUMENTS_PAR_LIEN
 * documents (table "PrescriptionDocument"), en plusieurs fois, jusqu'a
 * l'heure du RDV. Plan : plans/2026-10-depot-ordonnance-plusieurs-documents.md
 * (workspace).
 */

export const MAX_DOCUMENTS_PAR_LIEN = 5;

/** Repli quand la date du RDV est absente ou deja passee a l'init. */
const DUREE_DE_REPLI_JOURS = 30;

/**
 * Le lien vit jusqu'a l'heure du RDV. Sans date exploitable (absente, ou deja
 * passee au moment de l'init, ce qui est anormal), on garde 30 jours pour ne
 * pas envoyer un lien deja mort.
 */
export function computeExpiresAt(
  now: Date,
  appointmentDate: Date | null
): Date {
  if (!appointmentDate || appointmentDate.getTime() < now.getTime()) {
    const repli = new Date(now);
    repli.setUTCDate(repli.getUTCDate() + DUREE_DE_REPLI_JOURS);
    return repli;
  }
  return appointmentDate;
}

/**
 * Le lien est-il encore consultable ? Faux une fois le RDV passe, et pour un
 * lien verrouille (trois mauvais codes).
 */
export function lienOuvert(
  status: string,
  expiresAt: Date,
  now = new Date()
): boolean {
  return (
    status !== "LOCKED" &&
    status !== "EXPIRED" &&
    expiresAt.getTime() > now.getTime()
  );
}
