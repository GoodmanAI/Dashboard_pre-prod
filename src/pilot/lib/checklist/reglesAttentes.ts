import type { CrmEtapeIntegration, CrmTiers } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { debutDuJour, dansJours } from "@/pilot/lib/dates";

export const LIBELLES_TIERS: Record<CrmTiers, string> = {
  LYRAE: "Lyrae", CLIENT: "Le client", EDL: "EDL", OPERATEUR_TELEPHONIE: "L'opérateur téléphonique",
  PRESTATAIRE_SITE_WEB: "Le prestataire du site web", AUTRE: "Un autre tiers",
};
export const ORDRE_TIERS: CrmTiers[] = ["EDL", "OPERATEUR_TELEPHONIE", "PRESTATAIRE_SITE_WEB", "CLIENT", "LYRAE", "AUTRE"];
const COMPLEMENTS: Record<CrmTiers, string> = {
  LYRAE: "de Lyrae", CLIENT: "du client", EDL: "d'EDL", OPERATEUR_TELEPHONIE: "de l'opérateur téléphonique",
  PRESTATAIRE_SITE_WEB: "du prestataire du site web", AUTRE: "d'un autre tiers",
};
export function libelleAttente(tiers: CrmTiers) { return `En attente ${COMPLEMENTS[tiers]}`; }
export type ChampsAttente = Pick<CrmEtapeIntegration, "enAttenteDe" | "demandeeLe" | "derniereRelanceLe" | "echeanceLe">;
export const ATTENTE_VIDE: ChampsAttente = { enAttenteDe: null, demandeeLe: null, derniereRelanceLe: null, echeanceLe: null };
export function champsAttente(e: ChampsAttente): ChampsAttente {
  return { enAttenteDe: e.enAttenteDe, demandeeLe: e.demandeeLe, derniereRelanceLe: e.derniereRelanceLe, echeanceLe: e.echeanceLe };
}
/**
 * Une attente se déclare sur toute étape pas encore faite, automatique comprise
 * (C-86) : c'est là qu'on attend EDL (jeton Xplore, codes, examens). Elle ne
 * coche rien : la case automatique reste à l'évaluateur, qui efface l'attente
 * le jour où il la coche.
 */
export function verifierAttente(e: Pick<CrmEtapeIntegration, "cle" | "mode" | "faite" | "enAttenteDe">, operation: "declarer" | "relancer" | "lever") {
  if (e.faite) throw new ErreurMetier("Cette étape est faite : il n'y a plus rien à attendre.", 409);
  if (operation !== "declarer" && !e.enAttenteDe) throw new ErreurMetier("Cette étape n'a pas d'attente.", 409);
}
export function preparerAttente(p: { enAttenteDe: CrmTiers; demandeeLe?: Date; echeanceLe?: Date | null }, maintenant: Date): ChampsAttente {
  const demandeeLe = p.demandeeLe ?? debutDuJour(maintenant);
  const echeanceLe = p.echeanceLe ?? null;
  if (!Number.isFinite(demandeeLe.getTime()) || demandeeLe > maintenant) throw new ErreurMetier("La date de demande ne peut pas être dans le futur.", 400);
  if (echeanceLe && (!Number.isFinite(echeanceLe.getTime()) || echeanceLe < demandeeLe)) throw new ErreurMetier("L'échéance doit être à partir de la date de demande.", 400);
  return { enAttenteDe: p.enAttenteDe, demandeeLe, echeanceLe, derniereRelanceLe: null };
}
export function relanceDue(e: Pick<ChampsAttente, "demandeeLe" | "derniereRelanceLe">, maintenant: Date) {
  const le = e.derniereRelanceLe ?? e.demandeeLe;
  return le !== null && debutDuJour(le) < dansJours(maintenant, -7);
}
