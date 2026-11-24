import { describe, expect, it } from "vitest";
import { attribuer, calculerAlertes, clesDuGroupe, filtrerAMoi, regrouper, trierAlertes, JOURS_GRACE_CONTRAT, JOURS_GRACE_PROCHAINE_ACTION, POSTE_A_ATTRIBUER,
  POSTE_DIRECTION_GENERALE, POSTE_SUPER_ADMINISTRATEUR } from "./calculer";
import { FAMILLES_ALERTES, LIBELLES_TYPES_ALERTE } from "./types";
import type { Alerte, DonneesAlertes, EtapeAlertes, OrganisationAlertes, TypeAlerte } from "./types";
import { CHECKLIST } from "@/pilot/lib/checklist/definition";
import { SEUIL_VIEILLISSEMENT } from "@/pilot/lib/pipeline";

const maintenant = new Date("2026-10-27T12:00:00.000Z");
const jour = (n: number) => new Date(maintenant.getTime() + n * 86400000);
const minuit = new Date("2026-10-27T00:00:00.000Z");
function donnees(): DonneesAlertes {
  return {
    organisations: [{ id: 1, raisonSocialeNom: "Alpha", etape: "PROSPECT", etapeDepuisLe: jour(0), creeLe: jour(-100),
      responsableId: 10, chefDeProjetId: 20, dernierEchangeLe: jour(-1), prochaineActionLe: jour(1), reveilLe: null, decisionAttendueLe: null }],
    rattachements: [{ id: 2, organisationId: 1, centreId: 3, centreNom: "Site", productId: 4, produit: "LyraeTalk",
      userProductId: null, datePromise: null, etat: null }],
    etapes: [{ id: 5, centreId: 3, productId: 4, cle: "MAPPING_EXAMENS", mode: "AUTOMATIQUE", faite: false, creeLe: jour(0),
      enAttenteDe: null, demandeeLe: null, derniereRelanceLe: null, echeanceLe: null }],
    datesPromises: [], regressions: [], contrats: [], acquittements: [], propositions: [],
  };
}
const resultat = (d: DonneesAlertes) => calculerAlertes(d, maintenant);
const alerte = (d: DonneesAlertes, type: TypeAlerte) => resultat(d).actives.find((a) => a.type === type);
function orgAvec(champs: Partial<OrganisationAlertes>) {
  const d = donnees(); Object.assign(d.organisations[0], champs); return d;
}
function etapeAvec(champs: Partial<EtapeAlertes>) {
  const d = donnees(); Object.assign(d.etapes[0], champs); return d;
}
describe("calculerAlertes, faits et seuils fixes", () => {
  it("ne lit ni l'horloge ni la base et ne modifie aucune entrée", () => {
    const d = donnees(); const avant = JSON.stringify(d);
    expect(resultat(d)).toEqual({ actives: [], acquittees: [] });
    expect(JSON.stringify(d)).toBe(avant);
    expect(resultat(d)).toEqual(resultat(d));
    expect(Object.keys(LIBELLES_TYPES_ALERTE)).toHaveLength(22);
    expect(FAMILLES_ALERTES["proposition-expiree"]).toBe("commerciale");
    expect(FAMILLES_ALERTES["silence-renforce"]).toBe("integration");
  });
  it.each([29, 30, 47])("prospect sans contact à %i jours, texte historique", (jours) => {
    const a = alerte(orgAvec({ dernierEchangeLe: jour(-jours) }), "prospect-sans-contact");
    if (jours < 30) expect(a).toBeUndefined();
    else expect(a).toMatchObject({ cle: "prospect-sans-contact-1", titre: "Prospect sans contact", detail: `Aucun échange depuis ${jours} jours.` });
  });
  it("prospect jamais contacté : le silence compte depuis la création (C-91)", () => {
    expect(alerte(orgAvec({ dernierEchangeLe: null }), "prospect-sans-contact")?.detail).toBe("Aucun échange enregistré depuis la création de la fiche, il y a 100 jours.");
    expect(alerte(orgAvec({ dernierEchangeLe: null, creeLe: jour(-29) }), "prospect-sans-contact")).toBeUndefined();
    expect(alerte(orgAvec({ dernierEchangeLe: null, creeLe: jour(-30) }), "prospect-sans-contact")).toBeDefined();
  });
  it.each(["EN_SOMMEIL", "PERDU", "ARRETE", "SIGNE", "EN_INTEGRATION", "EN_PRODUCTION"] as const)("sans contact exclut %s", (etape) => {
    expect(alerte(orgAvec({ etape, dernierEchangeLe: jour(-47) }), "prospect-sans-contact")).toBeUndefined();
  });
  it.each(CHECKLIST.filter((d) => d.depart === "OUVERTURE"))("retard de $cle : seuil strict, texte et niveau historiques", (def) => {
    const d = etapeAvec({ cle: def.cle, mode: def.mode, creeLe: jour(-def.dureeAttendueJours) });
    expect(alerte(d, "etape-en-retard")).toBeUndefined();
    d.etapes[0].creeLe = jour(-def.dureeAttendueJours - 1);
    expect(alerte(d, "etape-en-retard")).toMatchObject({ cle: "etape-en-retard-5", titre: `${def.libelle} en retard`,
      niveau: def.bloquante ? "bloquant" : "attention",
      detail: `Ouverte depuis ${def.dureeAttendueJours + 1} jours sur Site (LyraeTalk), ${def.dureeAttendueJours} attendus.` });
    d.etapes[0].faite = true;
    expect(alerte(d, "etape-en-retard")).toBeUndefined();
  });
  it.each(CHECKLIST.filter((d) => d.depart === "MISE_EN_SERVICE"))("retard de $cle : compté depuis la mise en service (C-85)", (def) => {
    const d = etapeAvec({ cle: def.cle, mode: def.mode, creeLe: jour(-200) });
    expect(alerte(d, "etape-en-retard")).toBeUndefined();
    d.rattachements[0].miseEnProductionLe = jour(-def.dureeAttendueJours);
    expect(alerte(d, "etape-en-retard")).toBeUndefined();
    d.rattachements[0].miseEnProductionLe = jour(-def.dureeAttendueJours - 2);
    expect(alerte(d, "etape-en-retard")).toMatchObject({ titre: `${def.libelle} en retard`, niveau: "attention",
      detail: `Prévue ${def.dureeAttendueJours} ${def.dureeAttendueJours > 1 ? "jours" : "jour"} après la mise en service de Site (LyraeTalk), 2 jours de retard.` });
    d.etapes[0].faite = true;
    expect(alerte(d, "etape-en-retard")).toBeUndefined();
  });
  it.each([8, 7, 0, -2])("date promise à %i jours", (jours) => {
    const d = donnees(); d.rattachements[0].datePromise = jour(jours);
    const a = alerte(d, "date-promise");
    if (jours > 7) expect(a).toBeUndefined();
    else expect(a).toMatchObject({ cle: "date-promise-2", titre: "Mise en service promise en danger", niveau: "bloquant",
      detail: jours >= 0 ? `Site (LyraeTalk) : ${jours} jour${jours > 1 ? "s" : ""} avant la date promise, 1 étape bloquante ouverte.`
        : "Site (LyraeTalk) : date promise dépassée de 2 jours, 1 étape bloquante ouverte." });
    d.etapes[0].faite = true;
    expect(alerte(d, "date-promise")).toBeUndefined();
  });
  it("production incomplète, texte historique, condition de production et case bloquante", () => {
    const d = donnees();
    d.rattachements[0].etat = { statutCentre: "EN_PRODUCTION", dernierAppelLe: jour(0) };
    expect(alerte(d, "production-incomplete")).toMatchObject({ cle: "production-incomplete-2", titre: "En service, mais incomplet",
      detail: "Site (LyraeTalk) est déclaré en service avec 1 étape bloquante ouverte.", niveau: "bloquant" });
    d.rattachements[0].etat.statutCentre = "EN_INTEGRATION";
    expect(alerte(d, "production-incomplete")).toBeUndefined();
    d.rattachements[0].etat.statutCentre = "EN_PRODUCTION"; d.etapes[0].faite = true;
    expect(alerte(d, "production-incomplete")).toBeUndefined();
  });
  it.each([47, 48, 49, null])("silence après %s heures", (heures) => {
    const d = donnees();
    d.rattachements[0].etat = { statutCentre: "EN_PRODUCTION", dernierAppelLe: heures === null ? null : new Date(maintenant.getTime() - heures * 3600000) };
    const a = alerte(d, "silence");
    if (heures === 47) expect(a).toBeUndefined();
    else expect(a).toMatchObject({ cle: "silence-2", titre: "Centre en service sans appel", niveau: "bloquant",
      detail: heures === null ? "Site (LyraeTalk) : aucun appel enregistré." : `Site (LyraeTalk) : aucun appel depuis ${heures} h.` });
    d.rattachements[0].etat.statutCentre = "EN_INTEGRATION";
    expect(alerte(d, "silence")).toBeUndefined();
  });
  it("action en retard : minuit UTC est exclu, veille incluse", () => {
    expect(alerte(orgAvec({ prochaineActionLe: minuit }), "action-en-retard")).toBeUndefined();
    expect(alerte(orgAvec({ prochaineActionLe: new Date(minuit.getTime() - 1) }), "action-en-retard")?.cle).toBe("action-en-retard-1");
  });
  it.each(["PERDU", "ARRETE", "EN_SOMMEIL"] as const)("action en retard exclut %s", (etape) => {
    expect(alerte(orgAvec({ etape, prochaineActionLe: jour(-2) }), "action-en-retard")).toBeUndefined();
  });
  it.each(["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION", "SIGNE", "EN_INTEGRATION", "EN_PRODUCTION", "PERDU", "ARRETE", "EN_SOMMEIL"] as const)(
    "sans prochaine action à l'étape %s", (etape) => {
      const attendu = ["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION"].includes(etape);
      expect(Boolean(alerte(orgAvec({ etape, prochaineActionLe: null }), "sans-prochaine-action"))).toBe(attendu);
      expect(alerte(orgAvec({ etape, prochaineActionLe: jour(1) }), "sans-prochaine-action")).toBeUndefined();
    });
  it.each(Object.entries(SEUIL_VIEILLISSEMENT).filter((e): e is [string, number] => typeof e[1] === "number"))("vieillissement %s : seuil %i", (etape, seuil) => {
    const d = orgAvec({ etape: etape as OrganisationAlertes["etape"], etapeDepuisLe: jour(-seuil) });
    expect(alerte(d, "vieillissement")).toBeUndefined();
    d.organisations[0].etapeDepuisLe = jour(-seuil - 1);
    expect(alerte(d, "vieillissement")?.cle).toBe("vieillissement-1");
  });
  it("réveil : instant atteint inclus, étape et date obligatoires", () => {
    expect(alerte(orgAvec({ etape: "EN_SOMMEIL", reveilLe: maintenant }), "reveil")?.cle).toBe("reveil-1");
    expect(alerte(orgAvec({ etape: "EN_SOMMEIL", reveilLe: new Date(+maintenant + 1) }), "reveil")).toBeUndefined();
    expect(alerte(orgAvec({ etape: "PROSPECT", reveilLe: jour(-1) }), "reveil")).toBeUndefined();
    expect(alerte(orgAvec({ etape: "EN_SOMMEIL" }), "reveil")).toBeUndefined();
  });
  it("décision dépassée : PROPOSITION, avant minuit UTC", () => {
    expect(alerte(orgAvec({ etape: "PROPOSITION", decisionAttendueLe: jour(-3) }), "decision-depassee")?.cle).toBe("decision-depassee-1");
    expect(alerte(orgAvec({ etape: "PROPOSITION", decisionAttendueLe: minuit }), "decision-depassee")).toBeUndefined();
    expect(alerte(orgAvec({ etape: "SIGNE", decisionAttendueLe: jour(-3) }), "decision-depassee")).toBeUndefined();
  });
  it("relance : plus de sept jours, dernière relance prioritaire, attente ouverte", () => {
    const d = etapeAvec({ mode: "MANUEL", cle: "FORMATION_SECRETAIRES", enAttenteDe: "CLIENT", demandeeLe: jour(-7) });
    expect(alerte(d, "attente-sans-relance")).toBeUndefined();
    d.etapes[0].demandeeLe = jour(-8);
    expect(alerte(d, "attente-sans-relance")?.cle).toBe("attente-sans-relance-5");
    d.etapes[0].derniereRelanceLe = jour(-7);
    expect(alerte(d, "attente-sans-relance")).toBeUndefined();
    d.etapes[0].derniereRelanceLe = jour(-8); d.etapes[0].faite = true;
    expect(alerte(d, "attente-sans-relance")).toBeUndefined();
    d.etapes[0].faite = false; d.etapes[0].enAttenteDe = null;
    expect(alerte(d, "attente-sans-relance")).toBeUndefined();
  });
  it("régression : événement automatique le plus récent, case toujours vide", () => {
    const d = donnees();
    expect(alerte(d, "regression")).toBeUndefined();
    d.regressions = [
      { etapeIntegrationId: 5, surveneuLe: jour(-1), avant: { faiteLe: jour(-3).toISOString() } },
      { etapeIntegrationId: 5, surveneuLe: jour(-5), avant: { faiteLe: jour(-10).toISOString() } },
    ];
    expect(alerte(d, "regression")).toMatchObject({ cle: "regression-5", niveau: "bloquant",
      detail: "Examens associés entre Xplore et Lyrae · Site (LyraeTalk) : était faite le 24 oct., reste à reprendre." });
    d.etapes[0].faite = true; expect(alerte(d, "regression")).toBeUndefined();
    d.etapes[0].faite = false; d.etapes[0].mode = "MANUEL"; expect(alerte(d, "regression")).toBeUndefined();
  });
  it.each([0, 2, 3])("glissement depuis le journal : %i reports", (nombre) => {
    const d = donnees(); d.rattachements[0].datePromise = jour(5);
    d.datesPromises = Array.from({ length: nombre }, (_, i) => ({ centreProduitId: 2, surveneuLe: jour(-10 + i),
      avant: { datePromise: jour(-20 + i).toISOString() }, apres: { datePromise: jour(5).toISOString() } })).reverse();
    expect(Boolean(alerte(d, "glissement"))).toBe(nombre > 2);
    if (nombre > 2) expect(alerte(d, "glissement")?.detail).toBe("Site (LyraeTalk) : 3 reports, 25 jours de glissement cumulé.");
  });
  it.each([30, 31])("glissement de %i jours, première date dans après si aucun avant", (jours) => {
    const d = donnees(); d.rattachements[0].datePromise = jour(5);
    d.datesPromises = [{ centreProduitId: 2, surveneuLe: jour(-40), avant: { datePromise: null }, apres: { datePromise: jour(5 - jours).toISOString() } }];
    expect(Boolean(alerte(d, "glissement"))).toBe(jours > 30);
  });
  it("première affectation sans report, priorité au plus ancien avant non nul", () => {
    const d = donnees(); d.rattachements[0].datePromise = jour(5);
    d.datesPromises = [
      { centreProduitId: 2, surveneuLe: jour(-50), avant: null, apres: { datePromise: jour(-40).toISOString() } },
      { centreProduitId: 2, surveneuLe: jour(-20), avant: { datePromise: jour(-5).toISOString() }, apres: { datePromise: jour(5).toISOString() } },
    ];
    expect(alerte(d, "glissement")).toBeUndefined();
    d.rattachements[0].datePromise = null;
    expect(alerte(d, "glissement")).toBeUndefined();
  });
  it.each([-1, 0, 90, 91])("renouvellement à %i jours", (jours) => {
    const d = donnees(); d.contrats = [{ id: 6, organisationId: 1, statut: "ACTIF", signeLe: null, debuteLe: null, engagementMois: null, preavisMois: null, reference: null, renouvelleLe: jour(jours) }];
    expect(Boolean(alerte(d, "renouvellement"))).toBe(jours >= 0 && jours <= 90);
    if (jours === 90) expect(alerte(d, "renouvellement")).toMatchObject({ cle: "renouvellement-6", famille: "commerciale", lien: "/pilot/organisations/1?onglet=argent" });
    d.contrats[0].statut = "TERMINE"; expect(alerte(d, "renouvellement")).toBeUndefined();
    d.contrats[0].statut = "ACTIF"; d.contrats[0].renouvelleLe = null; expect(alerte(d, "renouvellement")).toBeUndefined();
  });
});
describe("décisions humaines, affectation et ordre", () => {
  const avecAlerte = () => orgAvec({ dernierEchangeLe: jour(-47) });
  const acquittement = (id: number, jusquAu: Date) => ({ id, organisationId: 1, cleAlerte: "prospect-sans-contact-1", jusquAu, raison: "Raison privée", auteur: "Commercial" });
  it("courant, expiré et instant exact de fin", () => {
    const d = avecAlerte(); d.acquittements = [acquittement(7, jour(7))];
    expect(resultat(d).actives).toHaveLength(0);
    expect(resultat(d).acquittees[0].acquittement).toMatchObject({ id: 7, raison: "Raison privée", auteur: "Commercial" });
    for (const date of [jour(-1), maintenant]) {
      d.acquittements[0].jusquAu = date;
      expect(resultat(d).actives).toHaveLength(1); expect(resultat(d).acquittees).toHaveLength(0);
    }
  });
  it("plusieurs décisions : la plus lointaine ; clé et organisation doivent correspondre", () => {
    const d = avecAlerte(); d.acquittements = [acquittement(7, jour(7)), acquittement(8, jour(14)), acquittement(9, jour(-1)),
      { ...acquittement(10, jour(30)), organisationId: 99 }, { ...acquittement(11, jour(30)), cleAlerte: "silence-2" }];
    expect(resultat(d).acquittees[0].acquittement.id).toBe(8);
    d.organisations[0].dernierEchangeLe = jour(0);
    expect(resultat(d)).toEqual({ actives: [], acquittees: [] });
  });
  it("à moi : la personne à qui l'alerte va, plus le commercial ni le chef de projet (C-91), y compris acquittées", () => {
    const base = alerte(avecAlerte(), "prospect-sans-contact")!;
    const julie: Alerte = { ...base, cle: "regression-5", attribution: { userId: 20, nom: "Julie", poste: "Projet", manuelle: true, par: null } };
    const directeur: Alerte = { ...base, cle: "regression-6", attribution: { userId: 30, nom: "Dir", poste: POSTE_DIRECTION_GENERALE, manuelle: false, par: null } };
    expect(filtrerAMoi([base, julie, directeur], 10)).toEqual([]);
    expect(filtrerAMoi([base, julie, directeur], 20)).toEqual([julie]);
    expect(filtrerAMoi([base, julie, directeur], 30)).toEqual([directeur]);
    expect(filtrerAMoi([{ ...julie, acquittement: acquittement(7, jour(7)) }], 20)[0].acquittement.id).toBe(7);
  });
  it("bloquant d'abord, fait ancien, organisation, clé ; aucun tri en place", () => {
    const base = alerte(avecAlerte(), "prospect-sans-contact")!;
    const lignes: Alerte[] = [
      { ...base, cle: "a", organisationNom: "Zeta" },
      { ...base, cle: "b", organisationNom: "Beta", niveau: "bloquant" },
      { ...base, cle: "c", organisationNom: "Alpha", niveau: "bloquant" },
      { ...base, cle: "d", organisationNom: "Zeta", niveau: "bloquant" },
    ];
    const dates = new Map([["a", jour(-100)], ["b", jour(-1)], ["c", jour(-1)], ["d", jour(-2)]]);
    expect(trierAlertes(lignes, dates).map((a) => a.cle)).toEqual(["d", "c", "b", "a"]);
    expect(lignes.map((a) => a.cle)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("qui fait quoi : délai, une alerte par cause, attribution (C-91)", () => {
  it("une fiche neuve ne sonne pas dès la première seconde", () => {
    const d = orgAvec({ creeLe: jour(0), etapeDepuisLe: jour(0), dernierEchangeLe: null, prochaineActionLe: null });
    expect(resultat(d).actives.filter((a) => a.organisationId === 1 && a.groupe === "suivi-1")).toEqual([]);
    const plusTard = orgAvec({ creeLe: jour(-JOURS_GRACE_PROCHAINE_ACTION), etapeDepuisLe: jour(-JOURS_GRACE_PROCHAINE_ACTION), dernierEchangeLe: null, prochaineActionLe: null });
    expect(alerte(plusTard, "sans-prochaine-action")).toBeDefined();
  });
  it("sans contact et sans prochaine action : une seule alerte, l'autre repliée dessous", () => {
    const d = orgAvec({ dernierEchangeLe: jour(-40), prochaineActionLe: null });
    const suivi = resultat(d).actives.filter((a) => a.groupe === "suivi-1");
    expect(suivi).toHaveLength(1);
    expect(clesDuGroupe(suivi[0]).sort()).toEqual(["prospect-sans-contact-1", "sans-prochaine-action-1"]);
    expect(suivi[0].aussi?.[0]).toMatchObject({ titre: expect.any(String), detail: expect.any(String) });
  });
  it("le repli garde l'ordre du tri et ne mélange ni les dossiers ni les causes", () => {
    const base = alerte(orgAvec({ dernierEchangeLe: jour(-40) }), "prospect-sans-contact")!;
    const a1: Alerte = { ...base, cle: "a-1", groupe: "g" };
    const a2: Alerte = { ...base, cle: "a-2", groupe: "g" };
    const autreDossier: Alerte = { ...base, cle: "a-3", groupe: "g", organisationId: 2 };
    const autreCause: Alerte = { ...base, cle: "a-4", groupe: "h" };
    const sortie = regrouper([a1, autreDossier, a2, autreCause]);
    expect(sortie.map((a) => a.cle)).toEqual(["a-1", "a-3", "a-4"]);
    expect(sortie[0].aussi?.map((s) => s.cle)).toEqual(["a-2"]);
    expect(a1.aussi).toBeUndefined();
  });
  it("une alerte reportée ne se cache pas sous une alerte active", () => {
    const d = orgAvec({ dernierEchangeLe: jour(-40), prochaineActionLe: null });
    d.acquittements = [{ id: 7, cleAlerte: "sans-prochaine-action-1", organisationId: 1, jusquAu: jour(7), raison: "r", auteur: null }];
    const r = resultat(d);
    expect(r.actives.find((a) => a.groupe === "suivi-1")?.cle).toBe("prospect-sans-contact-1");
    expect(r.acquittees.map((a) => a.cle)).toEqual(["sans-prochaine-action-1"]);
  });
  it("d'office au directeur général, sinon au super-administrateur, sinon à attribuer", () => {
    const base = alerte(orgAvec({ dernierEchangeLe: jour(-40) }), "prospect-sans-contact")!;
    expect(attribuer([base], { parDefaut: { id: 30, nom: "Dir", departement: "DIRECTION", designe: true } })[0].attribution)
      .toEqual({ userId: 30, nom: "Dir", poste: POSTE_DIRECTION_GENERALE, manuelle: false, par: null });
    expect(attribuer([base], { parDefaut: { id: 1, nom: "Admin", departement: null, designe: false } })[0].attribution?.poste).toBe(POSTE_SUPER_ADMINISTRATEUR);
    expect(attribuer([base], {})[0].attribution).toMatchObject({ userId: null, poste: POSTE_A_ATTRIBUER });
  });
  it("confiée à la main : la personne et son département, pour le dossier et la cause seulement", () => {
    const base = alerte(orgAvec({ dernierEchangeLe: jour(-40) }), "prospect-sans-contact")!;
    const parDefaut = { id: 30, nom: "Dir", departement: null, designe: true } as const;
    const attributions = [{ organisationId: 1, cleGroupe: base.groupe, attribueeAId: 20, nom: "Julie", departement: "PROJET" as const, par: "Dir" },
      { organisationId: 2, cleGroupe: base.groupe, attribueeAId: 21, nom: "Autre", departement: null, par: null }];
    const [a, autreDossier] = attribuer([base, { ...base, organisationId: 2, cle: "x" }, ], { parDefaut, attributions: attributions.slice(0, 1) });
    expect(a.attribution).toEqual({ userId: 20, nom: "Julie", poste: "Projet", manuelle: true, par: "Dir" });
    expect(autreDossier.attribution?.userId).toBe(30);
    expect(attribuer([{ ...base, organisationId: 2 }], { parDefaut, attributions })[0].attribution?.poste).toBe("Département pas encore choisi");
  });
  it("calculerAlertes attribue chaque alerte affichée, active ou reportée", () => {
    const d = orgAvec({ dernierEchangeLe: jour(-40) });
    d.parDefaut = { id: 30, nom: "Dir", departement: null, designe: true };
    expect(resultat(d).actives.every((a) => a.attribution?.userId === 30)).toBe(true);
  });
});

describe("contrat à saisir (D-4, C-92)", () => {
  const client = (etape: "SIGNE" | "EN_INTEGRATION" | "EN_PRODUCTION", contratActif: boolean | undefined, depuis = -10) =>
    orgAvec({ etape, etapeDepuisLe: jour(depuis), contratActif });
  it("un client sans contrat actif appelle sa saisie, vers l'onglet Argent", () => {
    for (const etape of ["SIGNE", "EN_INTEGRATION", "EN_PRODUCTION"] as const) {
      const a = alerte(client(etape, false), "contrat-a-saisir");
      expect(a).toMatchObject({ famille: "commerciale", niveau: "attention", lien: "/pilot/organisations/1?onglet=argent" });
      expect(a?.detail).not.toMatch(/€/);
    }
  });
  it("un contrat actif, ou un compte inconnu, ne sonne pas", () => {
    expect(alerte(client("EN_PRODUCTION", true), "contrat-a-saisir")).toBeUndefined();
    expect(alerte(client("EN_PRODUCTION", undefined), "contrat-a-saisir")).toBeUndefined();
    expect(alerte(orgAvec({ etape: "PROPOSITION", contratActif: false }), "contrat-a-saisir")).toBeUndefined();
    expect(alerte(orgAvec({ etape: "ARRETE", contratActif: false }), "contrat-a-saisir")).toBeUndefined();
  });
  it("un client tout juste signé a trois jours pour activer son contrat", () => {
    expect(alerte(client("SIGNE", false, -(JOURS_GRACE_CONTRAT - 1)), "contrat-a-saisir")).toBeUndefined();
    expect(alerte(client("SIGNE", false, -JOURS_GRACE_CONTRAT), "contrat-a-saisir")).toBeDefined();
  });
});

describe("dernière proposition sans réponse", () => {
  const initiale = { id: 10, organisationId: 1, version: 1, statut: "EXPIREE" as const, valideJusquAu: jour(-5), repondueLe: null };
  it("garde l'alerte après le cron et pointe vers la négociation", () => {
    const d = donnees(); d.propositions = [initiale];
    expect(alerte(d, "proposition-expiree")).toMatchObject({ cle: "proposition-expiree-10", niveau: "attention", famille: "commerciale",
      detail: "Version 1 : validité dépassée depuis 5 jours, aucune réponse.", lien: "/pilot/organisations/1?onglet=negociation" });
  });
  it.each(["BROUILLON", "REFUSEE", "ACCEPTEE"] as const)("une nouvelle version %s efface l'ancienne alerte", (statut) => {
    const d = donnees(); d.propositions = [{ ...initiale, id: 11, version: 2, statut }, initiale];
    expect(alerte(d, "proposition-expiree")).toBeUndefined();
  });
  it.each(["PERDU", "EN_SOMMEIL", "ARRETE", "SIGNE", "EN_INTEGRATION", "EN_PRODUCTION"] as const)("disparaît en %s", (etape) => {
    const d = orgAvec({ etape }); d.propositions = [initiale];
    expect(alerte(d, "proposition-expiree")).toBeUndefined();
  });
  it("disparaît après une réponse, un refus ou une acceptation", () => {
    const d = donnees(); d.propositions = [{ ...initiale, repondueLe: maintenant }];
    expect(alerte(d, "proposition-expiree")).toBeUndefined();
    for (const statut of ["REFUSEE", "ACCEPTEE"] as const) {
      d.propositions = [{ ...initiale, statut }];
      expect(alerte(d, "proposition-expiree")).toBeUndefined();
    }
  });
});

describe("renouvellement par fin d'engagement", () => {
  const maintenant = new Date("2026-12-28T12:00:00Z");
  const contrat = { id: 6, organisationId: 1, statut: "ACTIF" as const, signeLe: new Date("2025-03-12"), debuteLe: null,
    engagementMois: 24, preavisMois: null as number | null, reference: "Alpha", renouvelleLe: null as Date | null };
  const calculer = (champs = {}, instant = maintenant) => {
    const d = donnees(); d.contrats = [{ ...contrat, ...champs }];
    return calculerAlertes(d, instant).actives.find((a) => a.cle === "renouvellement-6");
  };
  it("fin d'engagement seule", () => expect(calculer()?.detail).toBe("Fin d'engagement le 12 mars."));
  it("préavis à décider", () => expect(calculer({ preavisMois: 1 })?.detail).toBe("Fin d'engagement le 12 mars. Préavis de 1 mois : décider avant le 12 févr."));
  it("préavis dépassé", () => expect(calculer({ preavisMois: 3 })?.detail).toBe("Fin d'engagement le 12 mars. Préavis dépassé depuis le 12 déc."));
  it("la limite du préavis aujourd'hui n'est pas dépassée", () => expect(calculer({ preavisMois: 1 }, new Date("2027-02-12T23:59:59Z"))?.detail).toContain("décider avant le 12 févr."));
  it("renouvellement seul ou plus proche garde son texte", () => expect(calculer({ renouvelleLe: new Date("2027-01-01") })?.detail).toBe("Renouvellement prévu le 1 janv."));
  it("un long préavis ouvre l'alerte avant la limite, fin d'engagement encore lointaine", () => {
    expect(calculer({ engagementMois: 30, preavisMois: 6 })?.detail).toBe("Fin d'engagement le 12 sept. Préavis de 6 mois : décider avant le 12 mars.");
    expect(calculer({ engagementMois: 30, preavisMois: 3 })).toBeUndefined();
  });
  it("une échéance commune privilégie l'engagement et le préavis", () => expect(calculer({ renouvelleLe: new Date("2027-03-12"), preavisMois: 3 })?.detail).toContain("Préavis dépassé"));
  it.each([-1, 0, 90, 91])("fin d'engagement à %i jours, bornes civiles", (n) => {
    const fin = new Date("2026-12-28T23:59:59.999Z"); fin.setUTCDate(fin.getUTCDate() + n);
    const signeLe = new Date(fin); signeLe.setUTCFullYear(signeLe.getUTCFullYear() - 2);
    expect(Boolean(calculer({ signeLe }))).toBe(n >= 0 && n <= 90);
  });
});

describe("silence pendant le suivi renforcé", () => {
  const heures = (n: number) => new Date(maintenant.getTime() - n * 3600000);
  // Mise en production il y a 3 jours, suivi jusqu'au 7 nov. à midi.
  function enSuivi(dernierAppelLe: Date | null, miseEnProductionLe = heures(72), statutCentre = "EN_PRODUCTION") {
    const d = donnees();
    Object.assign(d.rattachements[0], { miseEnProductionLe, suiviRenforceJusquAu: new Date(miseEnProductionLe.getTime() + 14 * 86400000),
      etat: { statutCentre, dernierAppelLe } });
    return d;
  }
  it.each([[23, false], [24, true], [30, true]])("dernier appel il y a %i h : alerte %s", (h, attendue) => {
    const a = alerte(enSuivi(heures(h)), "silence-renforce");
    if (!attendue) expect(a).toBeUndefined();
    else expect(a).toMatchObject({ cle: "silence-renforce-2", type: "silence-renforce", famille: "integration", niveau: "bloquant", centreId: 3,
      titre: "Aucun appel depuis la mise en service", detail: `Site (LyraeTalk) : aucun appel depuis ${h} h, suivi renforcé jusqu'au 7 nov.`,
      lien: "/pilot/integrations?organisationId=1&centreProduitId=2" });
  });
  it("sans appel depuis la mise en service, ou mise en production trop récente", () => {
    expect(alerte(enSuivi(null), "silence-renforce")?.detail).toBe("Site (LyraeTalk) : aucun appel depuis la mise en service il y a 72 h, suivi renforcé jusqu'au 7 nov.");
    expect(alerte(enSuivi(heures(200)), "silence-renforce")?.detail).toContain("depuis la mise en service il y a 72 h");
    expect(alerte(enSuivi(null, heures(3)), "silence-renforce")).toBeUndefined();
  });
  it("remplace silence- sur la période, même au-delà de 48 h ; silence- revient après", () => {
    const d = enSuivi(heures(60));
    expect(resultat(d).actives.filter((a) => a.type === "silence" || a.type === "silence-renforce").map((a) => a.cle)).toEqual(["silence-renforce-2"]);
    const apres = enSuivi(heures(60), heures(14 * 24 + 1));
    expect(alerte(apres, "silence-renforce")).toBeUndefined();
    expect(alerte(apres, "silence")?.cle).toBe("silence-2");
    // Mise en production il y a 3 h, dernier appel il y a 50 h : le suivi renforcé ne sonne
    // pas encore, mais le silence ordinaire reste dû, un centre déjà muet ne se tait pas.
    const recente = enSuivi(heures(50), heures(3));
    expect(alerte(recente, "silence")?.cle).toBe("silence-2");
    expect(alerte(recente, "silence-renforce")).toBeUndefined();
  });
  it("ne dépend pas du statut du Dashboard, ni d'un accès Dashboard", () => {
    expect(alerte(enSuivi(heures(30), heures(72), "EN_INTEGRATION"), "silence-renforce")?.cle).toBe("silence-renforce-2");
    const d = enSuivi(null); d.rattachements[0].etat = null;
    expect(alerte(d, "silence-renforce")?.detail).toContain("depuis la mise en service");
  });
  it("hors période ou sans mise en production : rien", () => {
    const d = donnees();
    d.rattachements[0].etat = { statutCentre: "EN_PRODUCTION", dernierAppelLe: heures(30) };
    expect(alerte(d, "silence-renforce")).toBeUndefined();
    d.rattachements[0].suiviRenforceJusquAu = jour(3);
    expect(alerte(d, "silence-renforce")).toBeUndefined();
  });
  it("acquittable comme les autres", () => {
    const d = enSuivi(heures(30));
    d.acquittements = [{ id: 9, organisationId: 1, cleAlerte: "silence-renforce-2", jusquAu: jour(1), raison: "Fermeture annuelle", auteur: null }];
    expect(resultat(d).acquittees.map((a) => a.cle)).toEqual(["silence-renforce-2"]);
  });
});

describe("dossier sorti : plus d'alerte de mise en service (C-86)", () => {
  it.each(["PERDU", "EN_SOMMEIL", "ARRETE"] as const)("%s ne lève ni retard d'étape ni silence", (etape) => {
    const d = etapeAvec({ creeLe: jour(-400) });
    d.organisations[0].etape = etape;
    expect(alerte(d, "etape-en-retard")).toBeUndefined();
  });
  it("le même centre en mise en service lève bien le retard", () => {
    const d = etapeAvec({ creeLe: jour(-400) });
    d.organisations[0].etape = "EN_INTEGRATION";
    expect(alerte(d, "etape-en-retard")).toBeDefined();
  });
});
