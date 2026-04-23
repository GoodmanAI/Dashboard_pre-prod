import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./authOptions";
import { prisma } from "./prisma";

/**
 * Session authentifiée enrichie avec id + rôle (comme retournée par `authOptions.callbacks.session`).
 */
export type AuthSession = {
  user: {
    id: number;
    role: "ADMIN" | "CLIENT";
    email?: string | null;
    name?: string | null;
  };
};

type AuthOk = { session: AuthSession; error?: never };
type AuthErr = { session?: never; error: NextResponse };
export type AuthResult = AuthOk | AuthErr;

/**
 * Paires multi-centres "hardcodées" (legacy) répliquant la logique du `CentreContext`
 * côté frontend : certains CLIENT ont accès à un autre CLIENT sans relation `managerId`
 * en base. À terme, cette config devrait être représentée en DB (via `managerId` ou
 * une table `UserCentreAccess`) et ce bloc supprimé des deux côtés.
 */
const SPECIAL_CENTRE_PAIRS: Record<number, number[]> = {
  7: [8],
  8: [7],
  12: [13],
  13: [12],
};

/**
 * Exige une session valide. À appeler au tout début d'un handler API.
 *
 * Usage :
 * ```ts
 * const auth = await requireAuth();
 * if (auth.error) return auth.error;
 * const { session } = auth;
 * ```
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = (await getServerSession(authOptions)) as AuthSession | null;
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session };
}

/**
 * Exige le rôle ADMIN. À appeler après `requireAuth`.
 * Renvoie `null` si OK, une `NextResponse` 403 sinon (à return depuis le handler).
 */
export function requireAdmin(session: AuthSession): NextResponse | null {
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Vérifie que la session a bien le droit d'accéder au `userProductId` demandé.
 *
 * Règles :
 * - ADMIN : accès à tous les UserProduct (bypass).
 * - CLIENT propriétaire direct (UserProduct.userId === session.user.id) : autorisé.
 * - CLIENT multi-centres (centreRole = ADMIN_USER) : autorisé si le UserProduct
 *   appartient à un utilisateur dont `managerId === session.user.id`.
 * - Sinon : 403.
 *
 * Renvoie `null` si autorisé, une `NextResponse` 403 sinon.
 */
export async function assertUserProductOwnership(
  session: AuthSession,
  userProductId: number
): Promise<NextResponse | null> {
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json(
      { error: "Invalid userProductId" },
      { status: 400 }
    );
  }

  // ADMIN : override total
  if (session.user.role === "ADMIN") return null;

  // CLIENT : propriétaire direct
  const direct = await prisma.userProduct.findFirst({
    where: { id: userProductId, userId: session.user.id },
    select: { id: true },
  });
  if (direct) return null;

  // CLIENT multi-centres : UserProduct d'un utilisateur qu'on gère
  const managed = await prisma.userProduct.findFirst({
    where: {
      id: userProductId,
      user: { managerId: session.user.id },
    },
    select: { id: true },
  });
  if (managed) return null;

  // CLIENT paire legacy (hardcodée — voir SPECIAL_CENTRE_PAIRS)
  const pairIds = SPECIAL_CENTRE_PAIRS[session.user.id];
  if (pairIds?.length) {
    const paired = await prisma.userProduct.findFirst({
      where: { id: userProductId, userId: { in: pairIds } },
      select: { id: true },
    });
    if (paired) return null;
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Vérifie que la session a bien le droit d'accéder aux données d'un `userId` ciblé.
 *
 * Règles :
 * - ADMIN : accès à tous les utilisateurs (bypass).
 * - CLIENT : accès à son propre `userId` ou à un utilisateur qu'il gère
 *   (`User.managerId === session.user.id`).
 * - Sinon : 403.
 */
export async function assertUserAccess(
  session: AuthSession,
  targetUserId: number
): Promise<NextResponse | null> {
  if (!Number.isFinite(targetUserId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  if (session.user.role === "ADMIN") return null;
  if (session.user.id === targetUserId) return null;

  const managed = await prisma.user.findFirst({
    where: { id: targetUserId, managerId: session.user.id },
    select: { id: true },
  });
  if (managed) return null;

  // Paire legacy hardcodée (voir SPECIAL_CENTRE_PAIRS)
  const pairIds = SPECIAL_CENTRE_PAIRS[session.user.id];
  if (pairIds?.includes(targetUserId)) return null;

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Vérifie une API key statique partagée avec un service externe (ex. bot Lyrae).
 * La clé attendue est lue depuis `process.env[envVar]`.
 * Renvoie `null` si OK, une `NextResponse` 401 sinon.
 */
export function requireApiKey(
  req: Request,
  envVar: string,
  headerName: string = "x-api-key"
): NextResponse | null {
  const expected = process.env[envVar];
  if (!expected) {
    // Config serveur manquante : on refuse par sécurité (fail closed).
    console.error(`[auth] ${envVar} non configurée dans l'environnement`);
    return NextResponse.json({ error: "Service misconfigured" }, { status: 500 });
  }
  const provided = req.headers.get(headerName);
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Auth mixte : accepte soit une API key de service (ex. bot Lyrae), soit une session utilisateur.
 *
 * - Si le header `x-api-key` est présent → valide contre `process.env[envVar]` :
 *   - match → retourne `{ bot: true }` (skip ownership check côté appelant)
 *   - mismatch → 401 immédiat
 * - Sinon → `requireAuth()` classique ; retourne `{ bot: false, session }` si OK.
 *
 * Usage :
 * ```ts
 * const auth = await requireAuthOrApiKey(req, "BOT_API_KEY");
 * if (auth.error) return auth.error;
 * if (!auth.bot) {
 *   // contexte user : appliquer ownership check
 *   const err = await assertUserProductOwnership(auth.session, userProductId);
 *   if (err) return err;
 * }
 * ```
 */
export async function requireAuthOrApiKey(
  req: Request,
  envVar: string,
  headerName: string = "x-api-key"
): Promise<
  | { bot: true; session?: never; error?: never }
  | { bot: false; session: AuthSession; error?: never }
  | { bot?: never; session?: never; error: NextResponse }
> {
  const provided = req.headers.get(headerName);
  if (provided) {
    const keyErr = requireApiKey(req, envVar, headerName);
    if (keyErr) return { error: keyErr };
    return { bot: true };
  }
  const auth = await requireAuth();
  if (auth.error) return { error: auth.error };
  return { bot: false, session: auth.session };
}
