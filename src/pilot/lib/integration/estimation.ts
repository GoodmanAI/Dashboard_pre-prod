import type { CrmCleEtape, CrmTiers } from "@prisma/client";
import { definitionEtape, etapesSuivies } from "@/pilot/lib/checklist/definition";
import { libelleAttente } from "@/pilot/lib/checklist/reglesAttentes";
import { compter } from "@/pilot/lib/texte";
import { dateRealiste, ecartJours } from "./dateRealiste";
import { pret, type Manquante } from "./pret";
import { enSuiviRenforce } from "./suiviRenforce";

export type LigneEstimation = {
  cle: CrmCleEtape; faite: boolean; creeLe: Date; echeanceLe: Date | null; enAttenteDe: CrmTiers | null;
  demandeeLe?: Date | null; motif?: string | null;
};
export type Estimation = {
  dateRealiste: string; resteJours: number; ecartJours: number | null;
  etapeCritique: { cle: CrmCleEtape; libelle: string; enAttenteDe: CrmTiers | null } | null;
  pret: boolean; manquantes: Manquante[]; enProduction: boolean; reserves: boolean;
  miseEnProductionLe: string | null; suiviRenforceJusquAu: string | null;
};

/**
 * Ce que la fiche, Intégrations et Aujourd'hui disent d'un rattachement, depuis
 * les lignes déjà chargées : aucune lecture. Le compte part du référentiel du
 * produit (C-29) : une case absente est ouverte, créée « maintenant », et une
 * case automatique jamais évaluée le dit. Une étape du lot V absente est, elle,
 * hors du compte : le déploiement était déjà en service à son arrivée (C-85).
 */
export function estimerRattachement({ produit, lignes, datePromise, miseEnProductionLe = null, suiviRenforceJusquAu = null, maintenant }: {
  produit: string; lignes: LigneEstimation[]; datePromise: Date | null;
  miseEnProductionLe?: Date | null; suiviRenforceJusquAu?: Date | null; maintenant: Date;
}): Estimation {
  const parCle = new Map(lignes.map((l) => [l.cle, l]));
  const etapes = etapesSuivies(produit, (cle) => parCle.has(cle)).map((def) => {
    const l = parCle.get(def.cle);
    return { cle: def.cle, faite: l?.faite ?? false, creeLe: l?.creeLe ?? maintenant, echeanceLe: l?.echeanceLe ?? null,
      enAttenteDe: l?.enAttenteDe ?? null, demandeeLe: l?.demandeeLe ?? null,
      motif: l ? l.motif ?? null : def.mode === "AUTOMATIQUE" ? "Pas encore vérifiée" : null };
  });
  const realiste = dateRealiste({ etapes, maintenant });
  const etat = pret({ etapes, maintenant, produit });
  const enProduction = etapes.some((e) => e.cle === "PASSAGE_PRODUCTION" && e.faite);
  const critique = realiste.etapeCritique ? etapes.find((e) => e.cle === realiste.etapeCritique)! : null;
  return {
    dateRealiste: realiste.date.toISOString(), resteJours: realiste.resteJours, ecartJours: ecartJours(realiste.date, datePromise),
    etapeCritique: critique ? { cle: critique.cle, libelle: definitionEtape(critique.cle, produit).libelle, enAttenteDe: critique.enAttenteDe } : null,
    pret: etat.pret, manquantes: etat.manquantes, enProduction, reserves: enProduction && !etat.pret,
    miseEnProductionLe: miseEnProductionLe?.toISOString() ?? null,
    suiviRenforceJusquAu: suiviRenforceJusquAu && enSuiviRenforce(suiviRenforceJusquAu, maintenant) ? suiviRenforceJusquAu.toISOString() : null,
  };
}

/** Plus en retard d'abord ; sans date promise à la fin ; puis date promise, puis identifiant. */
export function trierParEcart<T extends { id: number; datePromise: string | null; estimation: Pick<Estimation, "ecartJours"> }>(lignes: T[]): T[] {
  const ecart = (l: T) => l.estimation.ecartJours ?? Number.NEGATIVE_INFINITY;
  return [...lignes].sort((a, b) => ecart(b) - ecart(a) || (a.datePromise ?? "").localeCompare(b.datePromise ?? "") || a.id - b.id);
}

// Textes d'écran, sans horloge : les composants client les appellent tels quels.
export const dateCourte = (v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
export const libelleDateRealiste = (e: Pick<Estimation, "dateRealiste">) => `${dateCourte(e.dateRealiste)}, estimation`;
/** Pour la fiche et Intégrations : « 6 jours après la promesse », « 3 jours d'avance ». */
export function libelleEcart(ecart: number | null): string {
  if (ecart === null) return "Sans date promise";
  if (ecart > 0) return `${compter(ecart, "jour")} après la promesse`;
  if (ecart < 0) return `${compter(-ecart, "jour")} d'avance`;
  return "À la date promise";
}
/** Pour Aujourd'hui : « 6 jours de retard ». */
export function libelleRetard(ecart: number): string {
  if (ecart > 0) return `${compter(ecart, "jour")} de retard`;
  if (ecart < 0) return `${compter(-ecart, "jour")} d'avance`;
  return "dans les temps";
}
/** « Surtout : Jeton d'accès Xplore reçu d'EDL et testé, en attente d'EDL ». */
export function libelleCritique(c: NonNullable<Estimation["etapeCritique"]>): string {
  const attente = c.enAttenteDe ? libelleAttente(c.enAttenteDe) : null;
  return `Ce qui retarde le plus : ${c.libelle}${attente ? `, ${attente.charAt(0).toLowerCase()}${attente.slice(1)}` : ""}`;
}
/** Trois manquantes au plus, puis « et 2 autres ». */
export function manquantesCourtes(manquantes: Manquante[], nombre = 3) {
  const reste = manquantes.length - nombre;
  return { visibles: manquantes.slice(0, nombre), suite: reste > 0 ? `et ${compter(reste, "autre")}` : null };
}
