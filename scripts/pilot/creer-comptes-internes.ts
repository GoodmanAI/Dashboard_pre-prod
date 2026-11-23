/**
 * Crée les comptes de l'équipe Lyrae (rôle ADMIN, jamais SUPER_ADMIN), d'un coup,
 * depuis un fichier. Plan lyrae/plans/2026-11-pilot-dans-le-dashboard.md, lot P7.
 *
 *   npm run pilot:comptes -- equipe.csv --essai   # vérifie le fichier, n'écrit rien
 *   npm run pilot:comptes -- equipe.csv           # crée les comptes
 *
 * Fichier (séparateur `;`, première ligne d'en-tête, hors dépôt : il porte des adresses) :
 *   nom;email;role;departement
 *   Camille Martin;camille@neuracorp.ai;GERANT;DIRECTION
 *   Alex Durand;alex@neuracorp.ai;DEVELOPPEUR;TECHNIQUE
 *
 * `role` : GERANT (voit le chiffre d'affaires) ou DEVELOPPEUR (ne le voit jamais).
 * `departement` : COMMERCIAL, PROJET, TECHNIQUE, DIRECTION, ou vide.
 *
 * Chaque compte a accès au Dashboard en lecture seule sur la configuration (outils
 * et statistiques internes) et à Pilot selon son rôle. Il passe par `creerCompte` de
 * Pilot, le même chemin que l'écran Équipe : hachage bcrypt du Dashboard, ligne
 * d'accès, département, journal. Le mot de passe provisoire de chacun s'affiche UNE
 * fois, ici, à transmettre en main propre ; il n'est écrit nulle part ailleurs.
 * Rejouable : une adresse qui a déjà un compte est signalée et passée.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../../src/pilot/lib/prisma";
import { creerCompte } from "../../src/pilot/lib/acces/comptes";
import { PROFILS } from "../../src/pilot/lib/acces/droits";
import { creationCompte, messageAcces } from "../../src/pilot/lib/validation/acces";
import { ErreurMetier } from "../../src/pilot/lib/erreurs";

type Ligne = { numero: number; nom: string; email: string; role: string; departement: string };

function lire(fichier: string): Ligne[] {
  const lignes = readFileSync(fichier, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const entete = lignes.shift()?.split(";").map((c) => c.trim().toLowerCase()) ?? [];
  const col = (nom: string) => entete.indexOf(nom);
  if (col("nom") < 0 || col("email") < 0 || col("role") < 0) throw new Error("En-tête attendu : nom;email;role;departement");
  return lignes.map((l, i) => {
    const c = l.split(";").map((x) => x.trim());
    return { numero: i + 2, nom: c[col("nom")] ?? "", email: c[col("email")] ?? "", role: (c[col("role")] ?? "").toUpperCase(),
      departement: col("departement") >= 0 ? (c[col("departement")] ?? "").toUpperCase() : "" };
  });
}

async function main() {
  const [fichier, ...options] = process.argv.slice(2);
  if (!fichier) throw new Error("Donnez le fichier : npm run pilot:comptes -- equipe.csv [--essai]");
  const essai = options.includes("--essai");
  const auteur = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", ...(process.env.PILOT_COMPTE_SCRIPT ? { email: process.env.PILOT_COMPTE_SCRIPT } : {}) },
    orderBy: { id: "asc" }, select: { id: true, email: true },
  });
  if (!auteur) throw new Error("Aucun super-administrateur en base : il signe la création des comptes.");

  const resultats: { ligne: number; nom: string; email: string; statut: string; motDePasse?: string }[] = [];
  for (const l of lire(fichier)) {
    const profil = l.role as keyof typeof PROFILS;
    const saisie = creationCompte.safeParse({
      nom: l.nom, email: l.email, profil, droits: PROFILS[profil]?.parDefaut ?? [],
      ...(l.departement ? { departement: l.departement } : {}),
    });
    if (!saisie.success) { resultats.push({ ligne: l.numero, nom: l.nom, email: l.email, statut: `refusée : ${messageAcces(saisie.error)}` }); continue; }
    const existe = await prisma.user.findFirst({ where: { email: { equals: saisie.data.email, mode: "insensitive" } }, select: { role: true } });
    if (existe) { resultats.push({ ligne: l.numero, nom: l.nom, email: saisie.data.email, statut: `déjà un compte (${existe.role}), passée` }); continue; }
    if (essai) { resultats.push({ ligne: l.numero, nom: l.nom, email: saisie.data.email, statut: `à créer, ${PROFILS[profil].libelle}` }); continue; }
    try {
      const { motDePasse } = await creerCompte(saisie.data, auteur.id);
      resultats.push({ ligne: l.numero, nom: l.nom, email: saisie.data.email, statut: `créé, ${PROFILS[profil].libelle}`, motDePasse });
    } catch (e) {
      resultats.push({ ligne: l.numero, nom: l.nom, email: saisie.data.email, statut: `refusée : ${e instanceof ErreurMetier ? e.message : "erreur de la base"}` });
    }
  }
  console.table(resultats);
  if (!essai && resultats.some((r) => r.motDePasse)) {
    console.log("Mots de passe provisoires : affichés une seule fois. Chacun choisit le sien dans Pilot, Mon compte.");
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
