import type { CrmStatutSujetSupport } from "@prisma/client";

/**
 * Le support dans Pilot (25/11/2026, plan lyrae/plans/2026-11-support-dans-pilot.md).
 * Fonctions pures : le service, les écrans et le script de relance lisent les mêmes.
 *
 * Un sujet est un problème d'un client. Le technicien y écrit ce qu'il faut dire au
 * client ; le commercial du client le transmet et le dit. Tout le monde est en copie
 * pour l'instant (décision d'Enzo du 25/11 : petite équipe, peu de clients).
 */
export type StatutSujet = CrmStatutSujetSupport;

export const LIBELLES_STATUT: Record<StatutSujet, string> = {
  OUVERT: "Ouvert",
  A_TRANSMETTRE: "À transmettre",
  TRANSMIS: "Transmis au client",
  RESOLU: "Résolu",
};

/** Ce que veut dire chaque statut, en une phrase, pour la liste et le fil. */
export const DETAILS_STATUT: Record<StatutSujet, string> = {
  OUVERT: "Rien à dire au client pour l'instant.",
  A_TRANSMETTRE: "Un texte attend d'être dit au client.",
  TRANSMIS: "Le commercial l'a dit au client.",
  RESOLU: "Le problème est réglé.",
};

/** Tout le monde en copie de tout : à passer à false quand l'équipe grandira. */
export const TOUT_LE_MONDE_EN_COPIE = true;

export type MembreSupport = { id: number; actif: boolean };
export type Destinataires = { principal: number | null; copie: number[] };

/**
 * Qui reçoit un message, un changement de statut ou une relance : le commercial du
 * client en tête, les autres comptes internes en copie. Jamais l'auteur du geste (il
 * sait ce qu'il vient de faire), jamais un compte dont l'accès est retiré.
 */
export function destinatairesSupport(p: { responsableId: number | null; equipe: MembreSupport[]; auteurId: number | null }): Destinataires {
  const actifs = p.equipe.filter((m) => m.actif && m.id !== p.auteurId).map((m) => m.id);
  const principal = p.responsableId !== null && actifs.includes(p.responsableId) ? p.responsableId : null;
  const copie = TOUT_LE_MONDE_EN_COPIE ? actifs.filter((id) => id !== principal) : [];
  return { principal, copie };
}

/** Tous les destinataires, le principal d'abord. */
export const tousLesDestinataires = (d: Destinataires): number[] => (d.principal === null ? d.copie : [d.principal, ...d.copie]);

/**
 * Le statut après un message. Un texte « à dire au client » remet le sujet à
 * transmettre ; une simple note rouvre un sujet résolu, et ne change rien sinon.
 */
export function statutApresMessage(statut: StatutSujet, aDireAuClient: boolean): StatutSujet {
  if (aDireAuClient) return "A_TRANSMETTRE";
  return statut === "RESOLU" ? "OUVERT" : statut;
}

/** Le statut d'un sujet qui naît : à transmettre s'il porte déjà un texte pour le client. */
export const statutInitial = (aDireAuClient: boolean): StatutSujet => (aDireAuClient ? "A_TRANSMETTRE" : "OUVERT");

/**
 * Pourquoi ce changement de statut est refusé, ou null. On marque transmis ce qui
 * était à transmettre, résolu ce qui ne l'est pas, et on rouvre un sujet résolu.
 */
export function refusChangementStatut(depuis: StatutSujet, vers: StatutSujet): string | null {
  if (depuis === vers) return "Le sujet est déjà dans ce statut. Rechargez la page.";
  if (vers === "TRANSMIS") return depuis === "A_TRANSMETTRE" ? null : "Seul un sujet à transmettre peut être marqué transmis au client.";
  if (vers === "RESOLU") return null;
  if (vers === "OUVERT") return depuis === "RESOLU" ? null : "Seul un sujet résolu se rouvre.";
  return "Un sujet passe à transmettre quand on y écrit un texte pour le client.";
}

const estOuvre = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

/** `depuis` plus `jours` jours ouvrés, à la même heure (samedi et dimanche ne comptent pas). */
export function ajouterJoursOuvres(depuis: Date, jours: number): Date {
  const d = new Date(depuis);
  let restants = jours;
  while (restants > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (estOuvre(d)) restants--;
  }
  return d;
}

/**
 * Une relance est due pour un sujet resté à transmettre un jour ouvré entier, puis
 * chaque jour ouvré tant que rien ne bouge (24 h ouvrées, décision du 25/11).
 */
export function relanceDue(s: { statut: StatutSujet; statutDepuisLe: Date; derniereRelanceLe: Date | null }, maintenant: Date): boolean {
  if (s.statut !== "A_TRANSMETTRE") return false;
  const depart = s.derniereRelanceLe && s.derniereRelanceLe > s.statutDepuisLe ? s.derniereRelanceLe : s.statutDepuisLe;
  return ajouterJoursOuvres(depart, 1) <= maintenant;
}

/** L'adresse du fil d'un sujet, dans Pilot. */
export const lienSujet = (id: number) => `/pilot/support/${id}`;
