/**
 * Utilitaires anti-bruteforce sur le login (Phase 2 auth hardening).
 *
 * Deux couches complémentaires :
 *  1. Rate limit par IP  → protège d'un attaquant qui tente plein d'emails
 *  2. Account lockout    → protège d'un attaquant qui alterne les IPs (VPN
 *                          rotatif, botnet) mais cible le même compte
 *
 * Storage : PostgreSQL via Prisma (pas de Redis nécessaire).
 * - Table `LoginAttempt` : historique par IP/email pour rate limit
 * - Colonnes `User.failedLoginAttempts` et `User.lockedUntil` pour lockout
 */

import { prisma } from "@/lib/prisma";

// ---------- Constantes ajustables ----------

/**
 * Fenêtre de temps sur laquelle on compte les échecs par IP.
 * Alignée sur ACCOUNT_LOCK_DURATION_MS (5 min) — un user bloqué par IP
 * après trop d'échecs attend le même délai qu'un compte locké, ce qui
 * évite l'incohérence "compte débloqué mais IP encore rate-limitée".
 */
export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 min
/** Nb d'échecs par IP dans la fenêtre au-delà duquel on bloque. */
export const RATE_LIMIT_MAX_FAILURES = 5;

/** Nb d'échecs consécutifs par compte au-delà duquel on lock. */
export const ACCOUNT_LOCK_THRESHOLD = 5;
/**
 * Durée du lock (à partir du dépassement du seuil).
 * Baissée de 15 → 5 min (2026-07-15) pour améliorer l'UX : un utilisateur
 * légitime qui a juste oublié son mot de passe n'est pas puni pendant un
 * quart d'heure. La protection reste efficace (5 tentatives + 5 min = un
 * bruteforce naïf plafonne à ~60 tentatives/heure/compte).
 */
export const ACCOUNT_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 min

// ---------- Types ----------

export type RateLimitCheck =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number };

export type UserLockInfo = {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
};

// ---------- Helpers d'IP ----------

/**
 * Extrait l'IP de l'appelant depuis les headers de la requête. Prend en compte
 * les reverse-proxies (Nginx, Cloudflare) via `x-forwarded-for`.
 *
 * Fallback `"unknown"` si aucune source n'est disponible — dans ce cas le
 * rate limit s'applique quand même à tous les appels sans IP (protection
 * par défaut prudente).
 */
export function extractClientIp(headers: Headers | Record<string, string | undefined>): string {
  const get = (name: string): string | undefined => {
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    return headers[name] ?? headers[name.toLowerCase()];
  };
  // Nginx / Cloudflare mettent l'IP réelle en tête de x-forwarded-for
  const xff = get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = get("x-real-ip");
  if (realIp) return realIp.trim();
  const cfIp = get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return "unknown";
}

// ---------- Rate limit par IP ----------

/**
 * Vérifie si l'IP a dépassé le seuil d'échecs récents. Retourne :
 *  - `{ limited: false }` si l'IP peut continuer
 *  - `{ limited: true, retryAfterSeconds }` si elle doit patienter
 *
 * Compte uniquement les tentatives échouées (success=false).
 */
export async function checkIpRateLimit(ip: string): Promise<RateLimitCheck> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const failures = await prisma.loginAttempt.count({
    where: {
      ip,
      success: false,
      createdAt: { gte: since },
    },
  });
  if (failures < RATE_LIMIT_MAX_FAILURES) return { limited: false };
  // Retry après la première tentative de la fenêtre — approximation prudente.
  const oldest = await prisma.loginAttempt.findFirst({
    where: { ip, success: false, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const retryAt = oldest
    ? new Date(oldest.createdAt.getTime() + RATE_LIMIT_WINDOW_MS)
    : new Date(Date.now() + RATE_LIMIT_WINDOW_MS);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((retryAt.getTime() - Date.now()) / 1000)
  );
  return { limited: true, retryAfterSeconds };
}

/** Journalise une tentative de connexion (succès ou échec) pour audit + rate limit. */
export async function recordLoginAttempt(
  ip: string,
  email: string | null,
  success: boolean
): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: { ip, email: email ?? null, success },
    });
  } catch (err) {
    // Ne bloque JAMAIS le login sur un problème d'écriture logs (fail-open).
    console.error("[loginSecurity] failed to record attempt:", err);
  }
}

// ---------- Account lockout ----------

/**
 * Vérifie si un utilisateur est actuellement verrouillé.
 * Retourne le nb de secondes avant déblocage, ou null si pas verrouillé.
 */
export function getLockRemainingSeconds(user: UserLockInfo): number | null {
  if (!user.lockedUntil) return null;
  const remaining = user.lockedUntil.getTime() - Date.now();
  if (remaining <= 0) return null;
  return Math.ceil(remaining / 1000);
}

/** Résultat de `handleFailedLogin` — utilisé pour construire le message renvoyé au user. */
export type FailedLoginResult = {
  /** Compteur d'échecs après incrément (0 si l'update a échoué). */
  failedAttempts: number;
  /** true si l'incrément a fait dépasser le seuil et a locké le compte. */
  justLocked: boolean;
  /** Tentatives restantes avant lock (0 si déjà locké). */
  remainingAttempts: number;
};

/**
 * À appeler après un login échoué. Incrémente le compteur et verrouille le
 * compte s'il atteint le seuil. Atomique via update. Retourne l'état post-
 * incrément pour permettre à l'appelant (authOptions) de construire un message
 * clair pour l'utilisateur ("il vous reste 2 tentatives" / "compte bloqué").
 */
export async function handleFailedLogin(userId: number): Promise<FailedLoginResult> {
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: { increment: 1 },
      },
      select: { failedLoginAttempts: true },
    });
    const justLocked = updated.failedLoginAttempts >= ACCOUNT_LOCK_THRESHOLD;
    if (justLocked) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS),
        },
      });
    }
    return {
      failedAttempts: updated.failedLoginAttempts,
      justLocked,
      remainingAttempts: Math.max(0, ACCOUNT_LOCK_THRESHOLD - updated.failedLoginAttempts),
    };
  } catch (err) {
    console.error("[loginSecurity] failed to handle failed login:", err);
    // Fail-open : on n'a pas pu tracer l'échec, on renvoie un état neutre pour
    // ne pas bloquer plus le user que nécessaire.
    return { failedAttempts: 0, justLocked: false, remainingAttempts: ACCOUNT_LOCK_THRESHOLD };
  }
}

/**
 * À appeler après un login réussi. Reset le compteur et le lock.
 * Ne fait rien si déjà à 0 / null (pas de coût inutile).
 */
export async function handleSuccessfulLogin(
  userId: number,
  currentFailedAttempts: number,
  currentLockedUntil: Date | null
): Promise<void> {
  if (currentFailedAttempts === 0 && currentLockedUntil === null) return;
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  } catch (err) {
    console.error("[loginSecurity] failed to reset lock state:", err);
  }
}
