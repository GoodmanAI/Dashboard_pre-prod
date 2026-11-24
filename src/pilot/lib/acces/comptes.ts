import { Prisma } from "@prisma/client";
import type { CrmDepartement } from "@prisma/client";
import type { z } from "zod";
import type { changementMotDePasse, creationCompte, operationAcces } from "@/pilot/lib/validation/acces";
import type { modificationDepartement } from "@/pilot/lib/validation/commentaire";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { prisma } from "@/pilot/lib/prisma";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { hacherMotDePasse, motDePasseProvisoire, verifierMotDePasse } from "@/pilot/lib/motDePasse";
import { PROFILS, PROFIL_PAR_DEFAUT, droitsEffectifs, estAdministrateurPilot, normaliser, refusDroits, type Profil } from "./droits";
import { LIBELLES_DEPARTEMENT } from "./departements";
import { libelleAcces, lireAccesInternes, normaliserAccesInternes, ouvreLeDashboard, type AccesInternes } from "@/lib/accesInternes";
import { peutDonnerAccesDashboard } from "@/pilot/lib/autorisations";

/**
 * Les comptes de l'équipe et leurs droits (CHOIX.md, C-64).
 *
 * Exception à C-02, écrite en C-64 : le super-administrateur crée ici les
 * comptes de l'équipe dans la table User du Dashboard (rôle ADMIN, jamais
 * CLIENT ni SUPER_ADMIN), et chacun y change son mot de passe. Les seules
 * écritures de User sont dans ce fichier ; à l'intégration, elles passent par
 * la création de compte du Dashboard (docs/INTEGRATION-DASHBOARD.md).
 *
 * Le rôle dans Pilot et les droits vivent dans `CrmAccesPilot`. Le journal dit
 * qui a fait quoi, jamais l'e-mail ni un mot de passe.
 */

/** Sérialise tout ce qui touche un même compte : droits, retrait, mot de passe. */
const VERROU_ACCES = 72106;
const CONCURRENCE = "Ce compte vient d'être modifié par quelqu'un d'autre. Rechargez la page.";

