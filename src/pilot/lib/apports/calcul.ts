import { PARAMETRES_DEFAUT, type StatutCommande, type StatutFacture } from "./referentiel";
import { ttcDepuisHt, type InstallationApport, type PrixApport } from "./prix";

/**
 * Le moteur de l'apport d'affaires (CHOIX.md, C-63) : un calcul pur, repris du
 * calculateur des apporteurs, qui sert à l'écran, aux documents et aux tests.
 *
 * L'argent est en centimes entiers, les taux en points de base (2,5 % = 250).
 * Les mois s'écrivent « AAAA-MM », les jours « AAAA-MM-JJ ». Chaque arrondi se
 * fait au centime, une seule fois par montant.
 *
 * Les prix viennent de la grille tarifaire en vigueur (lot S, `prix.ts`), plus
 * des réglages de l'apport : `parametres.prix`.
 */

export type Mois = string;
export type Jour = string;

export type ParametresCalcul = Pick<typeof PARAMETRES_DEFAUT,
  "tvaPdm" | "seuil1Centimes" | "seuil2Centimes" | "taux1Pdm" | "taux2Pdm" | "taux3Pdm" | "autresClientsCentimes" | "delaiEncaissementMois"
  | "dureeCommissionMois" | "horizonMois" | "inclureValidees" | "inclureBcEnvoyes" | "inclureProspects" | "tvaFacturePdm" | "delaiPaiementJours"
> & { apporteurParDefautId: number | null; prix: PrixApport };

export type ApporteurCalcul = { id: number; nom: string; structure: string | null; commissionne: boolean };
export type SiteCalcul = { id: number; nom: string; offreTalk: boolean; offreKonnect: boolean; offreConnecteurRis: boolean; salles: { modalite: string }[] };
export type GroupeCalcul = {
  id: number; nom: string; creeLe: string;
  apporteurId: number; coApporteurId: number | null; coApporteurPart: number;
  offreTalk: boolean; offreKonnect: boolean; offreConnecteurRis: boolean;
  bcEnvoyeLe: Jour | null; commandeValideeLe: Jour | null; commandeInstalleeLe: Jour | null; deploiementPrevuLe: Jour | null;
  decision: string; decisionLe: Jour | null; signaleLe: Jour | null;
  sites: SiteCalcul[];
};
export type LigneFigee = {
  organisationId: number; nom: string; theoriqueCentimes: number; baseCentimes: number; commissionCentimes: number;
  talk: string; konnect: string; connecteur: string; sites: number; salles: number;
};
export type FactureFigee = {
  lignes: LigneFigee[]; tauxPdm: number; portefeuilleCentimes: number; baseCentimes: number;
  commissionCentimes: number; tvaCentimes: number; ttcCentimes: number;
};
export type FactureCalcul = {
  apporteurId: number; mois: Mois; statut: "a_emettre" | "emise" | "payee"; numero: string | null;
  emiseLe: Jour | null; echeanceLe: Jour | null; payeeLe: Jour | null;
  /** Encaissé réel du groupe entier, en centimes, quand il diffère du théorique. */
  encaissements: Record<string, number>; fige: FactureFigee | null;
};
export type Contexte = {
  parametres: ParametresCalcul; apporteurs: ApporteurCalcul[]; groupes: GroupeCalcul[]; factures: FactureCalcul[];
  aujourdhui: Jour; moisCourant: Mois;
};
export type Vue = number | "tous";

/* ----------------------------- Dates ----------------------------- */

