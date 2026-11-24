import { echecDuService, INTERVALLE_MIN_MS, PAUSE_APRES_DEBIT_MS, PAUSE_DEBIT_MAX_MS, type RaisonEchec } from "./geocoder";

/**
 * La file des géocodages lancés après une écriture (lot U), sans base ni réseau :
 * elle reçoit la façon de traiter un centre et la façon d'attendre, pour que les
 * tests la jouent avec un service simulé et une horloge à eux (`file.test.ts`).
 * `localiser.ts` en pose une seule par processus.
 *
 * - Bornée : au plus `max` centres en attente (500). Au-delà, rien n'est ajouté :
 *   le centre reste A_FAIRE en base, le rattrapage planifié le reprendra.
 * - Un centre déjà en attente n'est pas ajouté deux fois.
 * - Un départ toutes les `intervalleMs` au plus (10 par seconde).
 * - Après un refus pour débit (429), une pause de `Retry-After` borné, sinon 5 s.
 * - Après `echecsMax` échecs du service d'affilée (réseau, 429, autre refus), la
 *   file se vide : le service est injoignable, inutile d'insister. Les centres
 *   restent A_FAIRE, le rattrapage planifié les reprendra.
 *
 * Les tâches en attente ne vivent qu'en mémoire : elles sont perdues à l'arrêt
 * du processus. Rien n'est perdu pour autant : les centres restent A_FAIRE en
 * base, et `npm run geocoder`, planifié toutes les 15 minutes, les reprend.
 */

/** Ce que le traitement d'un centre rend à la file : a-t-il appelé le service, et sinon pourquoi a-t-il échoué. */
export type IssueTraitement =
  | { appel: false }
  | { appel: true; echec: null }
  | { appel: true; echec: RaisonEchec | "malformee"; pauseMs?: number };

export type OptionsFile = {
  traiter: (id: number) => Promise<IssueTraitement>;
  dormir?: (ms: number) => Promise<void>;
  max?: number;
  intervalleMs?: number;
  echecsMax?: number;
  /** Un événement à consigner (jamais d'adresse) : file pleine, file vidée, panne de traitement. */
  signaler?: (evenement: { message: string; centreId?: number; nombre?: number; cause?: string }) => void;
};

export const TAILLE_MAX_FILE = 500;
export const ECHECS_SERVICE_MAX = 5;

export type FileGeocodage = {
  /** Ajoute ces centres (sans doublon, dans la limite) ; rend le nombre ajouté. */
  ajouter: (ids: readonly number[]) => number;
  /** Les centres en attente, sans celui en cours. */
  enAttente: () => number;
  /** Se résout quand la file est vide et au repos. */
  attendre: () => Promise<void>;
};

const dormirParDefaut = (ms: number) => new Promise<void>((resoudre) => setTimeout(resoudre, ms));

export function creerFile(options: OptionsFile): FileGeocodage {
  const { traiter, dormir = dormirParDefaut, max = TAILLE_MAX_FILE, intervalleMs = INTERVALLE_MIN_MS, echecsMax = ECHECS_SERVICE_MAX } = options;
  const signaler = options.signaler ?? (() => undefined);
  const attente: number[] = [];
  const presents = new Set<number>();
  let travail: Promise<void> | null = null;
  let echecs = 0;

  async function boucle() {
    while (attente.length) {
      const id = attente.shift()!;
      presents.delete(id);
      let issue: IssueTraitement;
      try {
        issue = await traiter(id);
      } catch (erreur) {
        // Une panne de la base ne remonte jamais à l'utilisateur : le centre reste à faire.
        signaler({ message: "Géocodage échoué", centreId: id, cause: erreur instanceof Error ? erreur.name : "inconnue" });
        continue;
      }
      if (!issue.appel) continue;
      if (issue.echec !== null && echecDuService(issue.echec)) {
        echecs += 1;
        if (echecs >= echecsMax) {
          const nombre = attente.length;
          attente.length = 0;
          presents.clear();
          echecs = 0;
          signaler({ message: "Géocodage suspendu : service injoignable", nombre });
          break;
        }
      } else {
        echecs = 0;
      }
      const pause = issue.echec === "debit"
        ? Math.min(PAUSE_DEBIT_MAX_MS, Math.max(intervalleMs, issue.pauseMs ?? PAUSE_APRES_DEBIT_MS))
        : intervalleMs;
      await dormir(pause);
    }
  }

  function lancer() {
    if (travail) return;
    travail = boucle().finally(() => {
      travail = null;
      // Ajouté pendant la dernière pause, après la sortie de boucle : on repart.
      if (attente.length) lancer();
    });
  }

  return {
    ajouter(ids) {
      let ajoutes = 0, refuses = 0;
      for (const id of ids) {
        if (presents.has(id)) continue;
        if (attente.length >= max) { refuses += 1; continue; }
        attente.push(id);
        presents.add(id);
        ajoutes += 1;
      }
      if (refuses) signaler({ message: "Géocodage : file pleine, centres laissés au rattrapage", nombre: refuses });
      if (ajoutes) lancer();
      return ajoutes;
    },
    enAttente: () => attente.length,
    async attendre() {
      while (travail) await travail;
    },
  };
}
