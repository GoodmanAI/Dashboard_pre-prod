import type { CrmGeocodageStatut } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import {
  analyserReponse, appelerService, codePostalSaisi, construireRequete, geocodageActif,
  type RaisonEchec, type ServiceGeocodage, type StatutGeocodage,
} from "./geocoder";
import { creerFile, type FileGeocodage } from "./file";

/**
 * Les tâches en attente de la file sont perdues à l'arrêt du processus
 * (redémarrage, déploiement) : elles ne vivent qu'en mémoire. Rien n'est perdu
 * pour autant : les centres restent A_FAIRE en base, et le rattrapage planifié
 * (`npm run geocoder`, toutes les 15 minutes) les reprend.
 *
 * L'écriture de la position d'un centre (lot U), toujours après le commit de
 * l'écriture humaine, jamais pendant : même principe que la ligne d'audit
 * (C-22). La transaction qui crée un centre ou change son adresse le laisse en
 * A_FAIRE (valeur par défaut, ou `GEOCODAGE_A_REFAIRE`) ; puis
 * `geocoderApresCommit` lance le géocodage sans l'attendre. L'utilisateur
 * n'attend jamais le service.
 *
 * Le résultat s'écrit sous condition : même statut lu, même rue, même code
 * postal, même ville. Si l'adresse a changé entre-temps, il ne fait rien (le
 * nouveau changement a repassé le centre en A_FAIRE et lancé son propre
 * géocodage). L'écriture ne touche pas `majLe` : ce n'est pas une modification
 * humaine.
 *
 * Rien n'est journalisé : une position calculée par un service n'est pas un
 * fait métier saisi. Les logs portent l'identifiant du centre et le statut,
 * jamais l'adresse.
 */

export type IssueGeocodage =
  /** Le centre n'existe plus, ou n'est plus dans un statut à traiter : rien d'écrit. */
  | { issue: "ignore"; appel: false }
  /** Écrit (ou dépassé par un changement d'adresse : `ecrit` à false). */
  | { issue: "conclu"; statut: StatutGeocodage; ecrit: boolean; appel: boolean }
  /** Erreur réseau, 429 (avec la pause demandée), réponse illisible ou malformée : rien d'écrit, le centre reste à faire. */
  | { issue: "a_refaire"; raison: RaisonEchec | "malformee"; appel: true; pauseMs?: number };

let serviceCourant: ServiceGeocodage = (q) => appelerService(q);

/** Pour la vérification seulement : remplace l'appel au service par une réponse enregistrée. Rend le précédent. */
export function remplacerServiceGeocodage(service: ServiceGeocodage): ServiceGeocodage {
  const precedent = serviceCourant;
  serviceCourant = service;
  return precedent;
}

/**
 * Géocode un centre s'il est dans un des statuts demandés (A_FAIRE par défaut ;
 * `npm run geocoder -- --tous` ajoute AMBIGU et INTROUVABLE). Ne lève pas pour
 * une panne du service ; une panne de la base, elle, remonte à l'appelant.
 */
export async function geocoderCentre(
  id: number,
  options: { statuts?: readonly CrmGeocodageStatut[]; service?: ServiceGeocodage } = {},
): Promise<IssueGeocodage> {
  const statuts = options.statuts ?? ["A_FAIRE"];
  const centre = await prisma.crmCentre.findUnique({ where: { id }, select: { adresse: true, codePostal: true, ville: true, geocodageStatut: true } });
  if (!centre || !statuts.includes(centre.geocodageStatut)) return { issue: "ignore", appel: false };

  const requete = construireRequete(centre);
  if (!requete.complete) {
    const ecrit = await ecrireSousCondition(id, centre, { statut: "ADRESSE_INCOMPLETE", latitude: null, longitude: null, score: null });
    return { issue: "conclu", statut: "ADRESSE_INCOMPLETE", ecrit, appel: false };
  }
  const reponse = await (options.service ?? serviceCourant)(requete.q);
  if (!reponse.ok) return { issue: "a_refaire", raison: reponse.raison, appel: true, ...(reponse.raison === "debit" ? { pauseMs: reponse.pauseMs } : {}) };
  const { statut, ...position } = analyserReponse(reponse.corps, codePostalSaisi(centre));
  if (statut === "A_FAIRE") return { issue: "a_refaire", raison: "malformee", appel: true };
  const ecrit = await ecrireSousCondition(id, centre, { statut, ...position });
  return { issue: "conclu", statut, ecrit, appel: true };
}