export function ajouterMois(m: Mois, n: number): Mois {
  const total = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
const versDate = (j: Jour) => new Date(`${j.slice(0, 10)}T00:00:00Z`);
const versJour = (d: Date) => d.toISOString().slice(0, 10);
export function ajouterJours(j: Jour, n: number): Jour {
  const d = versDate(j); d.setUTCDate(d.getUTCDate() + n); return versJour(d);
}
/** Même règle que le calculateur : le 31 janvier plus un mois tombe début mars. */
export function ajouterMoisAuJour(j: Jour, n: number): Jour {
  const d = versDate(j); d.setUTCMonth(d.getUTCMonth() + n); return versJour(d);
}
export const moisDe = (j: Jour): Mois => j.slice(0, 7);
export const jourFr = (j: Jour | null | undefined) => j ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : "";
export function libelleMois(m: Mois, long = false): string {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1));
  return d.toLocaleDateString("fr-FR", long ? { month: "long", year: "numeric", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" });
}

/* ----------------------------- Montants ----------------------------- */

/** Une part en pourcentage entier d'un montant en centimes. */
export const partDuMontant = (centimes: number, pourcent: number) => Math.round((centimes * pourcent) / 100);
/**
 * Un montant multiplié par un taux en points de base, arrondi au centime le
 * plus proche, demi vers le haut (comme `Math.round`). Exact sur des entiers :
 * le produit se calcule en BigInt, sans passer par un flottant.
 */
export function appliquerTaux(centimes: number, pdm: number): number {
  // Hors entiers (jamais le cas en base), l'ancien calcul reste la référence.
  if (!Number.isSafeInteger(centimes) || !Number.isSafeInteger(pdm)) return Math.round((centimes * pdm) / 10000);
  // round(x) = floor(x + 1/2) = floor((2 · c · t + 10000) / 20000), division euclidienne vers le bas.
  const numerateur = 2n * BigInt(centimes) * BigInt(pdm) + 10000n;
  const quotient = numerateur / 20000n;
  return Number(numerateur < 0n && numerateur % 20000n !== 0n ? quotient - 1n : quotient);
}

/**
 * Le récurrent mensuel de `salles` salles : chaque salle paie le prix de
 * chaque offre cochée ; le connecteur RIS ajoute son taux au montant des
 * salles, arrondi au centime une seule fois. Le calcul des apports
 * (`calculGroupe`) et l'estimation d'un prospect (`estimerMontant`) l'appellent
 * tous les deux : une seule règle.
 */
export function recurrentDesSalles(salles: number, offres: { talk: boolean; konnect: boolean; ris: boolean },
  prix: { talkCentimes: number; konnectCentimes: number; connecteurRisPdm: number }): { recurrent: number; connecteur: number } {
  const recurrent = salles * ((offres.talk ? prix.talkCentimes : 0) + (offres.konnect ? prix.konnectCentimes : 0));
  return { recurrent, connecteur: offres.ris ? appliquerTaux(recurrent, prix.connecteurRisPdm) : 0 };
}
/** « 2,5 % » depuis des points de base, sans flottant affiché. */
export function pourcentage(pdm: number): string {
  const entier = Math.trunc(pdm / 100), reste = Math.abs(pdm % 100);
  return `${pdm < 0 && entier === 0 ? "-" : ""}${entier}${reste ? "," + String(reste).padStart(2, "0").replace(/0$/, "") : ""} %`;
}

/** Prix unitaires hors taxe d'une salle, ceux de la grille en vigueur. */
export function prixHt(p: Pick<ParametresCalcul, "prix">) {
  return { talk: p.prix.talkHtCentimes, konnect: p.prix.konnectHtCentimes };
}
/** Un montant HT en TTC, avec la TVA des réglages de l'apport, pour l'affichage aux apporteurs. */
export const versTtc = (htCentimes: number, p: Pick<ParametresCalcul, "tvaPdm">) => ttcDepuisHt(htCentimes, p.tvaPdm);

/** Les frais d'installation d'un site de `salles` salles pour un produit : par salle, ou une fois par site équipé. Par groupe : comptés au groupe. */
function installationDuSite(i: InstallationApport, salles: number): number {
  return i.mode === "salle" ? salles * i.ttcCentimes : i.mode === "site" && salles > 0 ? i.ttcCentimes : 0;
}

export function tauxPour(portefeuille: number, p: ParametresCalcul): number {
  return portefeuille <= p.seuil1Centimes ? p.taux1Pdm : portefeuille <= p.seuil2Centimes ? p.taux2Pdm : p.taux3Pdm;
}
export function palierPour(portefeuille: number, p: ParametresCalcul): 1 | 2 | 3 {
  return portefeuille <= p.seuil1Centimes ? 1 : portefeuille <= p.seuil2Centimes ? 2 : 3;
}

/* ----------------------------- Groupe ----------------------------- */

export function offresDuSite(s: SiteCalcul, g: Pick<GroupeCalcul, "offreTalk" | "offreKonnect" | "offreConnecteurRis">) {
  return { talk: g.offreTalk || s.offreTalk, konnect: g.offreKonnect || s.offreKonnect, ris: g.offreConnecteurRis || s.offreConnecteurRis };
}

export type CalculSite = { id: number; offres: ReturnType<typeof offresDuSite>; salles: number; recurrent: number; connecteur: number; installation: number; actif: boolean };
export type CalculGroupe = {
  recurrent: number; connecteur: number; installation: number; salles: number; sallesActives: number; sitesActifs: number; sites: CalculSite[];
};

export function calculGroupe(g: GroupeCalcul, p: ParametresCalcul): CalculGroupe {
  const u = prixHt(p), it = p.prix.installationTalk, ik = p.prix.installationKonnect;
  const r: CalculGroupe = { recurrent: 0, connecteur: 0, installation: 0, salles: 0, sallesActives: 0, sitesActifs: 0, sites: [] };
  let talk = false, konnect = false;
  for (const s of g.sites) {
    const o = offresDuSite(s, g), n = s.salles.length;
    const { recurrent, connecteur } = recurrentDesSalles(n, o, { talkCentimes: u.talk, konnectCentimes: u.konnect, connecteurRisPdm: p.prix.connecteurRisPdm });
    // Chaque installation suit la base de son tarif dans la grille.
    const installation = (o.talk ? installationDuSite(it, n) : 0) + (o.konnect ? installationDuSite(ik, n) : 0);
    const actif = n > 0 && (o.talk || o.konnect);
    if (actif && o.talk) talk = true;
    if (actif && o.konnect) konnect = true;
    r.sites.push({ id: s.id, offres: o, salles: n, recurrent, connecteur, installation, actif });
    r.recurrent += recurrent; r.connecteur += connecteur; r.installation += installation; r.salles += n;
    if (actif) { r.sallesActives += n; r.sitesActifs++; }
  }
  // Par groupe : une fois, dès qu'un site actif a l'offre.
  r.installation += (talk && it.mode === "groupe" ? it.ttcCentimes : 0) + (konnect && ik.mode === "groupe" ? ik.ttcCentimes : 0);
  return r;
}

/** Le statut suit l'étape la plus avancée dont la date est renseignée. */
export function statutCommande(g: Pick<GroupeCalcul, "bcEnvoyeLe" | "commandeValideeLe" | "commandeInstalleeLe">): StatutCommande {
  return g.commandeInstalleeLe ? "installee" : g.commandeValideeLe ? "validee" : g.bcEnvoyeLe ? "envoyee" : "prospect";
}

export type Calendrier = { debut: Mois; fin: Mois | null; nature: "place" | "venir"; reporte: boolean };

/**
 * Premier mois encaissé : la date réelle d'installation si elle est posée, sinon
 * la date prévue, si le statut entre dans le prévisionnel. Une date prévue
 * dépassée est reportée au mois en cours.
 */
export function calendrier(g: GroupeCalcul, p: ParametresCalcul, moisCourant: Mois): Calendrier | null {
  let base: Mois, nature: Calendrier["nature"];
  if (g.commandeInstalleeLe) { base = moisDe(g.commandeInstalleeLe); nature = "place"; }
  else {
    const st = statutCommande(g);
    const retenu = (st === "validee" && p.inclureValidees) || (st === "envoyee" && p.inclureBcEnvoyes) || (st === "prospect" && p.inclureProspects);
    if (!retenu || !g.deploiementPrevuLe) return null;
    base = moisDe(g.deploiementPrevuLe); nature = "venir";
  }
  let debut = ajouterMois(base, p.delaiEncaissementMois || 0), reporte = false;
  if (nature === "venir" && debut < moisCourant) { debut = moisCourant; reporte = true; }
  const fin = p.dureeCommissionMois > 0 ? ajouterMois(debut, p.dureeCommissionMois - 1) : null;
  return { debut, fin, nature, reporte };
}

/** Caducité de la validation : 12 mois, prorogés de 12 mois par un bon de commande envoyé avant la limite (art. 3.3). */
export function caducite(g: Pick<GroupeCalcul, "decision" | "decisionLe" | "bcEnvoyeLe">): Jour | null {
  if (g.decision !== "valide" || !g.decisionLe) return null;
  let limite = ajouterMoisAuJour(g.decisionLe, 12);
  if (g.bcEnvoyeLe && g.bcEnvoyeLe <= limite) {
    const prorogee = ajouterMoisAuJour(g.bcEnvoyeLe, 12);
    if (prorogee > limite) limite = prorogee;
  }
  return limite;
}

export type EtatDecision = { cle: "attente" | "soumis" | "valide" | "refuse" | "caduc" | "alerte"; libelle: string };

export function etatDecision(g: GroupeCalcul, aujourdhui: Jour): EtatDecision {
  const st = statutCommande(g), conclu = st === "validee" || st === "installee";
  if (g.decision === "refuse") return { cle: "refuse", libelle: "Refusé" };
  if (g.decision === "valide") {
    const c = caducite(g);
    if (conclu) return { cle: "valide", libelle: "Validé" };
    if (c && c < aujourdhui) return { cle: "caduc", libelle: "Caduc" };
    if (c && c <= ajouterJours(aujourdhui, 60)) return { cle: "alerte", libelle: `Validé, caduc le ${jourFr(c)}` };
    return { cle: "valide", libelle: "Validé" };
  }
  if (g.signaleLe) {
    if (ajouterJours(g.signaleLe, 7) < aujourdhui) return { cle: "alerte", libelle: "Sans réponse depuis plus de 7 jours" };
    return { cle: "soumis", libelle: "Signalé, en attente" };
  }
  return { cle: "attente", libelle: "À signaler" };
}

/** Clé de Luhn du SIREN : null si vide, false si invalide. */
export function sirenValide(saisie: string | null | undefined): boolean | null {
  const s = String(saisie ?? "").replace(/\s/g, "");
  if (!s) return null;
  if (!/^\d{9}$/.test(s)) return false;
  let total = 0;
  for (let i = 0; i < 9; i++) {
    let c = Number(s[i]);
    if (i % 2 === 1) { c *= 2; if (c > 9) c -= 9; }
    total += c;
  }
  return total % 10 === 0;
}

/* ----------------------------- Moteur ----------------------------- */

export type EntreeMois = { groupe: GroupeCalcul; recurrent: number; base: number };
export type CalculMois = {
  mois: Mois; vue: Vue; place: EntreeMois[]; venir: EntreeMois[];
  portefeuillePlace: number; portefeuille: number; tauxPdm: number | null; tauxPlacePdm: number | null;
  basePlace: number; baseVenir: number; commissionPlace: number; commissionVenir: number; socle: number;
  fige: FactureFigee | null; commissionne: boolean;
};
export type LigneFacture = LigneFigee & { part: number };
export type CalculFacture = Omit<FactureFigee, "lignes"> & { lignes: LigneFacture[]; fige: boolean };
export type ResumeOffres = { talk: string; konnect: string; connecteur: string; sites: number; salles: number };

export function creerMoteur(ctx: Contexte) {
  const p = ctx.parametres;
  const groupes = [...ctx.groupes].sort((a, b) => a.creeLe.localeCompare(b.creeLe) || a.nom.localeCompare(b.nom, "fr"));
  const parId = new Map(ctx.apporteurs.map((a) => [a.id, a]));
  const defaut = p.apporteurParDefautId != null && parId.has(p.apporteurParDefautId) ? p.apporteurParDefautId : ctx.apporteurs[0]?.id ?? 0;
  const commissionne = (a: number) => parId.get(a)?.commissionne ?? false;
  const commissionnes = ctx.apporteurs.filter((a) => a.commissionne);
  const calculs = new Map(groupes.map((g) => [g.id, calculGroupe(g, p)]));
  const calendriers = new Map(groupes.map((g) => [g.id, calendrier(g, p, ctx.moisCourant)]));
  const factures = new Map(ctx.factures.map((f) => [`${f.apporteurId}|${f.mois}`, f]));
  const memo = new Map<string, CalculMois>();

  const principal = (g: GroupeCalcul) => parId.has(g.apporteurId) ? g.apporteurId : defaut;
  const partCo = (g: GroupeCalcul) => !g.coApporteurId || g.coApporteurId === principal(g) ? 0 : Math.max(0, Math.min(100, Math.round(g.coApporteurPart)));
  /** Part du groupe revenant à un apporteur, en pourcentage entier. */
  function part(g: GroupeCalcul, a: Vue): number {
    if (a === "tous") return 100;
    let s = 0;
    if (principal(g) === a) s += 100 - partCo(g);
    if (g.coApporteurId === a && a !== principal(g)) s += partCo(g);
    return s;
  }
  const dansVue = (g: GroupeCalcul, a: Vue) => a === "tous" || part(g, a) > 0 || principal(g) === a || g.coApporteurId === a;
  const calcul = (g: GroupeCalcul) => calculs.get(g.id)!;
  const facture = (a: number, m: Mois) => factures.get(`${a}|${m}`);

  function calculMois(m: Mois, a: Vue): CalculMois {
    const cle = `${m}|${a}`;
    const deja = memo.get(cle);
    if (deja) return deja;
    let r: CalculMois;
    if (a === "tous") {
      const par = commissionnes.map((x) => calculMois(m, x.id));
      const place: EntreeMois[] = [], venir: EntreeMois[] = [];
      let portP = 0, portV = 0, baseP = 0, baseV = 0;
      for (const g of groupes) {
        const s = calendriers.get(g.id);
        if (!s || m < s.debut || (s.fin && m > s.fin)) continue;
        const rec = calcul(g).recurrent;
        if (rec <= 0) continue;
        if (s.nature === "place") {
          let base = 0, couvert = 0;
          for (const c of par) {
            const x = c.place.find((y) => y.groupe.id === g.id);
            if (x) { base += x.base; couvert += part(g, c.vue as number); }
          }
          // La part non commissionnée (vente directe) compte au théorique.
          if (couvert < 100) base += partDuMontant(rec, 100 - couvert);
          place.push({ groupe: g, recurrent: rec, base }); portP += rec; baseP += base;
        } else { venir.push({ groupe: g, recurrent: rec, base: rec }); portV += rec; baseV += rec; }
      }
      const somme = (f: (c: CalculMois) => number) => par.reduce((t, c) => t + f(c), 0);
      const actifs = par.filter((c) => c.portefeuille > 0), seul = actifs.length === 1 ? actifs[0] : null;
      r = { mois: m, vue: a, place, venir, portefeuillePlace: portP, portefeuille: portP + portV,
        tauxPdm: seul ? seul.tauxPdm : null, tauxPlacePdm: seul ? seul.tauxPlacePdm : null, basePlace: baseP, baseVenir: baseV,
        commissionPlace: somme((c) => c.commissionPlace), commissionVenir: somme((c) => c.commissionVenir), socle: somme((c) => c.socle),
        fige: null, commissionne: true };
    } else {
      const f = facture(a, m);
      const fige = f && (f.statut === "emise" || f.statut === "payee") && f.fige ? f.fige : null;
      const place: EntreeMois[] = [], venir: EntreeMois[] = [];
      let portP = a === defaut ? p.autresClientsCentimes || 0 : 0, portV = 0, baseP = 0, baseV = 0;
      for (const g of groupes) {
        const s = calendriers.get(g.id);
        if (!s || m < s.debut || (s.fin && m > s.fin)) continue;
        const pc = part(g, a);
        if (pc <= 0) continue;
        const rec = partDuMontant(calcul(g).recurrent, pc);
        if (rec <= 0) continue;
        if (s.nature === "place") {
          const encaisse = f?.encaissements?.[String(g.id)];
          const base = typeof encaisse === "number" ? partDuMontant(encaisse, pc) : rec;
          place.push({ groupe: g, recurrent: rec, base }); portP += rec; baseP += base;
        } else { venir.push({ groupe: g, recurrent: rec, base: rec }); portV += rec; baseV += rec; }
      }
      const c = commissionne(a);
      const portAll = portP + portV, tauxAll = c ? tauxPour(portAll, p) : 0, tauxP = c ? tauxPour(portP, p) : 0;
      r = { mois: m, vue: a, place, venir, portefeuillePlace: portP, portefeuille: portAll, tauxPdm: tauxAll, tauxPlacePdm: tauxP,
        basePlace: baseP, baseVenir: baseV,
        commissionPlace: fige ? fige.commissionCentimes : appliquerTaux(baseP, tauxAll),
        commissionVenir: appliquerTaux(baseV, tauxAll),
        socle: fige ? fige.commissionCentimes : appliquerTaux(baseP, tauxP), fige, commissionne: c };
    }
    memo.set(cle, r);
    return r;
  }

  function resumeOffres(g: GroupeCalcul): ResumeOffres {
    const c = calcul(g), actifs = c.sites.filter((s) => s.actif), n = actifs.length;
    const libelle = (k: "talk" | "konnect" | "ris") => {
      const q = actifs.filter((s) => s.offres[k]).length;
      return q === 0 ? "Non" : q === n ? "Oui" : `Partiel (${q}/${n})`;
    };
    return { talk: libelle("talk"), konnect: libelle("konnect"), connecteur: libelle("ris"), sites: n, salles: c.sallesActives };
  }

  /** Le taux de la facture est celui du portefeuille en place, appliqué à l'encaissé du mois. */
  function calculFacture(m: Mois, a: number): CalculFacture {
    const c = calculMois(m, a);
    if (c.fige) return { ...c.fige, lignes: c.fige.lignes.map((l) => ({ ...l, part: 100 })), fige: true };
    const taux = c.tauxPlacePdm ?? 0;
    const lignes = c.place.map((x) => {
      const pc = part(x.groupe, a), o = resumeOffres(x.groupe);
      return { organisationId: x.groupe.id, nom: x.groupe.nom + (pc < 100 ? ` (part ${pc} %)` : ""), part: pc,
        theoriqueCentimes: calcul(x.groupe).recurrent, baseCentimes: x.base, commissionCentimes: appliquerTaux(x.base, taux),
        talk: o.talk, konnect: o.konnect, connecteur: o.connecteur, sites: o.sites, salles: o.salles };
    });
    const base = lignes.reduce((t, l) => t + l.baseCentimes, 0);
    const commission = appliquerTaux(base, taux), tva = appliquerTaux(commission, p.tvaFacturePdm);
    return { lignes, tauxPdm: taux, portefeuilleCentimes: c.portefeuillePlace, baseCentimes: base,
      commissionCentimes: commission, tvaCentimes: tva, ttcCentimes: commission + tva, fige: false };
  }

  function statutFacture(m: Mois, a: number): StatutFacture {
    const f = facture(a, m);
    if (f?.statut === "payee") return "payee";
    if (f?.statut === "emise") return f.echeanceLe && f.echeanceLe < ctx.aujourdhui ? "retard" : "emise";
    return m >= ctx.moisCourant ? "encours" : "a_emettre";
  }

  /** Du premier mois encaissé d'un groupe en place au mois en cours, le plus récent d'abord. */
  function moisFacturables(a: number): Mois[] {
    if (!commissionne(a)) return [];
    let premier: Mois | null = null;
    for (const g of groupes) {
      const s = calendriers.get(g.id);
      if (s?.nature === "place" && calcul(g).recurrent > 0 && part(g, a) > 0 && (!premier || s.debut < premier)) premier = s.debut;
    }
    for (const f of ctx.factures) if (f.apporteurId === a && f.statut !== "a_emettre" && (!premier || f.mois < premier)) premier = f.mois;
    if (!premier || premier > ctx.moisCourant) return [];
    const liste: Mois[] = [];
    for (let m = premier; m <= ctx.moisCourant; m = ajouterMois(m, 1)) liste.push(m);
    return liste.reverse();
  }

  /** Commission mensuelle d'un groupe au taux actuel de chacun de ses apporteurs. */
  function commissionActuelle(g: GroupeCalcul) {
    return [principal(g), g.coApporteurId].filter((v, i, t): v is number => v != null && t.indexOf(v) === i).flatMap((a) => {
      const pc = part(g, a);
      if (pc <= 0) return [];
      const taux = commissionne(a) ? tauxPour(calculMois(ctx.moisCourant, a).portefeuille, p) : 0;
      return [{ apporteurId: a, part: pc, tauxPdm: taux, commission: appliquerTaux(partDuMontant(calcul(g).recurrent, pc), taux) }];
    });
  }

  /** Les mois du suivi : jusqu'à douze mois de réalisé, puis l'horizon choisi. */
  function moisAffiches(): Mois[] {
    let premier = ctx.moisCourant;
    for (const g of groupes) { const s = calendriers.get(g.id); if (s?.nature === "place" && s.debut < premier) premier = s.debut; }
    if (premier < ajouterMois(ctx.moisCourant, -12)) premier = ajouterMois(ctx.moisCourant, -12);
    const fin = ajouterMois(ctx.moisCourant, Math.max(1, p.horizonMois || 18) - 1);
    const liste: Mois[] = [];
    for (let m = premier; m <= fin; m = ajouterMois(m, 1)) liste.push(m);
    return liste;
  }

  /** Position dans la grille de commissionnement, et ce qui manque pour le palier suivant. */
  function jauge(a: Vue) {
    const cible = a === "tous" ? defaut : a;
    if (!commissionne(cible)) return { apporteurId: cible, commissionne: false as const };
    const courant = calculMois(ctx.moisCourant, cible);
    let pipe = courant.portefeuillePlace;
    for (const g of groupes) {
      const st = statutCommande(g);
      if (!g.commandeInstalleeLe && (st === "envoyee" || st === "validee")) pipe += partDuMontant(calcul(g).recurrent, part(g, cible));
    }
    const palier = palierPour(courant.portefeuillePlace, p);
    const u = prixHt(p), unite = u.talk + u.konnect;
    const seuil = palier === 1 ? p.seuil1Centimes : p.seuil2Centimes;
    const manque = palier < 3 ? seuil - courant.portefeuillePlace + 1 : 0;
    return { apporteurId: cible, commissionne: true as const, place: courant.portefeuillePlace, pipe, palier,
      tauxActuelPdm: tauxPour(courant.portefeuillePlace, p), tauxPipePdm: tauxPour(pipe, p),
      manque, prochainTauxPdm: palier === 1 ? p.taux2Pdm : p.taux3Pdm, salles: unite > 0 ? Math.ceil(manque / unite) : 0,
      marge: palier === 3 ? courant.portefeuillePlace - p.seuil2Centimes : 0 };
  }

  /** Le bandeau de pilotage. */
  function indicateurs(a: Vue) {
    const courant = calculMois(ctx.moisCourant, a);
    let placeAnnee = 0, venirAnnee = 0;
    for (let i = 0; i < 12; i++) { const c = calculMois(ajouterMois(ctx.moisCourant, i), a); placeAnnee += c.commissionPlace; venirAnnee += c.commissionVenir; }
    const cibles = a === "tous" ? commissionnes.map((x) => x.id) : commissionne(a) ? [a] : [];
    let aEmettre = 0, aEmettreNombre = 0, aEncaisser = 0, encaisse = 0;
    for (const x of cibles) for (const m of moisFacturables(x)) {
      const st = statutFacture(m, x), f = calculFacture(m, x);
      if (st === "a_emettre" && f.commissionCentimes > 0) { aEmettre += f.ttcCentimes; aEmettreNombre++; }
      if (st === "emise" || st === "retard") aEncaisser += f.ttcCentimes;
      if (st === "payee") encaisse += f.ttcCentimes;
    }
    const visibles = groupes.filter((g) => dansVue(g, a));
    const parStatut: Record<StatutCommande, number> = { prospect: 0, envoyee: 0, validee: 0, installee: 0 };
    for (const g of visibles) parStatut[statutCommande(g)]++;
    return { groupes: visibles.length, parStatut, courant, placeAnnee, venirAnnee, aEmettre, aEmettreNombre, aEncaisser, encaisse };
  }

  /** Taux du mois par apporteur, pour la vue « tous ». */
  const tauxParApporteur = () => commissionnes.map((x) => ({ apporteur: x, calcul: calculMois(ctx.moisCourant, x.id) }))
    .filter((x) => x.calcul.portefeuillePlace > 0);

  return {
    parametres: p, groupes, defaut, commissionne, commissionnes, principal, partCo, part, dansVue, calcul,
    calendrier: (g: GroupeCalcul) => calendriers.get(g.id) ?? null, facture, calculMois, calculFacture, statutFacture,
    moisFacturables, commissionActuelle, moisAffiches, jauge, indicateurs, resumeOffres, tauxParApporteur,
    apporteur: (id: number) => parId.get(id),
  };
}
export type Moteur = ReturnType<typeof creerMoteur>;

/** Sites, salles et modalités par statut ; « hors offre » : sans Talk ni Konnect, ou sans salle. */
export function syntheseModalites(groupes: GroupeCalcul[]) {
  const cles = ["prospect", "envoyee", "validee", "installee", "off"] as const;
  type Cle = (typeof cles)[number];
  const zero = () => Object.fromEntries(cles.map((k) => [k, 0])) as Record<Cle, number>;
  const lignes = new Map<string, Record<Cle, number>>();
  const groupesParStatut = zero(), sites = zero(), salles = zero();
  for (const g of groupes) {
    const st = statutCommande(g);
    let actif = false;
    for (const s of g.sites) {
      const o = offresDuSite(s, g), k: Cle = (o.talk || o.konnect) && s.salles.length > 0 ? st : "off";
      if (k !== "off") actif = true;
      sites[k]++; salles[k] += s.salles.length;
      for (const r of s.salles) { const l = lignes.get(r.modalite) ?? zero(); l[k]++; lignes.set(r.modalite, l); }
    }
    if (actif) groupesParStatut[st]++;
  }
  const total = (o: Record<Cle, number>) => cles.reduce((t, k) => t + o[k], 0);
  return { cles, groupes: groupesParStatut, sites, salles, modalites: lignes, total };
}
