import type { CrmDroitPilot } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";

/** « Tous » désigne les comptes internes. Un CLIENT n'a aucun accès à Pilot. */
export function peutLirePilot(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export const peutModifierPilot = peutLirePilot;
export const peutChangerEtape = peutLirePilot;
export const peutAcquitter = peutLirePilot;

/**
 * Qui agit, avec ses droits réels (C-64), calculés par `droitsEffectifs` à
 * chaque appel : un droit retiré se perd sans attendre la fin de la session.
 */
export type Acteur = { role: string; droits: readonly CrmDroitPilot[] };

/** Un développeur ne voit pas le chiffre d'affaires : `droitsEffectifs` ne lui donne jamais VOIR_CA. */
export function peutVoirCa(a: Acteur): boolean {
  return peutLirePilot(a.role) && a.droits.includes("VOIR_CA");
}

export function peutExporterCa(a: Acteur): boolean {
  return peutVoirCa(a) && a.droits.includes("EXPORTER_CA");
}

export function peutModifierLesMontants(a: Acteur): boolean {
  return peutModifierPilot(a.role) && a.droits.includes("MODIFIER_MONTANTS");
}

export function peutEvaluer(a: Acteur): boolean {
  return peutLirePilot(a.role) && a.droits.includes("EVALUER_PARC");
}

/**
 * Qui a les pouvoirs du super-administrateur DANS Pilot (24/11/2026) : le SUPER_ADMIN
 * du Dashboard, et l'administrateur de Pilot (`estAdministrateurPilot`, calculé par
 * la session). Créer les comptes et donner les droits de Pilot, confier les alertes,
 * supprimer une fiche, corriger ce que d'autres ont écrit. Jamais les écrans du
 * Dashboard : `peutDonnerAccesDashboard`.
 */
export type Gestionnaire = { role: string; administrateurPilot?: boolean };

export function pouvoirsPilot(a: Gestionnaire): boolean {
  return a.role === "SUPER_ADMIN" || (a.role === "ADMIN" && a.administrateurPilot === true);
}

/** Créer les comptes de l'équipe et donner les droits de Pilot. */
export const peutGererComptes = pouvoirsPilot;

/** L'import et l'export de l'apport d'affaires (C-63). */
export const peutExporter = pouvoirsPilot;

/** Ouvrir des écrans du Dashboard, nommer un administrateur de Pilot : le SUPER_ADMIN seul. */
export function peutDonnerAccesDashboard(role: string): boolean {
  return role === "SUPER_ADMIN";
}

export function exiger(autorise: boolean, message = "Vous n'avez pas accès à cette action."): void {
  if (!autorise) throw new ErreurMetier(message, 403);
}
