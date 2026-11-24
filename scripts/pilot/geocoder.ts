/**
 * npm run geocoder [-- --tous] : rattrape la position des centres (lot U).
 *
 * Traite les centres en A_FAIRE (centres d'avant la carte, service injoignable
 * au moment de l'écriture, 429). Avec --tous, reprend aussi les AMBIGU et les
 * INTROUVABLE. Une adresse incomplète ne se rattrape pas ici : on la complète
 * sur la fiche, ce qui relance le géocodage.
 *
 * Planifié toutes les 15 minutes, comme `npm run evaluer` (crontab de
 * docs/INTEGRATION-DASHBOARD.md) : il reprend les centres que la file du serveur
 * n'a pas traités (tâches perdues à un redémarrage, file pleine, service
 * injoignable).
 *
 * Rejouable : chaque résultat s'écrit sous la même condition qu'après une
 * écriture (même statut lu, même rue, code postal et ville), un second passage
 * ne refait que ce qui reste. Débit limité à 10 requêtes par seconde, bien sous
 * la limite du service (50). Après un 429, il attend ce que demande
 * `Retry-After` (borné à 60 s, 5 s sans en-tête). Il n'écrit que des positions :
 * il peut tourner sur la base de travail, c'est un usage réel.
 *
 * Les logs portent l'identifiant du centre et le statut, jamais l'adresse.
 * PILOT_GEOCODAGE=0 l'empêche de partir : aucun appel au service.
 */
import type { CrmGeocodageStatut } from "@prisma/client";
import { prisma } from "../../src/pilot/lib/prisma";
import { echecDuService, geocodageActif, INTERVALLE_MIN_MS, PAUSE_APRES_DEBIT_MS } from "../../src/pilot/lib/carte/geocoder";
import { ECHECS_SERVICE_MAX } from "../../src/pilot/lib/carte/file";
import { geocoderCentre } from "../../src/pilot/lib/carte/localiser";

/** Après autant d'échecs du service d'affilée, on s'arrête : le service est injoignable, inutile d'insister. */
const ECHECS_RESEAU_MAX = ECHECS_SERVICE_MAX;

const pause = (ms: number) => new Promise<void>((resoudre) => setTimeout(resoudre, ms));

async function main() {
  if (!geocodageActif()) {
    console.error("Géocodage coupé (PILOT_GEOCODAGE=0 ou NODE_ENV=test) : aucun appel au service. Rien n'a été écrit.");
    process.exitCode = 1;
    return;
  }
  const tous = process.argv.includes("--tous");
  const statuts: CrmGeocodageStatut[] = tous ? ["A_FAIRE", "AMBIGU", "INTROUVABLE"] : ["A_FAIRE"];
  const centres = await prisma.crmCentre.findMany({ where: { geocodageStatut: { in: statuts } }, select: { id: true }, orderBy: { id: "asc" } });
  console.log(`${centres.length} centre(s) à géocoder (${statuts.join(", ")}).`);

  const bilan = { OK: 0, AMBIGU: 0, INTROUVABLE: 0, ADRESSE_INCOMPLETE: 0, aRefaire: 0, depasses: 0 };
  let echecsDAffilee = 0, dernierAppel = 0, arret = false;
  for (const { id } of centres) {
    // 10 requêtes par seconde au plus : on espace les départs.
    const attente = dernierAppel + INTERVALLE_MIN_MS - Date.now();
    if (attente > 0) await pause(attente);
    const debut = Date.now();
    const issue = await geocoderCentre(id, { statuts });
    if (issue.appel) dernierAppel = debut;
    if (issue.issue === "ignore") continue;
    if (issue.issue === "a_refaire") {
      bilan.aRefaire++;
      console.log(JSON.stringify({ niveau: "info", message: "Géocodage", centreId: id, statut: "A_FAIRE", raison: issue.raison }));
      if (issue.raison === "debit") await pause(issue.pauseMs ?? PAUSE_APRES_DEBIT_MS);
      echecsDAffilee = echecDuService(issue.raison) ? echecsDAffilee + 1 : 0;
      if (echecsDAffilee >= ECHECS_RESEAU_MAX) { arret = true; break; }
      continue;
    }
    echecsDAffilee = 0;
    // Dépassé : l'adresse ou le statut a changé pendant l'appel, le nouveau géocodage décidera.
    if (!issue.ecrit) { bilan.depasses++; console.log(JSON.stringify({ niveau: "info", message: "Géocodage dépassé", centreId: id })); continue; }
    bilan[issue.statut === "A_FAIRE" ? "aRefaire" : issue.statut]++;
    console.log(JSON.stringify({ niveau: "info", message: "Géocodage", centreId: id, statut: issue.statut }));
  }
  const restants = await prisma.crmCentre.count({ where: { geocodageStatut: "A_FAIRE" } });
  console.log([
    arret ? `Arrêt après ${ECHECS_RESEAU_MAX} échecs du service d'affilée : le service est injoignable. Relancez plus tard.` : "Géocodage terminé.",
    `  localisés     : ${bilan.OK}`,
    `  ambigus       : ${bilan.AMBIGU}`,
    `  introuvables  : ${bilan.INTROUVABLE}`,
    `  incomplets    : ${bilan.ADRESSE_INCOMPLETE} (adresse à compléter sur la fiche)`,
    `  à refaire     : ${bilan.aRefaire} (service injoignable ou réponse illisible)`,
    ...(bilan.depasses ? [`  dépassés      : ${bilan.depasses} (adresse changée pendant l'appel)`] : []),
    `  encore à faire en base : ${restants}`,
  ].join("\n"));
  if (arret) process.exitCode = 1;
}

main().catch((erreur: unknown) => {
  console.error(JSON.stringify({ niveau: "erreur", message: "Géocodage interrompu", cause: erreur instanceof Error ? erreur.name : "inconnue" }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