async function verrouiller(tx: Prisma.TransactionClient, userId: number) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${VERROU_ACCES}::integer, ${userId}::integer)`;
}

/**
 * Qui agit sur l'équipe : le SUPER_ADMIN, ou un administrateur de Pilot (24/11/2026).
 * La route a déjà vérifié `peutGererComptes` ; ici on ne regarde que le rôle.
 */
export type Auteur = { id: number; role: string };

export const REFUS_DASHBOARD = "Les accès au Dashboard se donnent par le super-administrateur seul.";
const REFUS_ADMINISTRATEUR = "Un administrateur de Pilot se nomme et se modifie par le super-administrateur seul.";
const REFUS_SOI = "Vos propres droits se modifient par le super-administrateur.";
const REFUS_MOT_DE_PASSE = "Ce compte ouvre des écrans du Dashboard : son mot de passe se donne par le super-administrateur.";

/**
 * Un compte de l'équipe qu'on peut modifier : ADMIN. Le super-administrateur garde tous ses droits.
 *
 * Un administrateur de Pilot qui n'est pas SUPER_ADMIN ne touche ni à lui-même, ni à un
 * autre administrateur : sans cela, il pourrait s'élever ou élever un autre. Ce qu'il ne
 * peut pas faire d'autre (écrans du Dashboard, mot de passe d'un compte qui en ouvre) est
 * vérifié par l'opération elle-même.
 */
async function compteModifiable(tx: Prisma.TransactionClient, userId: number, auteur: Auteur) {
  const compte = await tx.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, permissions: true, accesPilot: true } });
  if (!compte || compte.role === "CLIENT") throw new ErreurMetier("Compte inconnu.", 404);
  if (compte.role === "SUPER_ADMIN") throw new ErreurMetier("Un super-administrateur a tous les droits. Ils ne se modifient pas ici.", 400);
  if (!peutDonnerAccesDashboard(auteur.role)) {
    if (compte.id === auteur.id) throw new ErreurMetier(REFUS_SOI, 403);
    if (compte.accesPilot?.administrateur) throw new ErreurMetier(REFUS_ADMINISTRATEUR, 403);
  }
  return { ...compte, nom: compte.name ?? compte.email };
}

const libelle = (profil: Profil) => PROFILS[profil].libelle;

/** L'écran Équipe : les comptes internes, super-administrateurs d'abord, puis par nom. */
export async function chargerEquipe() {
  const comptes = await prisma.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true, name: true, email: true, role: true, permissions: true, accesPilot: true, departementCompte: { select: { departement: true, majLe: true } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return comptes
    .map(({ accesPilot: a, departementCompte: dep, permissions, ...c }) => {
      const superAdmin = c.role === "SUPER_ADMIN";
      const profil: Profil | null = superAdmin ? null : a?.profil ?? PROFIL_PAR_DEFAUT;
      const acces = superAdmin ? null : lireAccesInternes(permissions);
      return {
        id: c.id, nom: c.name ?? c.email, email: c.email, superAdmin, profil,
        // Administrateur de Pilot (24/11/2026) : coché par le super-administrateur seul.
        administrateurPilot: !superAdmin && a?.administrateur === true,
        // Sans ligne, l'écran montre les droits par défaut du rôle : ceux qui s'appliquent.
        profilConfirme: superAdmin || a !== null,
        droits: superAdmin || estAdministrateurPilot(c.role, a) ? droitsEffectifs(c.role, a) : normaliser(a ? a.droits : PROFILS[profil!].parDefaut),
        motDePasseProvisoire: a?.motDePasseProvisoire ?? false,
        retireLe: a?.retireLe?.toISOString() ?? null,
        majLe: a?.majLe.toISOString() ?? null,
        // Lot T : null tant que personne n'a choisi. `departementMajLe` est la version lue, renvoyée à l'écriture (C-26).
        departement: dep?.departement ?? null,
        departementMajLe: dep?.majLe.toISOString() ?? null,
        // Les écrans du Dashboard ouverts (24/11/2026). Vide : Pilot seul. Le super-administrateur ouvre tout.
        accesDashboard: acces,
        ouvreLeDashboard: superAdmin || ouvreLeDashboard(acces ?? {}),
      };
    })
    .sort((x, y) => Number(y.superAdmin) - Number(x.superAdmin));
}
export type MembreEquipe = Awaited<ReturnType<typeof chargerEquipe>>[number];

/** Crée un compte de l'équipe avec un mot de passe provisoire, rendu une seule fois. */
export async function creerCompte(d: z.output<typeof creationCompte>, auteur: Auteur) {
  const auteurId = auteur.id;
  const refus = refusDroits(d.profil, d.droits);
  if (refus) throw new ErreurMetier(refus, 400);
  // Un administrateur de Pilot crée des comptes de Pilot seul, jamais un autre administrateur.
  if (!peutDonnerAccesDashboard(auteur.role)) {
    if (ouvreLeDashboard(normaliserAccesInternes(d.dashboard ?? {}))) throw new ErreurMetier(REFUS_DASHBOARD, 403);
    if (d.administrateur) throw new ErreurMetier(REFUS_ADMINISTRATEUR, 403);
  }
  const droits = normaliser(d.droits);
  const motDePasse = motDePasseProvisoire();
  const password = await hacherMotDePasse(motDePasse);
  try {
    const id = await transactionJournalisee(async (tx) => {
      const existant = await tx.user.findFirst({ where: { email: { equals: d.email, mode: "insensitive" } }, select: { id: true } });
      if (existant) throw new ErreurMetier("Un compte existe déjà avec cette adresse e-mail.", 409);
      const dashboard = normaliserAccesInternes(d.dashboard ?? {});
      const compte = await tx.user.create({
        data: { name: d.nom, email: d.email, password, role: "ADMIN", permissions: dashboard as Prisma.InputJsonObject },
        select: { id: true },
      });
      await tx.crmAccesPilot.create({ data: { userId: compte.id, profil: d.profil, droits, motDePasseProvisoire: true, administrateur: d.administrateur === true, creeParId: auteurId, modifieParId: auteurId } });
      if (d.departement) await tx.crmDepartementCompte.create({ data: { userId: compte.id, departement: d.departement } });
      await journaliser(tx, { type: "COMPTE_CREE", auteurId, resume: `Compte créé : ${d.nom}, ${libelle(d.profil)}`,
        apres: { userId: compte.id, profil: d.profil, droits, dashboard, ...(d.administrateur ? { administrateur: true } : {}), ...(d.departement ? { departement: d.departement } : {}) } });
      return compte.id;
    });
    return { id, motDePasse };
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
      throw new ErreurMetier("Un compte existe déjà avec cette adresse e-mail.", 409);
    }
    throw erreur;
  }
}

type Operation = z.output<typeof operationAcces>;

/**
 * Les actions sur un compte : rôle et droits, accès au Dashboard, administrateur de
 * Pilot, retrait, retour, mot de passe provisoire. Les accès au Dashboard et la case
 * d'administrateur sont au SUPER_ADMIN seul.
 */
export async function agirSurAcces(userId: number, op: Operation, auteur: Auteur): Promise<{ motDePasse?: string }> {
  if ((op.operation === "dashboard" || op.operation === "administrateur") && !peutDonnerAccesDashboard(auteur.role)) {
    throw new ErreurMetier(op.operation === "dashboard" ? REFUS_DASHBOARD : REFUS_ADMINISTRATEUR, 403);
  }
  switch (op.operation) {
    case "droits": await modifierDroits(userId, op, auteur); return {};
    case "dashboard": await modifierAccesDashboard(userId, op, auteur); return {};
    case "administrateur": await nommerAdministrateur(userId, op.administrateur, auteur); return {};
    case "retirer": await retirerAcces(userId, auteur); return {};
    case "rendre": await rendreAcces(userId, auteur); return {};
    case "motDePasse": return { motDePasse: await reinitialiserMotDePasse(userId, auteur) };
  }
}

/**
 * Coche ou décoche l'administrateur de Pilot (24/11/2026). Le compte se reconnecte
 * (`tokenVersion`) : aucune session ne garde des pouvoirs retirés.
 */
async function nommerAdministrateur(userId: number, administrateur: boolean, auteur: Auteur) {
  const auteurId = auteur.id;
  await transactionJournalisee(async (tx) => {
    await verrouiller(tx, userId);
    const compte = await compteModifiable(tx, userId, auteur);
    if (compte.accesPilot?.retireLe) throw new ErreurMetier("L'accès de ce compte est retiré. Rendez-le avant de le nommer.", 409);
    if ((compte.accesPilot?.administrateur ?? false) === administrateur) return;
    await tx.crmAccesPilot.upsert({
      where: { userId },
      create: { userId, profil: "GERANT", droits: [...PROFILS.GERANT.parDefaut], administrateur, creeParId: auteurId, modifieParId: auteurId },
      update: { administrateur, modifieParId: auteurId },
    });
    await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await journaliser(tx, { type: "ACCES_MODIFIE", auteurId,
      resume: `${administrateur ? "Nommé administrateur de Pilot" : "N'est plus administrateur de Pilot"} : ${compte.nom}`,
      avant: { userId, administrateur: !administrateur }, apres: { userId, administrateur } });
  });
}

async function modifierDroits(userId: number, d: Extract<Operation, { operation: "droits" }>, auteur: Auteur) {
  const auteurId = auteur.id;
  const refus = refusDroits(d.profil, d.droits);
  if (refus) throw new ErreurMetier(refus, 400);
  const droits = normaliser(d.droits);
  await transactionJournalisee(async (tx) => {
    await verrouiller(tx, userId);
    const compte = await compteModifiable(tx, userId, auteur);
    const avant = compte.accesPilot;
    // Écriture conditionnelle (C-26) : la version lue par l'écran doit être celle en base.
    if ((avant?.majLe.toISOString() ?? null) !== d.majLe) throw new ErreurMetier(CONCURRENCE, 409);
    if (avant?.retireLe) throw new ErreurMetier("L'accès de ce compte est retiré. Rendez-le avant de changer ses droits.", 409);
    const precedent = { profil: avant?.profil ?? PROFIL_PAR_DEFAUT, droits: normaliser(avant ? avant.droits : PROFILS[PROFIL_PAR_DEFAUT].parDefaut) };
    if (avant && precedent.profil === d.profil && precedent.droits.join() === droits.join()) return;
    await tx.crmAccesPilot.upsert({
      where: { userId },
      create: { userId, profil: d.profil, droits, creeParId: auteurId, modifieParId: auteurId },
      update: { profil: d.profil, droits, modifieParId: auteurId },
    });
    await journaliser(tx, { type: "ACCES_MODIFIE", auteurId, resume: `Droits modifiés : ${compte.nom}, ${libelle(d.profil)}`,
      avant: { userId, ...precedent }, apres: { userId, profil: d.profil, droits } });
  });
}

const memes = (a: AccesInternes, b: AccesInternes) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Les écrans du Dashboard qu'un compte de l'équipe ouvre (24/11/2026, `src/lib/accesInternes.ts`).
 * Rangés dans `User.permissions`, lus par le middleware à chaque requête. Un changement
 * déconnecte la personne (`tokenVersion`) : elle se reconnecte avec ses nouveaux accès,
 * aucune session ne garde ceux d'avant.
 */
async function modifierAccesDashboard(userId: number, d: Extract<Operation, { operation: "dashboard" }>, auteur: Auteur) {
  const auteurId = auteur.id;
  const acces = normaliserAccesInternes(d.acces);
  await transactionJournalisee(async (tx) => {
    await verrouiller(tx, userId);
    const compte = await compteModifiable(tx, userId, auteur);
    if (compte.accesPilot?.retireLe) throw new ErreurMetier("L'accès de ce compte est retiré. Rendez-le avant de changer ses accès.", 409);
    const { permissions } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { permissions: true } });
    const precedent = normaliserAccesInternes(permissions);
    if (!memes(precedent, normaliserAccesInternes(d.avant))) throw new ErreurMetier(CONCURRENCE, 409);
    if (memes(precedent, acces)) return;
    await tx.user.update({ where: { id: userId }, data: { permissions: acces as Prisma.InputJsonObject, tokenVersion: { increment: 1 } } });
    const noms = Object.keys(acces).map((c) => libelleAcces(c as keyof AccesInternes));
    await journaliser(tx, { type: "ACCES_MODIFIE", auteurId,
      resume: `Accès au Dashboard modifiés : ${compte.nom}, ${noms.length ? `${noms.length} écran(s)` : "Pilot seul"}`,
      avant: { userId, dashboard: precedent }, apres: { userId, dashboard: acces } });
  });
}

/** Le compte ne se connecte plus à Pilot, et une session ouverte s'arrête à l'appel suivant. Ses traces restent. */
async function retirerAcces(userId: number, auteur: Auteur) {
  const auteurId = auteur.id;
  await transactionJournalisee(async (tx) => {
    await verrouiller(tx, userId);
    const compte = await compteModifiable(tx, userId, auteur);
    if (compte.accesPilot?.retireLe) throw new ErreurMetier("L'accès de ce compte est déjà retiré.", 409);
    const maintenant = new Date();
    await tx.crmAccesPilot.upsert({
      where: { userId },
      create: { userId, profil: PROFIL_PAR_DEFAUT, droits: [...PROFILS[PROFIL_PAR_DEFAUT].parDefaut], retireLe: maintenant, creeParId: auteurId, modifieParId: auteurId },
      update: { retireLe: maintenant, modifieParId: auteurId },
    });
    // La session ouverte s'arrête, au Dashboard comme dans Pilot, et la connexion est refusée.
    await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await journaliser(tx, { type: "ACCES_RETIRE", auteurId, resume: `Accès retiré : ${compte.nom}`, apres: { userId } });
  });
}

async function rendreAcces(userId: number, auteur: Auteur) {
  const auteurId = auteur.id;
  await transactionJournalisee(async (tx) => {
    await verrouiller(tx, userId);
    const compte = await compteModifiable(tx, userId, auteur);
    if (!compte.accesPilot?.retireLe) throw new ErreurMetier("Ce compte a déjà accès à Pilot.", 409);
    await tx.crmAccesPilot.update({ where: { userId }, data: { retireLe: null, modifieParId: auteurId } });
    await journaliser(tx, { type: "ACCES_RENDU", auteurId, resume: `Accès rendu : ${compte.nom}`, apres: { userId } });
  });
}

/** Un nouveau mot de passe provisoire, pour qui a oublié le sien. L'ancien cesse de marcher. */
async function reinitialiserMotDePasse(userId: number, auteur: Auteur) {
  const auteurId = auteur.id;
  const motDePasse = motDePasseProvisoire();
  const password = await hacherMotDePasse(motDePasse);
  await transactionJournalisee(async (tx) => {
    await verrouiller(tx, userId);
    const compte = await compteModifiable(tx, userId, auteur);
    // Donner le mot de passe d'un compte, c'est pouvoir s'y connecter : un administrateur
    // de Pilot ne le fait que pour un compte qui n'ouvre rien au Dashboard.
    if (!peutDonnerAccesDashboard(auteur.role) && ouvreLeDashboard(lireAccesInternes(compte.permissions))) {
      throw new ErreurMetier(REFUS_MOT_DE_PASSE, 403);
    }
    if (compte.accesPilot?.retireLe) throw new ErreurMetier("L'accès de ce compte est retiré. Rendez-le avant de donner un mot de passe.", 409);
    await tx.user.update({ where: { id: userId }, data: { password } });
    await tx.crmAccesPilot.upsert({
      where: { userId },
      create: { userId, profil: PROFIL_PAR_DEFAUT, droits: [...PROFILS[PROFIL_PAR_DEFAUT].parDefaut], motDePasseProvisoire: true, creeParId: auteurId, modifieParId: auteurId },
      update: { motDePasseProvisoire: true, modifieParId: auteurId },
    });
    await journaliser(tx, { type: "MOT_DE_PASSE_REINITIALISE", auteurId, resume: `Mot de passe provisoire donné : ${compte.nom}`, apres: { userId } });
  });
  return motDePasse;
}

/** Chacun choisit son mot de passe, en donnant l'actuel. Lève le mot de passe provisoire. */
export async function changerMonMotDePasse(userId: number, d: z.output<typeof changementMotDePasse>) {
  if (d.nouveau === d.actuel) throw new ErreurMetier("Choisissez un mot de passe différent de l'actuel.", 400);
  const compte = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!compte || !(await verifierMotDePasse(d.actuel, compte.password))) throw new ErreurMetier("Le mot de passe actuel ne correspond pas.", 400);
  const password = await hacherMotDePasse(d.nouveau);
  await transactionJournalisee(async (tx) => {
    await verrouiller(tx, userId);
    // Conditionnelle (C-26) : si le mot de passe a changé entre la vérification et l'écriture, on n'écrase rien.
    const { count } = await tx.user.updateMany({ where: { id: userId, password: compte.password }, data: { password } });
    if (count === 0) throw new ErreurMetier("Votre mot de passe vient de changer. Rechargez la page.", 409);
    await tx.crmAccesPilot.updateMany({ where: { userId }, data: { motDePasseProvisoire: false } });
    await journaliser(tx, { type: "MOT_DE_PASSE_CHANGE", auteurId: userId, resume: "Mot de passe changé par son titulaire" });
  });
}

type ChangementDepartement = z.output<typeof modificationDepartement>;

/**
 * Le département d'un compte de l'équipe, super-administrateur compris (lot T).
 * Ne passe pas par `compteModifiable` : celui-ci refuse SUPER_ADMIN, et le
 * super-administrateur doit pouvoir se donner un département. Un compte client
 * n'en a pas. Un compte dont l'accès est retiré garde le sien : il le retrouve
 * si on lui rend l'accès, et ne reçoit rien d'ici là (`calculerDestinataires`).
 *
 * Écriture conditionnelle (C-26) : `majLe` est la version lue par l'écran, null
 * si le compte n'avait pas de ligne. Le même département redemandé n'écrit
 * rien et ne journalise rien.
 */
export async function changerDepartement(userId: number, d: ChangementDepartement, auteurId: number): Promise<{ departement: CrmDepartement; majLe: string }> {
  return transactionJournalisee(async (tx) => {
    await verrouiller(tx, userId);
    const compte = await tx.user.findUnique({ where: { id: userId }, select: { name: true, role: true, departementCompte: true } });
    if (!compte || compte.role === "CLIENT") throw new ErreurMetier("Compte inconnu.", 404);
    const avant = compte.departementCompte;
    if ((avant?.majLe.toISOString() ?? null) !== d.majLe) throw new ErreurMetier(CONCURRENCE, 409);
    if (avant?.departement === d.departement) return { departement: avant.departement, majLe: avant.majLe.toISOString() };
    let ecrit;
    if (avant) {
      const { count } = await tx.crmDepartementCompte.updateMany({ where: { userId, majLe: avant.majLe }, data: { departement: d.departement } });
      if (count !== 1) throw new ErreurMetier(CONCURRENCE, 409);
      ecrit = await tx.crmDepartementCompte.findUniqueOrThrow({ where: { userId } });
    } else {
      ecrit = await tx.crmDepartementCompte.create({ data: { userId, departement: d.departement } });
    }
    await journaliser(tx, { type: "DEPARTEMENT_MODIFIE", auteurId,
      resume: `Département modifié : ${compte.name ?? "un compte"}, ${LIBELLES_DEPARTEMENT[d.departement]}`,
      avant: { userId, departement: avant?.departement ?? null }, apres: { userId, departement: d.departement } });
    return { departement: ecrit.departement, majLe: ecrit.majLe.toISOString() };
  });
}
