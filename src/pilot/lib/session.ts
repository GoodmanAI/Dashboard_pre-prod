import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { prisma } from "@/pilot/lib/prisma";
import { peutGererComptes, peutLirePilot } from "@/pilot/lib/autorisations";
import { droitsEffectifs, libelleCompte, profilEffectif } from "@/pilot/lib/acces/droits";
import { ENTETE_CHEMIN, adresseDeConnexion, type RaisonRefus } from "@/pilot/lib/refusSession";

/**
 * Qui agit.
 *
 * Pilot vit dans le Dashboard et hérite de sa session NextAuth (`authOptions`,
 * cookie partagé avec `pilote.dashboard.neuracorp.ai` par `AUTH_COOKIE_DOMAIN`).
 * Sa propre connexion (C-57) ne fait plus partie du dépôt. Le rôle
 * et les droits (C-64) sont relus en base à chaque appel : un compte rétrogradé,
 * ou dont l'accès est retiré, perd ses droits sans attendre la fin de sa session.
 */
export async function utilisateurCourant() {
  let session;
  try { session = await getServerSession(authOptions); }
  catch (erreur) {
    // Hors de toute requête HTTP, seuls les scripts en ligne de commande (verifier,
    // mesurer, evaluer) appellent ce code : ils agissent au nom d'un compte de
    // script. Une requête web a toujours un contexte, et sans session elle reçoit 401.
    if (erreur instanceof Error && erreur.message.includes("outside a request scope")) return compteDeScript();
    throw erreur;
  }
  const id = idDeSession(session);
  if (id === null) refuser("session", "Connectez-vous pour continuer.");
  const utilisateur = await prisma.user.findUnique({ where: { id }, select: CHAMPS });
  if (!utilisateur) refuser("session", "Ce compte n'a plus accès à Pilot.");
  if (!peutLirePilot(utilisateur.role) || utilisateur.accesPilot?.retireLe) refuser("acces", "Ce compte n'a plus accès à Pilot.");
  return enActeur(utilisateur);
}

/**
 * Le compte affiché par la coquille (menu, nom, rôle), relu en base comme
 * `utilisateurCourant`, mais sans jamais rediriger : la page elle-même s'en charge.
 * Null quand personne n'est connecté ou que le compte n'a plus accès.
 */
export async function compteAffiche() {
  const id = idDeSession(await getServerSession(authOptions));
  if (id === null) return null;
  const utilisateur = await prisma.user.findUnique({ where: { id }, select: CHAMPS });
  if (!utilisateur || !peutLirePilot(utilisateur.role) || utilisateur.accesPilot?.retireLe) return null;
  return enActeur(utilisateur);
}

const CHAMPS = {
  id: true, name: true, email: true, role: true,
  accesPilot: { select: { profil: true, droits: true, retireLe: true, motDePasseProvisoire: true } },
} as const satisfies Prisma.UserSelect;

type Lu = Prisma.UserGetPayload<{ select: typeof CHAMPS }>;

/** Ce que les routes et les pages savent de qui agit : identité, rôle, droits réels. */
function enActeur({ accesPilot, ...u }: Lu) {
  const profil = profilEffectif(u.role, accesPilot);
  return {
    ...u, profil, libelle: libelleCompte(u.role, profil), droits: droitsEffectifs(u.role, accesPilot),
    superAdmin: peutGererComptes(u.role), motDePasseProvisoire: accesPilot?.motDePasseProvisoire ?? false,
  };
}

function idDeSession(session: unknown): number | null {
  const id = Number((session as { user?: { id?: number } } | null)?.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Une page renvoie vers la connexion, avec la raison ; une API répond 401 (C-61).
 * Sans cela, un jeton encore valide dont le compte a disparu (après un seed, une
 * suppression) ou perdu ses droits passait le middleware et finissait en erreur 500.
 */
/** `messageApi` reste celui d'avant C-61 : les appels d'API et leurs contrôles ne changent pas. */
function refuser(raison: RaisonRefus, messageApi: string): never {
  const adresse = adresseDeConnexion(headers().get(ENTETE_CHEMIN), raison);
  if (adresse) redirect(adresse);
  throw new ErreurMetier(messageApi, 401);
}

/** Le compte des scripts : PILOT_COMPTE_SCRIPT (un e-mail), sinon le premier compte interne, comme avant C-57. */
async function compteDeScript() {
  const email = process.env.PILOT_COMPTE_SCRIPT;
  const utilisateur = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, ...(email ? { email } : {}) },
    orderBy: { id: "asc" }, select: CHAMPS,
  });
  if (!utilisateur) throw new Error("Aucun compte interne en base. Lancer `npm run seed` ou `npm run comptes:locaux`.");
  return enActeur(utilisateur);
}
