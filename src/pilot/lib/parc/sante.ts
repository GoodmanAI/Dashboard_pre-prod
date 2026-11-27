import { compter } from "@/pilot/lib/texte";
import { SEUIL_SILENCE_HEURES } from "@/pilot/lib/integration/suiviRenforce";
import type { UsageCentre } from "./usage";

/**
 * La santé d'un centre en production : quatre feux, jamais une note composite
 * (propositions §7.2). Un score à 72/100 ne dit pas quoi faire ; quatre feux
 * disent lequel est rouge. Chaque feu porte son libellé et sa raison en texte :
 * la couleur seule ne dit rien à un lecteur d'écran.
 *
 * Pur : aucune lecture, `maintenant` en paramètre, tout en entiers.
 */
export type CouleurFeu = "vert" | "orange" | "rouge" | "gris";
export type Feu = { couleur: CouleurFeu; libelle: string; raison: string };
export type SanteCentre = {
  usage: Feu; rdv: Feu; incidents: Feu; silence: Feu;
  desk: { disponible: boolean; texte: string };
};

// Seuils dans le code (comme C-20), à réviser après trois mois de parc. Les
// pourcentages se comparent tels qu'ils s'affichent, arrondis vers zéro : l'écran
// ne dit jamais « 80 % » sur un feu orange.
/** Usage : vert à 80 % du volume annoncé ou plus, orange de 50 à 80 %, rouge sous 50 %. */
export const SEUIL_USAGE_VERT = 80;
export const SEUIL_USAGE_ORANGE = 50;
/** Une baisse de plus de 20 % entre les deux dernières semaines et les deux précédentes fait passer au moins à orange. */
export const SEUIL_BAISSE_TENDANCE = 20;
/** À moins de 5 % d'écart, la tendance est « stable ». */
export const SEUIL_TENDANCE_STABLE = 5;
/** RDV pris : vert à 30 % des appels ou plus, orange de 15 à 30 %, rouge sous 15 %. */
export const SEUIL_RDV_VERT = 30;
export const SEUIL_RDV_ORANGE = 15;
/** Silence : vert sous 24 h, orange de 24 à 48 h, rouge à 48 h ou plus, le seuil de l'alerte `silence-`. */
export const SEUIL_SILENCE_ORANGE_HEURES = 24;
export const SEUIL_SILENCE_ROUGE_HEURES = SEUIL_SILENCE_HEURES;
/** Incidents : vert sans ticket ouvert, orange à 1 ou 2, rouge à 3 ou plus. */
export const SEUIL_INCIDENTS_ROUGE = 3;
/** La fenêtre d'usage : quatre semaines glissantes. */
export const JOURS_USAGE = 28;

const HEURE = 3600000;

/** Deux dernières semaines contre les deux précédentes, en pourcentage entier signé. */
export function tendance(semaines: UsageCentre["semaines"]): { pourcentage: number | null; texte: string | null } {
  const [n4, n3, n2, n1] = semaines;
  const avant = n4 + n3;
  const recent = n2 + n1;
  if (avant + recent === 0) return { pourcentage: null, texte: null };
  if (avant === 0) return { pourcentage: null, texte: "en hausse, aucun appel les deux semaines d'avant" };
  const pourcentage = Math.trunc((100 * (recent - avant)) / avant);
  if (Math.abs(pourcentage) < SEUIL_TENDANCE_STABLE) return { pourcentage, texte: "stable" };
  return { pourcentage, texte: pourcentage > 0 ? `en hausse de ${pourcentage} %` : `en baisse de ${-pourcentage} %` };
}

