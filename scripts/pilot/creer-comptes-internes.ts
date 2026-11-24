/**
 * Crée les comptes de l'équipe Lyrae (rôle ADMIN, jamais SUPER_ADMIN), d'un coup,
 * depuis un fichier. Plan lyrae/plans/2026-11-pilot-dans-le-dashboard.md, lot P7.
 *
 *   npm run pilot:comptes -- equipe.csv --essai   # vérifie le fichier, n'écrit rien
 *   npm run pilot:comptes -- equipe.csv           # crée les comptes
 *
 * Fichier (séparateur `;`, première ligne d'en-tête, hors dépôt : il porte des adresses) :
 *   nom;email;role;departement;dashboard
 *   Camille Martin;camille@neuracorp.ai;GERANT;DIRECTION;centres+admin_vue_ensemble
 *   Alex Durand;alex@neuracorp.ai;DEVELOPPEUR;TECHNIQUE;pilot
 *
 * `role` : GERANT (voit le chiffre d'affaires), DEVELOPPEUR (ne le voit jamais), ou
 *   ADMINISTRATEUR : gérant et administrateur de Pilot (équipe, alertes, fiches), sans
 *   rien de plus au Dashboard que sa colonne `dashboard`.
 * `departement` : COMMERCIAL, PROJET, TECHNIQUE, DIRECTION, ou vide.
 * `dashboard` : les écrans du Dashboard que le compte ouvre, séparés par `+` ; chacun est
 *   un préréglage de l'écran Équipe (pilot, centres, quotidien, tout) ou la clé d'un écran
 *   (admin_vue_ensemble, calls...), en lecture. Vide ou absent : Pilot seul.
 *
 * Chaque compte ouvre Pilot selon son rôle et, au Dashboard, les écrans de sa colonne
 * `dashboard` ; la configuration reste au super-administrateur. Il passe par `creerCompte` de
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
import { accesDepuisTexte } from "../../src/lib/accesInternes";
import { ErreurMetier } from "../../src/pilot/lib/erreurs";

type Ligne = { numero: number; nom: string; email: string; role: string; departement: string; dashboard: string };

function lire(fichier: string): Ligne[] {
  const lignes = readFileSync(fichier, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const entete = lignes.shift()?.split(";").map((c) => c.trim().toLowerCase()) ?? [];
  const col = (nom: string) => entete.indexOf(nom);
  if (col("nom") < 0 || col("email") < 0 || col("role") < 0) throw new Error("En-tête attendu : nom;email;role;departement");
  return lignes.map((l, i) => {
    const c = l.split(";").map((x) => x.trim());
    return { numero: i + 2, nom: c[col("nom")] ?? "", email: c[col("email")] ?? "", role: (c[col("role")] ?? "").toUpperCase(),
      departement: col("departement") >= 0 ? (c[col("departement")] ?? "").toUpperCase() : "",
      dashboard: col("dashboard") >= 0 ? (c[col("dashboard")] ?? "") : "" };
  });
}

async function main() {
  const [fichier, ...options] = process.argv.slice(2);
  if (!fichier) throw new Error("Donnez le fichier : npm run pilot:comptes -- equipe.csv [--essai]");
  const essai = options.includes("--essai");
  const auteur = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", ...(process.env.PILOT_COMPTE_SCRIPT ? { email: process.env.PILOT_COMPTE_SCRIPT } : {}) },
    orderBy: { id: "asc" }, select: { id: true, email: true, role: true },
  });
  if (!auteur) throw new Error("Aucun super-administrateur en base : il signe la création des comptes.");

  const resultats: { ligne: number; nom: string; email: string; statut: string; dashboard?: string; motDePasse?: string }[] = [];
  for (const l of lire(fichier)) {
    const administrateur = l.role === "ADMINISTRATEUR";
    const profil = (administrateur ? "GERANT" : l.role) as keyof typeof PROFILS;
    const role = administrateur ? "Administrateur de Pilot" : PROFILS[profil]?.libelle;
    const dashboard = accesDepuisTexte(l.dashboard);
    if (typeof dashboard === "string") { resultats.push({ ligne: l.numero, nom: l.nom, email: l.email, statut: `refusée : ${dashboard}` }); continue; }
    const ecrans = Object.keys(dashboard).length ? Object.keys(dashboard).join(", ") : "aucun, Pilot seul";
    const saisie = creationCompte.safeParse({
      nom: l.nom, email: l.email, profil, droits: PROFILS[profil]?.parDefaut ?? [], dashboard,
      ...(administrateur ? { administrateur: true } : {}),
      ...(l.departement ? { departement: l.departement } : {}),
    });
    if (!saisie.success) { resultats.push({ ligne: l.numero, nom: l.nom, email: l.email, statut: `refusée : ${messageAcces(saisie.error)}` }); continue; }
    const existe = await prisma.user.findFirst({ where: { email: { equals: saisie.data.email, mode: "insensitive" } }, select: { role: true } });
    if (existe) { resultats.push({ ligne: l.numero, nom: l.nom, email: saisie.data.email, statut: `déjà un compte (${existe.role}), passée` }); continue; }
    if (essai) { resultats.push({ ligne: l.numero, nom: l.nom, email: saisie.data.email, statut: `à créer, ${role}`, dashboard: ecrans }); continue; }
    try {
      const { motDePasse } = await creerCompte(saisie.data, auteur);
      resultats.push({ ligne: l.numero, nom: l.nom, email: saisie.data.email, statut: `créé, ${role}`, dashboard: ecrans, motDePasse });
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