async function ecrireSousCondition(
  id: number,
  lu: { adresse: string | null; codePostal: string | null; ville: string | null; geocodageStatut: CrmGeocodageStatut },
  r: { statut: Exclude<StatutGeocodage, "A_FAIRE">; latitude: string | null; longitude: string | null; score: number | null },
): Promise<boolean> {
  // SQL direct pour ne pas toucher `majLe` (Prisma le poserait) ; requête paramétrée.
  const lignes = await prisma.$executeRaw`
    UPDATE "CrmCentre" SET
      "geocodageStatut" = ${r.statut}::"CrmGeocodageStatut",
      "latitude" = ${r.latitude}::numeric(9,6),
      "longitude" = ${r.longitude}::numeric(9,6),
      "geocodageScore" = ${r.score}::integer,
      "geocodeLe" = CURRENT_TIMESTAMP
    WHERE id = ${id}
      AND "geocodageStatut" = ${lu.geocodageStatut}::"CrmGeocodageStatut"
      AND "adresse" IS NOT DISTINCT FROM ${lu.adresse}::text
      AND "codePostal" IS NOT DISTINCT FROM ${lu.codePostal}::text
      AND "ville" IS NOT DISTINCT FROM ${lu.ville}::text`;
  return lignes === 1;
}

/* ----------------------------- Après le commit ----------------------------- */

function journalLigne(centreId: number, issue: IssueGeocodage | { issue: "erreur" }) {
  // Identifiant et statut, jamais l'adresse.
  const statut = issue.issue === "conclu" ? issue.statut : issue.issue === "a_refaire" ? "A_FAIRE" : null;
  console.log(JSON.stringify({ niveau: "info", message: "Géocodage", centreId, issue: issue.issue, statut,
    ...(issue.issue === "conclu" ? { ecrit: issue.ecrit } : {}), ...(issue.issue === "a_refaire" ? { raison: issue.raison } : {}) }));
}

/**
 * Une seule file par processus, posée sur `globalThis` : le rechargement des
 * modules en développement, ou deux routes compilées à part, ne la dédoublent
 * pas. Jamais plus de 10 requêtes par seconde vers le service, même si plusieurs
 * écritures arrivent ensemble (import, copie d'un groupe). Bornée à 500 centres
 * en attente ; les règles sont dans `file.ts`.
 */
const CLE_FILE = "__pilotFileGeocodage";
function fileDuProcessus(): FileGeocodage {
  const global = globalThis as typeof globalThis & { [CLE_FILE]?: FileGeocodage };
  return global[CLE_FILE] ??= creerFile({
    traiter: async (id) => {
      const issue = await geocoderCentre(id);
      if (issue.issue !== "ignore") journalLigne(id, issue);
      if (!issue.appel) return { appel: false };
      return issue.issue === "a_refaire" ? { appel: true, echec: issue.raison, pauseMs: issue.pauseMs } : { appel: true, echec: null };
    },
    signaler: (e) => console.error(JSON.stringify({ niveau: e.message.startsWith("Géocodage échoué") ? "erreur" : "avertissement", ...e })),
  });
}

/**
 * Géocode ces centres après le commit, sans être attendu : à appeler juste après
 * `transactionJournalisee`, sur les centres créés ou dont l'adresse a changé.
 * Seuls ceux encore en A_FAIRE sont traités. Coupé pendant les tests et quand
 * PILOT_GEOCODAGE=0 : rien ne part, les centres restent à faire. File pleine :
 * le centre reste à faire, le rattrapage planifié le reprendra.
 */
export function geocoderApresCommit(centreIds: readonly number[]): void {
  if (!geocodageActif() || !centreIds.length) return;
  fileDuProcessus().ajouter(centreIds);
}

/** Comme `geocoderApresCommit`, pour les centres encore à faire de ces clients (sites créés en lot). */
export function geocoderCentresDe(organisationIds: readonly number[]): void {
  if (!geocodageActif() || !organisationIds.length) return;
  void prisma.crmCentre.findMany({ where: { organisationId: { in: [...new Set(organisationIds)] }, geocodageStatut: "A_FAIRE" }, select: { id: true }, orderBy: { id: "asc" } })
    .then((centres) => geocoderApresCommit(centres.map((c) => c.id)))
    .catch((erreur: unknown) => {
      console.error(JSON.stringify({ niveau: "erreur", message: "Géocodage échoué", cause: erreur instanceof Error ? erreur.name : "inconnue" }));
    });
}

/** Pour la vérification : attend que la file soit vide. */
export async function attendreGeocodages(): Promise<void> {
  await fileDuProcessus().attendre();
}
