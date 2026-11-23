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

/** Créer les comptes de l'équipe et donner les droits : le super-administrateur seul. */
export function peutGererComptes(role: string): boolean {
  return role === "SUPER_ADMIN";
}

/** L'import et l'export de l'apport d'affaires restent au super-administrateur (C-63). */
export function peutExporter(role: string): boolean {
  return role === "SUPER_ADMIN";
}

export function exiger(autorise: boolean, message = "Vous n'avez pas accès à cette action."): void {
  if (!autorise) throw new ErreurMetier(message, 403);
}
