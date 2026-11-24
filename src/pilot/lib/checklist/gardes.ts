import type { CrmCleEtape } from "@prisma/client";
import { definitionEtape, etapesSuivies, rangPhase } from "./definition";

export type EtatCase = { cle: CrmCleEtape; faite: boolean };

/** « A, B, C et 2 autres » : trois libellés au plus. */
function liste(libelles: string[]): string {
  const visibles = libelles.slice(0, 3).map((l) => `« ${l} »`);
  const reste = libelles.length - visibles.length;
  return reste > 0 ? `${visibles.join(", ")} et ${reste} ${reste > 1 ? "autres" : "autre"}` : visibles.join(", ");
}

/**
 * Les gardes du lot V (C-85), côté serveur : pourquoi une case ne peut pas
 * encore être cochée, ou null. Décocher reste toujours possible. Pure : le
 * service lit les cases du rattachement et la date promise, puis demande ici.
 */
export function refusCochage({ cle, produit, cases, datePromise }: {
  cle: CrmCleEtape; produit: string; cases: EtatCase[]; datePromise: Date | null;
}): string | null {
  const def = definitionEtape(cle, produit);
  const faite = (c: CrmCleEtape) => cases.some((e) => e.cle === c && e.faite);
  const libelle = (c: CrmCleEtape) => definitionEtape(c, produit).libelle;
  if (def.depart === "MISE_EN_SERVICE" && !faite("PASSAGE_PRODUCTION")) {
    return `Cette étape suit la mise en service. Cochez d'abord « ${libelle("PASSAGE_PRODUCTION")} ».`;
  }
  // Pas d'« En service » avec une étape bloquante ouverte (C-92). Celles qui suivent la
  // mise en service (top facturation, suivi) n'en font pas partie ; une étape du lot V
  // absente est hors du compte (C-85), comme dans `estimerRattachement`.
  if (cle === "PASSAGE_PRODUCTION") {
    const ouvertes = etapesSuivies(produit, (c) => cases.some((e) => e.cle === c))
      .filter((d) => d.bloquante && d.depart !== "MISE_EN_SERVICE" && d.cle !== cle && !faite(d.cle))
      .map((d) => d.libelle);
    if (ouvertes.length) return `Avant de déclarer la mise en service, il reste ${liste(ouvertes)}.`;
  }
  // Le PV n'est exigé que s'il est suivi : une mise en service antérieure au lot V
  // reçoit le top facturation sans PV (creationDifferee, C-85).
  const suivie = (c: CrmCleEtape) => cases.some((e) => e.cle === c);
  if (cle === "TOP_FACTURATION" && suivie("PV_RECETTE") && !faite("PV_RECETTE")) {
    return `Le top départ part avec le PV. Cochez d'abord « ${libelle("PV_RECETTE")} ».`;
  }
  if (cle === "DATE_DEMARRAGE_CONFIRMEE") {
    if (!datePromise) return "Ce centre n'a pas de date promise. Notez-la sur la fiche du compte avant de confirmer le démarrage.";
    const avant = rangPhase("GO_NO_GO");
    const manquantes = etapesSuivies(produit, suivie)
      .filter((d) => d.bloquante && rangPhase(d.phase) < avant && !faite(d.cle))
      .map((d) => d.libelle);
    if (manquantes.length) return `Avant de confirmer la date, il reste ${liste(manquantes)}.`;
  }
  return null;
}
