import { finPocADecider } from "@/pilot/lib/organisations/poc";
import { renouvellementContrat } from "@/pilot/lib/contrats/regles";
import { definitionEtape } from "@/pilot/lib/checklist/definition";
import { relanceDue, libelleAttente } from "@/pilot/lib/checklist/reglesAttentes";
import { estClient, ETAPES_COMMERCIALES, LIBELLES, suitLaMiseEnService, vieillissement } from "@/pilot/lib/pipeline";
import { debutDuJour } from "@/pilot/lib/dates";
import { decalerMois } from "@/pilot/lib/ca/projeter";
import { compter } from "@/pilot/lib/texte";
import { libelleDepartement } from "@/pilot/lib/acces/departements";
import { FAMILLES_ALERTES, LIBELLES_TYPES_ALERTE } from "./types";
import type { Alerte, AttributionAlerte, DonneesAlertes, OrganisationAlertes, ResultatAlertes, TypeAlerte } from "./types";

import { glissement } from "@/pilot/lib/integration/glissement";
import { SEUIL_SILENCE_HEURES, silenceRenforce } from "@/pilot/lib/integration/suiviRenforce";
import { joursExpiration, propositionExpiree } from "@/pilot/lib/propositions/regles";

const JOUR = 86400000;
/** Sans échange depuis ce délai, un prospect sonne ; une fiche neuve compte depuis sa création (C-91). */
export const JOURS_SANS_CONTACT = 30;
/** Une fiche neuve a ce délai pour recevoir sa prochaine action avant l'alerte (C-91). */
export const JOURS_GRACE_PROCHAINE_ACTION = 3;
/** Un client signé a ce délai pour voir son contrat activé avant l'alerte « contrat à saisir » (C-92). */
export const JOURS_GRACE_CONTRAT = 3;
export const POSTE_DIRECTION_GENERALE = "Direction générale";
export const POSTE_SUPER_ADMINISTRATEUR = "Super-administrateur";
export const POSTE_A_ATTRIBUER = "À attribuer";
const dateCourte = (date: Date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const moisDuReel = (date: Date) => {
  const nom = date.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  return `${/^[aeiouy]/i.test(nom) ? "d'" : "de "}${nom}`;
};
/** Termine une phrase par un point, sans doubler celui d'une date abrégée (« 24 oct. »). */
const phrase = (texte: string) => (texte.endsWith(".") ? texte : `${texte}.`);
function dateDuJournal(valeur: unknown, champ: string): Date | null {
  if (!valeur || typeof valeur !== "object" || !(champ in valeur)) return null;
  const texte = (valeur as Record<string, unknown>)[champ];
  if (typeof texte !== "string") return null;
  const date = new Date(texte);
  return Number.isFinite(date.getTime()) ? date : null;
}
function grouper<T>(lignes: T[], cle: (ligne: T) => string | number | null) {
  const groupes = new Map<string | number | null, T[]>();
  for (const ligne of lignes) { const id = cle(ligne); const groupe = groupes.get(id) ?? []; groupe.push(ligne); groupes.set(id, groupe); }
  return groupes;
}

/** Les dates du fait restent internes au calcul, sans enrichir le contrat Alerte. */
export function trierAlertes<T extends Alerte>(alertes: T[], datesFaits: ReadonlyMap<string, Date>): T[] {
  return [...alertes].sort((a, b) => (a.niveau === b.niveau ? 0 : a.niveau === "bloquant" ? -1 : 1)
    || (datesFaits.get(a.cle)?.getTime() ?? 0) - (datesFaits.get(b.cle)?.getTime() ?? 0)
    || a.organisationNom.localeCompare(b.organisationNom, "fr") || a.cle.localeCompare(b.cle, "fr"));
}
/** « À moi » : les alertes confiées à cette personne, d'office ou à la main (C-91). */
export function filtrerAMoi<T extends Alerte>(alertes: T[], utilisateurId: number): T[] {
  return alertes.filter((a) => a.attribution?.userId === utilisateurId);
}

/**
 * Une alerte par cause (C-91) : les signaux d'un même groupe, dans l'ordre du
 * tri, se replient sous le premier. L'ordre des alertes affichées ne change pas.
 */
export function regrouper<T extends Alerte>(alertes: T[]): T[] {
  const tetes = new Map<string, T>();
  const resultat: T[] = [];
  for (const alerte of alertes) {
    const cle = `${alerte.organisationId}:${alerte.groupe}`;
    const tete = tetes.get(cle);
    if (!tete) { const copie = { ...alerte }; tetes.set(cle, copie); resultat.push(copie); continue; }
    tete.aussi = [...(tete.aussi ?? []), { cle: alerte.cle, titre: alerte.titre, detail: alerte.detail }, ...(alerte.aussi ?? [])];
  }
  return resultat;
}

/** Toutes les clés qu'une alerte affichée représente : la sienne et celles qu'elle replie. */
export const clesDuGroupe = (alerte: Pick<Alerte, "cle" | "aussi">): string[] => [alerte.cle, ...(alerte.aussi ?? []).map((s) => s.cle)];

/**
 * Qui doit agir (C-91, décision D-3) : la personne à qui le groupe a été confié,
 * sinon le directeur général, sinon le premier super-administrateur.
 */
export function attribuer<T extends Alerte>(alertes: T[], donnees: Pick<DonneesAlertes, "attributions" | "parDefaut">): T[] {
  const manuelles = new Map((donnees.attributions ?? []).map((a) => [`${a.organisationId}:${a.cleGroupe}`, a]));
  const d = donnees.parDefaut ?? null;
  const parDefaut: AttributionAlerte = d
    ? { userId: d.id, nom: d.nom ?? "Compte sans nom", poste: d.designe ? POSTE_DIRECTION_GENERALE : POSTE_SUPER_ADMINISTRATEUR, manuelle: false, par: null }
    : { userId: null, nom: "Personne", poste: POSTE_A_ATTRIBUER, manuelle: false, par: null };
  return alertes.map((alerte) => {
    const m = manuelles.get(`${alerte.organisationId}:${alerte.groupe}`);
    return { ...alerte, attribution: m
      ? { userId: m.attribueeAId, nom: m.nom ?? "Compte sans nom", poste: libelleDepartement(m.departement), manuelle: true, par: m.par }
      : parDefaut };
  });
}

export function calculerAlertes(donnees: DonneesAlertes, maintenant: Date): ResultatAlertes {
  const alertes: Alerte[] = [];
  const datesFaits = new Map<string, Date>();
  const joursDepuis = (date: Date) => Math.floor((maintenant.getTime() - date.getTime()) / JOUR);
  const debut = debutDuJour(maintenant);
  const organisations = new Map(donnees.organisations.map((o) => [o.id, o]));
  const facturations = new Map((donnees.facturations ?? []).map((f) => [f.organisationId, f]));
  const etapesParProduit = grouper(donnees.etapes, (e) => `${e.centreId}:${e.productId}`);
  const datesParRattachement = grouper(donnees.datesPromises, (e) => e.centreProduitId);
  const regressions = new Map<number, DonneesAlertes["regressions"][number]>();
  for (const r of donnees.regressions) {
    if (!regressions.has(r.etapeIntegrationId) || regressions.get(r.etapeIntegrationId)!.surveneuLe < r.surveneuLe) regressions.set(r.etapeIntegrationId, r);
  }
  function ajouter(org: OrganisationAlertes, type: TypeAlerte, id: number | string, dateFait: Date, detail: string,
    options: Partial<Pick<Alerte, "titre" | "niveau" | "centreId" | "lien" | "groupe">> = {}) {
    const cle = `${type}-${id}`;
    alertes.push({ cle, groupe: cle, type, famille: FAMILLES_ALERTES[type], niveau: "attention", titre: LIBELLES_TYPES_ALERTE[type], detail,
      organisationId: org.id, organisationNom: org.raisonSocialeNom, responsableId: org.responsableId, chefDeProjetId: org.chefDeProjetId,
      lien: `/pilot/organisations/${org.id}?onglet=chronologie`, ...options });
    datesFaits.set(cle, dateFait);
  }
  for (const org of donnees.organisations) {
    const f = facturations.get(org.id);
    const lienArgent = { lien: `/pilot/organisations/${org.id}?onglet=argent` };
    const formationDue = !!f?.premierPocLe && f.premierPocLe <= maintenant;
    if (f && formationDue) {
      if (!f.factureEmiseLe) ajouter(org, "formation-a-facturer", org.id, f.premierPocLe!,
        "La formation du premier POC est due. Déclarez la date de facture émise dans l'onglet Argent.", lienArgent);
      if (f.prixARenseigner) ajouter(org, "formation-prix-manquant", org.id, f.premierPocLe!,
        "Le prix au début du premier POC est inconnu. Un compte qui modifie les montants doit le renseigner sur la formation du dossier.", lienArgent);
      if (f.regularisation) ajouter(org, "formation-regularisation", org.id, f.premierPocLe!,
        "La formation n'est pas comptée dans le réel du mois du début du POC, déjà arrêté. Faites une régularisation avec la comptabilité.", lienArgent);
      else if (f.rattrapage) ajouter(org, "formation-regularisation", org.id, f.premierPocLe!,
        `La formation sera ajoutée au réel ${moisDuReel(f.premierPocLe!)} au prochain arrêté mensuel.`,
        { ...lienArgent, titre: "Formation à ajouter au réel" });
    }
    // Le contrat manquant appartient uniquement à contrat-a-saisir, sans doublon du top.
    if (f?.topFacturation && formationDue && f.formationAbsente) ajouter(org, "top-facturation-incoherent", org.id, f.premierPocLe!,
      "La formation due du premier POC manque. Faites reprendre la formation du dossier et vérifiez le calendrier avant de confirmer le top facturation.", lienArgent);
    const sortie = ["PERDU", "ARRETE", "EN_SOMMEIL", "POC_NON_TRANSFORME"].includes(org.etape);
    const finPoc = finPocADecider(org, maintenant);
    if (finPoc) ajouter(org, "fin-poc", org.pocCycleId ? `${org.id}-${org.pocCycleId}` : org.id, finPoc,
      phrase("Fin prévue le " + dateCourte(finPoc)) + " Décidez : POC validé, prolongé d’un mois ou non transformé."
      + (org.pocProlongeLe ? " La prolongation unique a déjà été utilisée." : " Une seule prolongation est possible."),
      { lien: "/pilot/organisations/" + org.id, groupe: `fin-poc-${org.id}` });
    const dernier = org.dernierEchangeLe;
    // Le suivi d'un dossier : sans contact, sans prochaine action, action en retard
    // disent la même chose, une seule alerte les porte (C-91).
    const suivi = { groupe: `suivi-${org.id}` };
    // Une fiche neuve n'a pas encore d'échange : son silence compte depuis sa création.
    if (!estClient(org.etape) && !sortie && joursDepuis(dernier ?? org.creeLe) >= JOURS_SANS_CONTACT) {
      ajouter(org, "prospect-sans-contact", org.id, dernier ?? org.creeLe, dernier
        ? `Aucun échange depuis ${joursDepuis(dernier)} jours.` : `Aucun échange enregistré depuis la création de la fiche, il y a ${joursDepuis(org.creeLe)} jours.`, suivi);
    }
    if (!sortie && org.prochaineActionLe && org.prochaineActionLe < debut) {
      ajouter(org, "action-en-retard", org.id, org.prochaineActionLe, phrase(`Action prévue le ${dateCourte(org.prochaineActionLe)}`), suivi);
    }
    if (ETAPES_COMMERCIALES.includes(org.etape) && !org.prochaineActionLe && joursDepuis(org.creeLe) >= JOURS_GRACE_PROCHAINE_ACTION) {
      ajouter(org, "sans-prochaine-action", org.id, org.etapeDepuisLe, "Aucune prochaine action datée.", suivi);
    }
    // Un client sans contrat actif : son chiffre d'affaires n'est qu'estimé tant que le contrat n'est pas saisi (D-4, C-92).
    const payantAttendu = !!f?.premierMoisPayantLe && decalerMois(f.premierMoisPayantLe, 0) <= decalerMois(maintenant, 0);
    if (estClient(org.etape) && org.contratActif === false && (payantAttendu || org.etape !== "SIGNE" || joursDepuis(org.etapeDepuisLe) >= JOURS_GRACE_CONTRAT)) {
      ajouter(org, "contrat-a-saisir", org.id, org.etapeDepuisLe,
        (payantAttendu ? "Un mois payant est attendu sans contrat actif. " : "") + "Client sans contrat actif : le chiffre d'affaires ne le compte qu'en estimé. Saisissez et activez le contrat.",
        { lien: `/pilot/organisations/${org.id}?onglet=argent` });
    }
    const age = vieillissement(org.etape, org.etapeDepuisLe, maintenant);
    if (age.depasse) ajouter(org, "vieillissement", org.id, org.etapeDepuisLe, `${LIBELLES[org.etape]} depuis ${age.jours} jours, ${age.seuil} attendus.`);
    if (org.etape === "EN_SOMMEIL" && org.reveilLe && org.reveilLe <= maintenant) {
      ajouter(org, "reveil", org.id, org.reveilLe, phrase(`Reprise prévue le ${dateCourte(org.reveilLe)}`), { lien: `/pilot/organisations/${org.id}` });
    }
    if (org.etape === "PROPOSITION" && org.decisionAttendueLe && org.decisionAttendueLe < debut) {
      ajouter(org, "decision-depassee", org.id, org.decisionAttendueLe, phrase(`Décision attendue depuis le ${dateCourte(org.decisionAttendueLe)}`),
        { groupe: `proposition-${org.id}` });
    }
  }
  for (const r of donnees.rattachements) {
    const org = organisations.get(r.organisationId);
    // Un dossier sorti (perdu, en pause, contrat terminé) ne suit plus de mise en service (C-86).
    if (!org || !suitLaMiseEnService(org.etape)) continue;
    const etapes = etapesParProduit.get(`${r.centreId}:${r.productId}`) ?? [];
    const bloquantes = etapes.filter((e) => !e.faite && definitionEtape(e.cle).bloquante);
    const cible = { centreId: r.centreId, lien: `/pilot/integrations?organisationId=${org.id}&centreProduitId=${r.id}` };
    // Les étapes en retard, à reprendre ou bloquantes d'une même mise en service : une seule alerte (C-91).
    const miseEnService = { ...cible, groupe: `mise-en-service-${r.id}` };
    const nom = `${r.centreNom} (${r.produit})`;
    for (const e of etapes) {
      if (e.faite) continue;
      const def = definitionEtape(e.cle, r.produit);
      if (def.depart === "MISE_EN_SERVICE") {
        // Top facturation et suivi (C-85) : le délai part de la mise en service, pas
        // de la création de la case. Avant la mise en service, rien n'est en retard.
        const service = r.miseEnProductionLe ?? null;
        const depasse = service ? joursDepuis(service) - def.dureeAttendueJours : 0;
        if (service && depasse > 0) ajouter(org, "etape-en-retard", e.id, new Date(service.getTime() + def.dureeAttendueJours * JOUR),
          `Prévue ${compter(def.dureeAttendueJours, "jour")} après la mise en service de ${nom}, ${compter(depasse, "jour")} de retard.`,
          { ...miseEnService, titre: `${def.libelle} en retard`, niveau: "attention" });
      } else {
        const jours = joursDepuis(e.creeLe);
        if (jours > def.dureeAttendueJours) ajouter(org, "etape-en-retard", e.id, e.creeLe,
          `Ouverte depuis ${jours} jours sur ${nom}, ${def.dureeAttendueJours} attendus.`,
          { ...miseEnService, titre: `${def.libelle} en retard`, niveau: def.bloquante ? "bloquant" : "attention" });
      }
      if (e.enAttenteDe && relanceDue(e, maintenant)) ajouter(org, "attente-sans-relance", e.id, e.derniereRelanceLe ?? e.demandeeLe!,
        `${def.libelle} · ${nom}. ${libelleAttente(e.enAttenteDe)}.`, { ...cible, lien: `/pilot/attentes?organisationId=${org.id}` });
      const regression = regressions.get(e.id);
      if (e.mode === "AUTOMATIQUE" && regression) {
        const faiteLe = dateDuJournal(regression.avant, "faiteLe");
        ajouter(org, "regression", e.id, regression.surveneuLe,
          `${def.libelle} · ${nom} : ${faiteLe ? `était faite le ${dateCourte(faiteLe)}` : "était faite"}, reste à reprendre.`, { ...miseEnService, niveau: "bloquant" });
      }
    }
    if (r.datePromise && bloquantes.length) {
      const reste = Math.ceil((r.datePromise.getTime() - maintenant.getTime()) / JOUR);
      if (reste <= 7) ajouter(org, "date-promise", r.id, r.datePromise, reste >= 0
        ? `${nom} : ${compter(reste, "jour")} avant la date promise, ${compter(bloquantes.length, "étape bloquante ouverte", "étapes bloquantes ouvertes")}.`
        : `${nom} : date promise dépassée de ${compter(-reste, "jour")}, ${compter(bloquantes.length, "étape bloquante ouverte", "étapes bloquantes ouvertes")}.`, { ...miseEnService, niveau: "bloquant" });
    }
    const renforce = silenceRenforce({ miseEnProductionLe: r.miseEnProductionLe ?? null, suiviRenforceJusquAu: r.suiviRenforceJusquAu ?? null,
      dernierAppelLe: r.etat?.dernierAppelLe ?? null, maintenant });
    if (r.etat?.statutCentre === "EN_PRODUCTION") {
      if (bloquantes.length) ajouter(org, "production-incomplete", r.id,
        new Date(Math.min(...bloquantes.map((e) => e.creeLe.getTime()))),
        `${nom} est déclaré en service avec ${compter(bloquantes.length, "étape bloquante ouverte", "étapes bloquantes ouvertes")}.`, { ...miseEnService, niveau: "bloquant" });
      const dernier = r.etat.dernierAppelLe;
      const heures = dernier ? Math.floor((maintenant.getTime() - dernier.getTime()) / 3600000) : null;
      // Quand silence-renforce sonne, il prend la place : jamais deux alertes. Sinon
      // silence- reste dû : une mise en production récente ne tait pas un centre déjà muet.
      if (!renforce.actif && (heures === null || heures >= SEUIL_SILENCE_HEURES)) ajouter(org, "silence", r.id, dernier ?? org.etapeDepuisLe, dernier
        ? `${nom} : aucun appel depuis ${heures} h.` : `${nom} : aucun appel enregistré.`, { ...cible, niveau: "bloquant" });
    }
    if (renforce.actif) {
      const depuis = renforce.depuisMiseEnProduction ? `la mise en service il y a ${renforce.heures} h` : `${renforce.heures} h`;
      ajouter(org, "silence-renforce", r.id, renforce.depuisMiseEnProduction ? r.miseEnProductionLe! : r.etat!.dernierAppelLe!,
        phrase(`${nom} : aucun appel depuis ${depuis}, suivi renforcé jusqu'au ${dateCourte(r.suiviRenforceJusquAu!)}`), { ...cible, niveau: "bloquant" });
    }
    const historique = [...(datesParRattachement.get(r.id) ?? [])].sort((a, b) => a.surveneuLe.getTime() - b.surveneuLe.getTime());
    const derive = glissement({ datePromise: r.datePromise, datePromiseInitiale: r.datePromiseInitiale ?? null, evenements: historique });
    if (derive.alerte) ajouter(org, "glissement", r.id, historique[0]?.surveneuLe ?? r.datePromiseInitiale ?? org.creeLe,
      nom + " : " + compter(derive.reports, "report") + ", " + compter(Math.max(0, derive.joursCumules), "jour") + " de glissement cumulé.",
      { ...cible, lien: `/pilot/organisations/${org.id}?onglet=centres` });
  }
  for (const contrat of donnees.contrats) {
    const org = organisations.get(contrat.organisationId);
    const renouvellement = renouvellementContrat(contrat, maintenant);
    if (org && renouvellement) ajouter(org, "renouvellement", contrat.id, renouvellement.dateFait, renouvellement.detail,
      { lien: `/pilot/organisations/${org.id}?onglet=argent` });
  }
  const dernieres = new Map<number, DonneesAlertes["propositions"][number]>();
  for (const p of donnees.propositions) if (!dernieres.has(p.organisationId) || dernieres.get(p.organisationId)!.version < p.version) dernieres.set(p.organisationId, p);
  for (const p of dernieres.values()) {
    const org = organisations.get(p.organisationId);
    if (org && propositionExpiree(p, org.etape, maintenant)) ajouter(org, "proposition-expiree", p.id, p.valideJusquAu!,
      `Version ${p.version} : validité dépassée depuis ${compter(joursExpiration(p.valideJusquAu!, maintenant), "jour")}, aucune réponse.`,
      { lien: `/pilot/organisations/${org.id}?onglet=negociation`, groupe: `proposition-${org.id}` });
  }
  const decisions = new Map<string, DonneesAlertes["acquittements"][number]>();
  for (const a of donnees.acquittements) {
    const cle = `${a.organisationId}:${a.cleAlerte}`;
    const courante = decisions.get(cle);
    if (a.jusquAu > maintenant && (!courante || a.jusquAu > courante.jusquAu || (a.jusquAu.getTime() === courante.jusquAu.getTime() && a.id > courante.id))) decisions.set(cle, a);
  }
  const resultat: ResultatAlertes = { actives: [], acquittees: [] };
  for (const alerte of trierAlertes(alertes, datesFaits)) {
    const a = decisions.get(`${alerte.organisationId}:${alerte.cle}`);
    if (a) resultat.acquittees.push({ ...alerte, acquittement: { id: a.id, jusquAu: a.jusquAu, raison: a.raison, auteur: a.auteur } });
    else resultat.actives.push(alerte);
  }
  // Le repli se fait dans chaque liste : un signal reporté ne se cache pas sous une alerte active.
  return { actives: attribuer(regrouper(resultat.actives), donnees), acquittees: attribuer(regrouper(resultat.acquittees), donnees) };
}
