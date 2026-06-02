import crypto from "crypto";

export const APPOINTMENT_MAX_ATTEMPTS = 3;
export const APPOINTMENT_LINK_TTL_DAYS = 7;

function getSecret(): string {
  const secret = process.env.APPOINTMENT_HMAC_SECRET;
  if (!secret) {
    throw new Error("APPOINTMENT_HMAC_SECRET non configurée dans l'environnement");
  }
  return secret;
}

export function buildAppointmentToken(
  rdvId: string,
  phone: string,
  centerId: number
): string {
  const payload = `${rdvId}|${normalizePhone(phone)}|${centerId}`;
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Parse une date au format ISO (YYYY-MM-DD) ou français (DD/MM/YYYY).
 * Renvoie une Date à minuit UTC, ou null si invalide.
 */
export function parseBirthdate(raw: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    return makeUtcDate(+y, +m, +d);
  }

  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (fr) {
    const [, d, m, y] = fr;
    return makeUtcDate(+y, +m, +d);
  }

  return null;
}

function makeUtcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt;
}

export function formatBirthdateIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Comparaison stricte d'identité.
 * `stored.birthdate` doit être au format `YYYY-MM-DD` (récupéré via TO_CHAR
 * côté SQL pour éviter les bugs de fuseau horaire du driver pg).
 */
export function checkIdentity(
  submitted: { firstname: string; lastname: string; birthdate: string },
  stored: { firstname: string; lastname: string; birthdate: string }
): boolean {
  const submittedDate = parseBirthdate(submitted.birthdate);
  if (!submittedDate) return false;
  return (
    normalizeName(submitted.firstname) === normalizeName(stored.firstname) &&
    normalizeName(submitted.lastname) === normalizeName(stored.lastname) &&
    formatBirthdateIso(submittedDate) === stored.birthdate
  );
}

export function defaultExpiresAt(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + APPOINTMENT_LINK_TTL_DAYS);
  return d;
}