function feuUsage(volumeAnnonceParJour: number | null, centresEnProduction: number, usage: UsageCentre): Feu {
  const libelle = "Volume d'appels";
  const t = tendance(usage.semaines);
  const suite = usage.appels === 0 ? "aucun appel sur 4 semaines" : t.texte;
  if (!volumeAnnonceParJour || volumeAnnonceParJour <= 0) {
    return { couleur: "gris", libelle, raison: `Volume annoncé non renseigné${suite ? `, ${suite}` : ""}.` };
  }
  const centres = Math.max(1, centresEnProduction);
  // Moyenne par jour sur 28 jours rapportée au volume réparti, en une seule division entière.
  const pourcentage = Math.floor((100 * usage.appels * centres) / (JOURS_USAGE * volumeAnnonceParJour));
  let couleur: CouleurFeu = pourcentage >= SEUIL_USAGE_VERT ? "vert" : pourcentage >= SEUIL_USAGE_ORANGE ? "orange" : "rouge";
  if (couleur === "vert" && t.pourcentage !== null && t.pourcentage < -SEUIL_BAISSE_TENDANCE) couleur = "orange";
  const repartition = centres > 1 ? ` Volume annoncé de l'organisation, réparti sur ${compter(centres, "centre")}.` : "";
  return { couleur, libelle, raison: `${pourcentage} % du volume annoncé${suite ? `, ${suite}` : ""}.${repartition}` };
}

function feuRdv(usage: UsageCentre): Feu {
  const libelle = "RDV pris";
  if (usage.appels === 0) return { couleur: "gris", libelle, raison: "Aucun appel sur 4 semaines." };
  const pourcentage = Math.floor((100 * usage.rdv) / usage.appels);
  const couleur: CouleurFeu = pourcentage >= SEUIL_RDV_VERT ? "vert" : pourcentage >= SEUIL_RDV_ORANGE ? "orange" : "rouge";
  return { couleur, libelle, raison: `${pourcentage} % des appels sur 4 semaines, ${compter(usage.rdv, "RDV", "RDV")} sur ${compter(usage.appels, "appel")}.` };
}

function feuIncidents(tickets: number | null, compteDashboard: boolean): Feu {
  const libelle = "Incidents";
  if (tickets === null) {
    return { couleur: "gris", libelle, raison: compteDashboard ? "Demandes des clients illisibles pour l'instant." : "Aucun compte Dashboard associé à l'organisation." };
  }
  if (tickets <= 0) return { couleur: "vert", libelle, raison: "Aucune demande de client ouverte." };
  return { couleur: tickets >= SEUIL_INCIDENTS_ROUGE ? "rouge" : "orange", libelle, raison: `${compter(tickets, "demande de client ouverte", "demandes de client ouvertes")}.` };
}

function feuSilence(dernierAppelLe: Date | null, maintenant: Date): Feu {
  const libelle = "Dernier appel";
  if (!dernierAppelLe) return { couleur: "rouge", libelle, raison: "Aucun appel enregistré." };
  const heures = Math.max(0, Math.floor((maintenant.getTime() - dernierAppelLe.getTime()) / HEURE));
  const couleur: CouleurFeu = heures < SEUIL_SILENCE_ORANGE_HEURES ? "vert" : heures < SEUIL_SILENCE_ROUGE_HEURES ? "orange" : "rouge";
  const depuis = heures < 1 ? "moins d'une heure" : heures < 72 ? `${heures} h` : compter(Math.floor(heures / 24), "jour");
  return { couleur, libelle, raison: `Dernier appel il y a ${depuis}.` };
}

