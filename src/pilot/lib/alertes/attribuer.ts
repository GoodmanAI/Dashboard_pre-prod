import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/pilot/lib/prisma";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { LIBELLES_DEPARTEMENT, libelleDepartement } from "@/pilot/lib/acces/departements";
import type { designationDirecteur, nouvelleAttribution } from "@/pilot/lib/validation/attribution";
import { chargerDonneesAlertes } from "./charger";
import { calculerAlertes, clesDuGroupe } from "./calculer";

import { lienFiche, notifier, prevenirLesCloches } from "@/pilot/lib/notifications";
/**
 * Qui fait quoi (CHOIX.md, C-91). Toute alerte va d'office au directeur
 * général (décision D-3), qui la confie à une autre personne si besoin. Le
 * super-administrateur peut aussi la confier, et lui seul désigne le directeur.
 * Le journal porte le département de la personne choisie et son identifiant,
 * jamais son nom (C-22).
 */

type Client = Pick<Prisma.TransactionClient, "crmDirecteurGeneral">;

/** Le directeur général désigné, s'il a encore accès à Pilot. */
export async function directeurGeneralId(client: Client = prisma): Promise<number | null> {
  const ligne = await client.crmDirecteurGeneral.findUnique({ where: { id: 1 },
    select: { userId: true, user: { select: { role: true, accesPilot: { select: { retireLe: true } } } } } });
  if (!ligne || !["ADMIN", "SUPER_ADMIN"].includes(ligne.user.role) || ligne.user.accesPilot?.retireLe) return null;
  return ligne.userId;
}

/** Confier une alerte : le directeur général ou le super-administrateur. */
export async function peutConfierAlertes(utilisateur: { id: number; superAdmin: boolean }, client: Client = prisma): Promise<boolean> {
  return utilisateur.superAdmin || (await directeurGeneralId(client)) === utilisateur.id;
}

/** Les personnes à qui confier une alerte : les comptes de l'équipe qui ont accès, avec leur poste. */
export async function equipeAttribuable() {
  const comptes = await prisma.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, OR: [{ accesPilot: null }, { accesPilot: { retireLe: null } }] },
    select: { id: true, name: true, email: true, departementCompte: { select: { departement: true } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return comptes.map((c) => ({ id: c.id, nom: c.name ?? c.email, poste: libelleDepartement(c.departementCompte?.departement) }));
}
export type PersonneAttribuable = Awaited<ReturnType<typeof equipeAttribuable>>[number];

export async function attribuerAlerte(p: z.output<typeof nouvelleAttribution>, auteur: { id: number; superAdmin: boolean }) {
  const maintenant = new Date();
  return transactionJournalisee(async (tx) => {
    // Deux réattributions concurrentes du même dossier passent l'une après l'autre.
    await verrouillerOrganisation(tx, p.organisationId);
    if (!(await peutConfierAlertes(auteur, tx))) {
      throw new ErreurMetier("Seul le directeur général ou le super-administrateur confie une alerte.", 403);
    }
    const personne = await tx.user.findUnique({ where: { id: p.userId },
      select: { role: true, accesPilot: { select: { retireLe: true } }, departementCompte: { select: { departement: true } } } });
    if (!personne || !["ADMIN", "SUPER_ADMIN"].includes(personne.role) || personne.accesPilot?.retireLe) {
      throw new ErreurMetier("Cette personne n'a pas accès à Pilot. Choisissez un compte de l'équipe.", 400);
    }
    const { actives, acquittees } = calculerAlertes(await chargerDonneesAlertes(maintenant, p.organisationId, tx), maintenant);
    const alerte = [...actives, ...acquittees].find((a) => clesDuGroupe(a).includes(p.cleAlerte));
    if (!alerte) throw new ErreurMetier("Cette alerte n'existe plus.", 404);
    const avant = await tx.crmAttributionAlerte.findUnique({ where: { organisationId_cleGroupe: { organisationId: p.organisationId, cleGroupe: alerte.groupe } } });
    if (avant?.attribueeAId === p.userId) return { cleGroupe: alerte.groupe, userId: p.userId };
    await tx.crmAttributionAlerte.upsert({
      where: { organisationId_cleGroupe: { organisationId: p.organisationId, cleGroupe: alerte.groupe } },
      create: { organisationId: p.organisationId, cleGroupe: alerte.groupe, attribueeAId: p.userId, parId: auteur.id },
      update: { attribueeAId: p.userId, parId: auteur.id },
    });
    const departement = personne.departementCompte?.departement;
    await journaliser(tx, { type: "ALERTE_ATTRIBUEE", organisationId: p.organisationId, auteurId: auteur.id,
      resume: `Alerte confiée${departement ? ` au département ${LIBELLES_DEPARTEMENT[departement]}` : " à une personne sans département"} : ${alerte.titre}`,
      avant: { cleGroupe: alerte.groupe, attribueeAId: avant?.attribueeAId ?? null },
      apres: { cleGroupe: alerte.groupe, attribueeAId: p.userId } });
    // La cloche commune de la personne à qui l'alerte est confiée (C-91). Pas à soi-même.
    if (p.userId !== auteur.id) {
      await notifier(tx, [{ userId: p.userId, type: "pilot.alerte", lien: lienFiche(p.organisationId),
        cle: `alerte-${p.organisationId}-${alerte.groupe}-${maintenant.getTime()}`, message: `Une alerte vous est confiée : ${alerte.titre}` }]);
    }
    return { cleGroupe: alerte.groupe, userId: p.userId };
  }).then((r) => { prevenirLesCloches(); return r; });
}

/** Le directeur général actuel, pour l'écran Équipe : son compte et la version lue (C-26). */
export async function lireDirecteurGeneral() {
  const ligne = await prisma.crmDirecteurGeneral.findUnique({ where: { id: 1 }, select: { userId: true, majLe: true } });
  return ligne ? { userId: ligne.userId, majLe: ligne.majLe.toISOString() } : null;
}

const CONCURRENCE = "Le directeur général vient d'être changé par quelqu'un d'autre. Rechargez la page.";

/** Le super-administrateur désigne le directeur général. La garde de rôle est dans la route. */
export async function designerDirecteurGeneral(d: z.output<typeof designationDirecteur>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(72107, 1)`;
    const avant = await tx.crmDirecteurGeneral.findUnique({ where: { id: 1 } });
    if ((avant?.majLe.toISOString() ?? null) !== d.majLe) throw new ErreurMetier(CONCURRENCE, 409);
    const compte = await tx.user.findUnique({ where: { id: d.userId }, select: { role: true, accesPilot: { select: { retireLe: true } } } });
    if (!compte || !["ADMIN", "SUPER_ADMIN"].includes(compte.role) || compte.accesPilot?.retireLe) {
      throw new ErreurMetier("Ce compte n'a pas accès à Pilot. Choisissez un compte de l'équipe.", 400);
    }
    if (avant?.userId === d.userId) return { userId: avant.userId, majLe: avant.majLe.toISOString() };
    const ecrit = await tx.crmDirecteurGeneral.upsert({ where: { id: 1 },
      create: { id: 1, userId: d.userId, modifieParId: auteurId }, update: { userId: d.userId, modifieParId: auteurId } });
    await journaliser(tx, { type: "DIRECTEUR_GENERAL_DESIGNE", auteurId, resume: "Directeur général désigné",
      avant: { userId: avant?.userId ?? null }, apres: { userId: d.userId } });
    return { userId: ecrit.userId, majLe: ecrit.majLe.toISOString() };
  });
}
