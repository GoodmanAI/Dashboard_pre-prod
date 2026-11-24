import { grilleDepuisTarifs, type GrilleEnVigueur, type TarifGrille } from "@/pilot/lib/tarifs/grille";
import { prixDepuisGrille } from "./prix";
import type { ModeInstallation } from "./referentiel";

/**
 * Jeu d'essai partagé par les tests de l'apport (lot S). Aucun écran ni aucune
 * route ne l'importe.
 */

/** Les anciens réglages TTC de l'apport, ceux du calculateur (grille 2026) : la source de la première grille commune. */
export const REGLAGES_CALCULATEUR_2026 = {
  talkTtcCentimes: 32500, konnectTtcCentimes: 9500, tvaPdm: 2000, connecteurRisPdm: 1500,
  installationTalkCentimes: 75000, installationKonnectCentimes: 45000, modeInstallation: "site" as ModeInstallation,
};
export type ReglagesTtc = typeof REGLAGES_CALCULATEUR_2026;

/** TTC vers HT comme le SQL du lot S et l'ancien `prixHt` : arrondi au centime, demi vers le haut, en entiers. */
const htDepuisTtc = (ttc: number, tvaPdm: number) => {
  const coef = BigInt(10000 + tvaPdm);
  return Number((2n * BigInt(ttc) * 10000n + coef) / (2n * coef));
};
const BASE_INSTALLATION = { site: "PAR_SITE", groupe: "PAR_ORGANISATION", salle: "PAR_SALLE" } as const;

/**
 * La grille que `2026_12_13_pilot_tarifs.sql` tire des réglages de l'apport,
 * reproduite en objets : HT par salle, pour-mille arrondi demi vers le haut,
 * installations converties et datées de leur mode.
 */
export function tarifsDepuisReglages(r: ReglagesTtc): TarifGrille[] {
  const inst = BASE_INSTALLATION[r.modeInstallation];
  return [
    { code: "TALK", libelle: "Talk", productId: 1, type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: htDepuisTtc(r.talkTtcCentimes, r.tvaPdm), pourMille: null },
    { code: "KONNECT", libelle: "Konnect", productId: 2, type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: htDepuisTtc(r.konnectTtcCentimes, r.tvaPdm), pourMille: null },
    { code: "DESK", libelle: "Desk", productId: 3, type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: null, pourMille: null },
    { code: "NOSHOW", libelle: "NoShow", productId: 4, type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: null, pourMille: null },
    { code: "CONNECTEUR_RIS", libelle: "Connecteur RIS", productId: null, type: "ABONNEMENT", base: "POURCENTAGE", montantHtCentimes: null,
      pourMille: Math.floor((r.connecteurRisPdm + 5) / 10) },
    { code: "INSTALLATION_TALK", libelle: "Installation et formation Talk", productId: 1, type: "MISE_EN_SERVICE", base: inst,
      montantHtCentimes: htDepuisTtc(r.installationTalkCentimes, r.tvaPdm), pourMille: null },
    { code: "INSTALLATION_KONNECT", libelle: "Installation et formation Konnect", productId: 2, type: "MISE_EN_SERVICE", base: inst,
      montantHtCentimes: htDepuisTtc(r.installationKonnectCentimes, r.tvaPdm), pourMille: null },
  ];
}

export const grilleDepuisReglages = (r: ReglagesTtc, id = 1): GrilleEnVigueur =>
  grilleDepuisTarifs({ id, applicableLe: new Date("2026-11-18T00:00:00Z") }, tarifsDepuisReglages(r));

/** La première grille telle qu'elle est en base (vérification et travail), écrite à la main. */
export const GRILLE_EN_BASE: GrilleEnVigueur = grilleDepuisTarifs({ id: 1, applicableLe: new Date("2026-11-18T00:00:00Z") }, [
  { code: "TALK", libelle: "Talk", productId: 1, type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: 27083, pourMille: null },
  { code: "KONNECT", libelle: "Konnect", productId: 2, type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: 7917, pourMille: null },
  { code: "DESK", libelle: "Desk", productId: 3, type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: null, pourMille: null },
  { code: "NOSHOW", libelle: "NoShow", productId: 4, type: "ABONNEMENT", base: "PAR_SALLE", montantHtCentimes: null, pourMille: null },
  { code: "CONNECTEUR_RIS", libelle: "Connecteur RIS", productId: null, type: "ABONNEMENT", base: "POURCENTAGE", montantHtCentimes: null, pourMille: 150 },
  { code: "INSTALLATION_TALK", libelle: "Installation et formation Talk", productId: 1, type: "MISE_EN_SERVICE", base: "PAR_SITE", montantHtCentimes: 62500, pourMille: null },
  { code: "INSTALLATION_KONNECT", libelle: "Installation et formation Konnect", productId: 2, type: "MISE_EN_SERVICE", base: "PAR_SITE", montantHtCentimes: 37500, pourMille: null },
]);

/** Les prix de l'apport tirés de la grille en base, TVA à 20 %. */
export const PRIX_EN_BASE = prixDepuisGrille(GRILLE_EN_BASE, 2000).prix;