export function santeCentre({ volumeAnnonceParJour, centresEnProduction = 1, usage, dernierAppelLe, ticketsOuverts, compteDashboard = true, deskPart, maintenant, passeDesAppels = true }: {
  /** Volume d'appels par jour annoncé pour toute l'organisation. */
  volumeAnnonceParJour: number | null;
  /** Rattachements de l'organisation en production, entre lesquels le volume se répartit à parts égales. */
  centresEnProduction?: number;
  usage: UsageCentre;
  dernierAppelLe: Date | null;
  /** Null : la source n'est pas branchée, ou l'organisation n'a pas de compte Dashboard. */
  ticketsOuverts: number | null;
  compteDashboard?: boolean;
  /** Part des RDV pris dans Desk, en pourcentage entier ; null sans source. */
  deskPart: number | null;
  maintenant: Date;
  /** Faux pour NoShow (C-56) : sans appel, les feux d'appels sont gris et le disent. */
  passeDesAppels?: boolean;
}): SanteCentre {
  const sansAppel = (libelle: string): Feu => ({ couleur: "gris", libelle, raison: "Ce produit ne passe pas d'appels. Indicateur à brancher sur les rappels envoyés." });
  return {
    usage: passeDesAppels ? feuUsage(volumeAnnonceParJour, centresEnProduction, usage) : sansAppel("Volume d'appels"),
    rdv: passeDesAppels ? feuRdv(usage) : sansAppel("RDV pris"),
    incidents: feuIncidents(ticketsOuverts, compteDashboard),
    silence: passeDesAppels ? feuSilence(dernierAppelLe, maintenant) : sansAppel("Dernier appel"),
    desk: deskPart === null
      ? { disponible: false, texte: "Desk n'est pas encore en service." }
      : { disponible: true, texte: `${deskPart} % des RDV pris dans Desk, le reste dans Xplore.` },
  };
}

export const feuxDe = (s: SanteCentre): Feu[] => [s.usage, s.rdv, s.incidents, s.silence];

/**
 * Un centre est en production quand le passage est déclaré dans Pilot, ou quand
 * le Dashboard le dit EN_PRODUCTION. L'un ou l'autre suffit ; la ligne dit
 * lequel manque.
 */
export function production({ declaree, statutCentre }: { declaree: boolean; statutCentre: string | null }): { enProduction: boolean; mention: string | null } {
  const auDashboard = statutCentre === "EN_PRODUCTION";
  if (declaree && auDashboard) return { enProduction: true, mention: null };
  if (declaree) return { enProduction: true, mention: "Déclaré dans Pilot, pas encore au Dashboard." };
  if (auDashboard) return { enProduction: true, mention: "En service sur le Dashboard, mise en service pas encore déclarée dans Pilot." };
  return { enProduction: false, mention: null };
}

export function gravite(s: SanteCentre) {
  const feux = feuxDe(s);
  return { rouges: feux.filter((f) => f.couleur === "rouge").length, oranges: feux.filter((f) => f.couleur === "orange").length };
}

type LigneTriable = { id: number; organisationNom: string; centreNom: string; produit: string; sante: SanteCentre };
/** Le plus de feux rouges d'abord, puis le plus d'orange, puis l'organisation, le centre et le produit. */
export function trierParGravite<T extends LigneTriable>(lignes: T[]): T[] {
  const g = new Map(lignes.map((l) => [l, gravite(l.sante)]));
  return [...lignes].sort((a, b) => g.get(b)!.rouges - g.get(a)!.rouges || g.get(b)!.oranges - g.get(a)!.oranges
    || a.organisationNom.localeCompare(b.organisationNom, "fr") || a.centreNom.localeCompare(b.centreNom, "fr")
    || a.produit.localeCompare(b.produit, "fr") || a.id - b.id);
}

/** « 3 centres en production · 1 en rouge · 1 en orange ». Un centre compte une fois, à son feu le plus grave. */
export function resumeParc(lignes: Pick<LigneTriable, "sante">[]): string {
  const gravites = lignes.map((l) => gravite(l.sante));
  const enRouge = gravites.filter((g) => g.rouges > 0).length;
  const enOrange = gravites.filter((g) => g.rouges === 0 && g.oranges > 0).length;
  const parties = [compter(lignes.length, "centre en service", "centres en service")];
  if (enRouge) parties.push(`${enRouge} en rouge`);
  if (enOrange) parties.push(`${enOrange} en orange`);
  if (lignes.length && !enRouge && !enOrange) parties.push("rien en rouge ni en orange");
  return parties.join(" · ");
}
