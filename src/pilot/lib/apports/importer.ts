import type { CrmTypeOrganisation, Prisma } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { geocoderCentresDe } from "@/pilot/lib/carte/localiser";
import { ORIGINES } from "@/pilot/lib/organisations/referentielClient";
import { statutCommande, versTtc, type FactureFigee, type LigneFigee } from "./calcul";
import type { DonneesApports, SalleDonnees, SiteDonnees } from "./charger";
import { CLES_CATEGORIE, CODES_MODALITE, INVESTISSEURS, PARAMETRES_DEFAUT, risReconnu, type Categorie } from "./referentiel";

/**
 * Import et export de la sauvegarde du calculateur des apporteurs (CHOIX.md,
 * C-63). La lecture est pure : elle valide, convertit les euros en centimes et
 * les pourcentages en points de base, et dit ce qu'elle a écarté. L'écriture
 * se fait en une transaction, rejouable en essai sans rien écrire.
 *
 * Les avertissements et le journal ne portent jamais le nom, le téléphone ou
 * l'adresse e-mail d'un contact ou d'un prestataire (C-27).
 *
 * Les prix ne s'importent plus (lot S) : l'apport lit la grille tarifaire en
 * vigueur. Ceux d'une sauvegarde sont ignorés, et le rapport le dit. L'export
 * garde son format et y écrit les prix de la grille, ramenés en TTC comme avant.
 */

/* ----------------------------- Types ----------------------------- */

type Jour = string;
export type ApporteurLu = {
  cle: string; nom: string; structure: string | null; telephone: string | null; email: string | null; adresse: string | null;
  siret: string | null; rcs: string | null; tvaIntracom: string | null; prefixeFacture: string | null; mention: string | null;
  commissionne: boolean;
};
export type SalleLue = { libelle: string; modalite: string };
export type SiteLu = {
  cle: string; nom: string; adresse: string | null; ris: string | null;
  /** La version récente du calculateur range l'adresse en champs séparés, et l'établissement (C-89). */
  codePostal?: string | null; ville?: string | null; siret?: string | null; finess?: string | null;
  offreTalk: boolean; offreKonnect: boolean; offreConnecteurRis: boolean; salles: SalleLue[];
};
export type ContactLu = { nom: string; fonction: string | null; telephone: string | null; email: string | null };
export type PrestataireLu = { type: string | null; societe: string | null; nom: string | null; telephone: string | null; email: string | null; commentaire: string | null };
export type GroupeLu = {
  cle: string; nom: string; exemple: boolean; cree: number;
  apporteurCle: string; coApporteurCle: string | null; coApporteurPart: number;
  denominationSociale: string | null; siren: string | null; adresseSiege: string | null;
  categorie: Categorie | null; investisseur: string | null; precisionCategorie: string | null;
  signaleLe: Jour | null; besoin: string | null; origine: string | null; ris: string | null;
  risCodeClient: string | null; risCodesSites: string | null; risCommercial: string | null;
  risCommercialTelephone: string | null; risCommercialEmail: string | null;
  perimetre: "sites" | "groupe"; decision: "attente" | "valide" | "refuse"; decisionLe: Jour | null;
  deploiementPrevuLe: Jour | null; observations: string | null; notes: string | null;
  offreTalk: boolean; offreKonnect: boolean; offreConnecteurRis: boolean;
  bcEnvoyeLe: Jour | null; commandeValideeLe: Jour | null; commandeInstalleeLe: Jour | null;
  sites: SiteLu[]; contacts: ContactLu[]; prestataires: PrestataireLu[];
};
export type LigneFigeeLue = Omit<LigneFigee, "organisationId"> & { groupeCle: string };
export type FactureFigeeLue = Omit<FactureFigee, "lignes"> & { lignes: LigneFigeeLue[] };
export type FactureLue = {
  apporteurCle: string; mois: string; statut: "a_emettre" | "emise" | "payee"; numero: string | null;
  emiseLe: Jour | null; echeanceLe: Jour | null; payeeLe: Jour | null;
  /** Encaissé du groupe entier, en centimes, par identifiant de groupe du calculateur. */
  encaissements: Record<string, number>; fige: FactureFigeeLue | null;
};
type Parametres = typeof PARAMETRES_DEFAUT;
export type ParametresLus = Partial<Omit<Parametres, "apporteurParDefautId">>;
export type SauvegardeLue = {
  parametres: ParametresLus | null; apporteurs: ApporteurLu[]; apporteurParDefautCle: string;
  groupes: GroupeLu[]; factures: FactureLue[]; avertissements: string[];
};
export type RapportImportCalculateur = {
  essai: boolean;
  apporteurs: { crees: number; retrouves: number };
  groupes: { crees: number; rattaches: number; dejaImportes: number; ignores: number };
  sites: number; salles: number; contacts: number; prestataires: number;
  factures: { importees: number; ignorees: number };
  parametres: boolean; avertissements: string[];
};

/* ----------------------------- Lecture (pure) ----------------------------- */

/** La liste du calculateur quand la sauvegarde n'en porte pas (DEFAULT_PARAMS de l'artefact). */
const APPORTEURS_CALCULATEUR: { id: string; nom: string; structure: string; commission: boolean }[] = [
  { id: "mlo", nom: "Matthieu LORIMIER", structure: "ENTHESIS", commission: true },
  { id: "bth", nom: "Bernard THROMAS", structure: "", commission: true },
  { id: "mle", nom: "Maxime LEON", structure: "", commission: true },
  { id: "xbe", nom: "XX BELL", structure: "", commission: true },
  { id: "neu", nom: "NEURACORP", structure: "Neuracorp AI (vente directe)", commission: false },
];
const APPORTEUR_DEFAUT_CALCULATEUR = "mlo";
/** Les clés de prix de la sauvegarde du calculateur, ignorées à l'import (lot S). */
const CLES_PRIX = ["talk", "konnect", "edl", "instTalk", "instKonnect", "instMode"] as const;
export const PRIX_IGNORES = "Les prix de la sauvegarde (Talk, Konnect, connecteur RIS, installation) ne sont pas repris : l'apport d'affaires prend ceux de la grille tarifaire en vigueur, page Tarifs.";
const FORMAT = "Format non reconnu. Collez la sauvegarde copiée depuis le calculateur (bouton « Copier toutes les données ») ou son fichier .json.";

export const normaliser = (s: string) => s.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function nombre(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(/[\s  ]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
const centimes = (v: unknown) => { const n = nombre(v); return n === undefined ? undefined : Math.round(n * 100); };
const pointsDeBase = centimes;
function texte(v: unknown, max = 200): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).trim();
  return t ? t.slice(0, max) : null;
}
const bool = (v: unknown) => v === true || v === "true" || v === 1;
const entierBorne = (v: unknown, min: number, max: number) => {
  const n = nombre(v);
  return n === undefined ? undefined : Math.min(max, Math.max(min, Math.round(n)));
};

function risLu(valeur: unknown, autre: unknown): string | null {
  const v = texte(valeur, 120);
  if (!v) return null;
  if (v.toUpperCase() === "AUTRE") return texte(autre, 120);
  return risReconnu(v) ?? v;
}

const CODES_ORIGINE = Object.keys(ORIGINES) as (keyof typeof ORIGINES)[];
/** Un code de ORIGINES quand le texte le désigne sans ambiguïté, sinon le texte tel quel. */
export function origineLue(v: unknown): string | null {
  const t = texte(v, 120);
  if (!t) return null;
  const n = normaliser(t);
  const code = CODES_ORIGINE.find((c) => normaliser(c) === n || normaliser(ORIGINES[c]) === n);
  if (code) return code;
  if (n.includes("reseau")) return "RESEAU";
  if (n.includes("salon") || n.includes("jfr")) return "SALON";
  if (n.includes("apporteur")) return "APPORTEUR";
  if (n.includes("linkedin")) return "LINKEDIN";
  if (n.includes("appel d'offre")) return "APPEL_OFFRES";
  return t;
}

export function lireSauvegarde(json: unknown): SauvegardeLue {
  let source = json;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { throw new ErreurMetier(FORMAT, 400); }
  }
  if (!estObjet(source)) throw new ErreurMetier(FORMAT, 400);
  const brut = source;
  if (!("params" in brut) && !("groups" in brut) && !("invoices" in brut)) throw new ErreurMetier(FORMAT, 400);
  if (brut.version !== undefined && nombre(brut.version) !== undefined && nombre(brut.version)! > 2) {
    throw new ErreurMetier("Cette sauvegarde vient d'une version plus récente du calculateur. Mettez Pilot à jour avant de l'importer.", 400);
  }
  const avertissements: string[] = [];
  const P = estObjet(brut.params) ? brut.params : null;

  // Apporteurs
  const avecListe = P && Array.isArray(P.apporteurs) && P.apporteurs.length > 0;
  const groupesPresents = (Array.isArray(brut.groups) ? brut.groups.length : estObjet(brut.groups) ? Object.keys(brut.groups).length : 0) > 0
    || (estObjet(brut.invoices) && Object.keys(brut.invoices).length > 0);
  // Comme le calculateur : sans liste, la liste par défaut. Une sauvegarde vide n'en crée aucune.
  const listeBrute = avecListe ? P.apporteurs as unknown[] : groupesPresents ? APPORTEURS_CALCULATEUR : [];
  if (!avecListe && groupesPresents) avertissements.push("Sauvegarde sans liste d'apporteurs : la liste par défaut du calculateur est reprise.");
  const apporteurs: ApporteurLu[] = [];
  for (const a of listeBrute as unknown[]) {
    if (!estObjet(a)) continue;
    const cle = texte(a.id, 60), nom = texte(a.nom, 120);
    if (!cle || !nom || apporteurs.some((x) => x.cle === cle)) continue;
    apporteurs.push({ cle, nom, structure: texte(a.structure, 120), telephone: texte(a.tel, 30), email: texte(a.email, 120),
      adresse: texte(a.adresse, 300), siret: texte(a.siret, 40), rcs: texte(a.rcs, 80), tvaIntracom: texte(a.tva, 40),
      prefixeFacture: texte(a.prefix, 20), mention: null, commissionne: a.commission !== false });
  }
  if (!apporteurs.length && groupesPresents) throw new ErreurMetier("La sauvegarde ne contient aucun apporteur lisible. " + FORMAT, 400);
  const voulu = texte(P?.defaultApp, 60) ?? APPORTEUR_DEFAUT_CALCULATEUR;
  const apporteurParDefautCle = apporteurs.some((a) => a.cle === voulu) ? voulu : apporteurs[0]?.cle ?? "";
  // L'apporteur par défaut tire son identité de facturation des champs « émetteur ».
  if (P && apporteurs.length) {
    const d = apporteurs.find((a) => a.cle === apporteurParDefautCle)!;
    const emNom = texte(P.emNom, 120), emRep = texte(P.emRep, 120);
    if (emRep) d.nom = emRep;
    if (emNom && normaliser(emNom) !== normaliser(d.nom)) d.structure = emNom;
    d.telephone = texte(P.emTel, 30) ?? d.telephone;
    d.email = texte(P.emEmail, 120) ?? d.email;
    d.adresse = texte(P.emAdresse, 300) ?? d.adresse;
    d.rcs = texte(P.emRcs, 80) ?? d.rcs;
    d.siret = texte(P.emSiret, 40) ?? d.siret;
    d.tvaIntracom = texte(P.emTva, 40) ?? d.tvaIntracom;
    d.mention = texte(P.emMention, 300);
    d.prefixeFacture = texte(P.prefix, 20) ?? d.prefixeFacture;
  }
  const connu = (cle: string | null) => cle !== null && apporteurs.some((a) => a.cle === cle);

  // Paramètres
  let parametres: ParametresLus | null = null;
  if (P) {
    const p: ParametresLus = {};
    const fixer = <K extends keyof ParametresLus>(cle: K, valeur: ParametresLus[K] | undefined) => { if (valeur !== undefined) p[cle] = valeur; };
    const montant = (v: unknown) => { const c = centimes(v); return c === undefined ? undefined : Math.min(2_000_000_000, Math.max(0, c)); };
    const taux = (v: unknown) => { const c = pointsDeBase(v); return c === undefined ? undefined : Math.min(10000, Math.max(0, c)); };
    // Les prix viennent de la grille tarifaire : ceux de la sauvegarde ne s'écrivent pas. La TVA reste un réglage de l'apport.
    if (CLES_PRIX.some((cle) => P[cle] !== undefined && P[cle] !== null && P[cle] !== "")) avertissements.push(PRIX_IGNORES);
    fixer("tvaPdm", taux(P.tva));
    fixer("seuil1Centimes", montant(P.s1)); fixer("seuil2Centimes", montant(P.s2));
    fixer("taux1Pdm", taux(P.r1)); fixer("taux2Pdm", taux(P.r2)); fixer("taux3Pdm", taux(P.r3));
    fixer("autresClientsCentimes", montant(P.existing));
    fixer("delaiEncaissementMois", entierBorne(P.offset, 0, 24)); fixer("dureeCommissionMois", entierBorne(P.duration, 0, 240));
    fixer("horizonMois", entierBorne(P.horizon, 3, 48));
    if (P.fcValidee !== undefined) p.inclureValidees = bool(P.fcValidee);
    if (P.fcEnvoyee !== undefined) p.inclureBcEnvoyes = bool(P.fcEnvoyee);
    if (P.fcProspect !== undefined) p.inclureProspects = bool(P.fcProspect);
    fixer("tvaFacturePdm", taux(P.tvaFacture));
    // Le calculateur ramène à 15 jours un ancien délai de 30 jours resté par défaut.
    const jours = entierBorne(P.payDays, 0, 120);
    fixer("delaiPaiementJours", jours === 30 && !P.payMigrated ? 15 : jours);
    fixer("clientNom", texte(P.clNom, 200) ?? undefined); fixer("clientAdresse", texte(P.clAdresse, 300) ?? undefined);
    fixer("clientRcs", texte(P.clRcs, 120) ?? undefined);
    if (Array.isArray(P.provTypes)) {
      const types = [...new Set(P.provTypes.map((t) => texte(t, 80)).filter((t): t is string => !!t))].slice(0, 30);
      if (types.length) p.typesPrestataires = types;
    }
    if (p.seuil1Centimes !== undefined && p.seuil2Centimes !== undefined && p.seuil1Centimes > p.seuil2Centimes) {
      avertissements.push("Paliers inversés dans la sauvegarde : les seuils de commission ne sont pas repris.");
      delete p.seuil1Centimes; delete p.seuil2Centimes;
    }
    parametres = p;
  }

  // Groupes
  const groupesBruts = Array.isArray(brut.groups) ? brut.groups : estObjet(brut.groups) ? Object.values(brut.groups) : [];
  const groupes: GroupeLu[] = [];
  let modalitesInconnues = 0;
  groupesBruts.forEach((g, i) => {
    if (!estObjet(g)) return;
    const nom = texte(g.name, 200) ?? texte(g.legalName, 200) ?? `Groupe importé ${i + 1}`;
    const cle = texte(g.id, 80) ?? `sans-id-${i + 1}`;
    if (groupes.some((x) => x.cle === cle)) { avertissements.push(`Groupe en double dans la sauvegarde, ignoré : « ${nom} ».`); return; }
    const jour = (v: unknown, champ: string): Jour | null => {
      const t = texte(v, 40);
      if (!t) return null;
      const j = t.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(j) && j >= "2000-01-01" && j <= "2100-12-31" && Number.isFinite(new Date(`${j}T00:00:00Z`).getTime())) return j;
      avertissements.push(`Date illisible écartée (${champ}) pour « ${nom} ».`);
      return null;
    };
    const appLu = texte(g.app, 60);
    if (appLu && !connu(appLu)) avertissements.push(`Apporteur inconnu pour « ${nom} » : rattaché à l'apporteur par défaut.`);
    const app: string = appLu && connu(appLu) ? appLu : apporteurParDefautCle;
    let coApp = texte(g.coApp, 60);
    if (coApp && !connu(coApp)) { avertissements.push(`Co-apporteur inconnu pour « ${nom} » : retiré.`); coApp = null; }
    if (coApp === app) coApp = null;
    const qp = nombre(g.qp);
    const coShareBrut = g.coShare === undefined || g.coShare === null || g.coShare === "" ? (g.shared ? Math.max(0, 100 - (qp ?? 100)) : 30) : nombre(g.coShare) ?? 30;
    const gtype = texte(g.gtype, 40);
    const categorie = gtype && (CLES_CATEGORIE as string[]).includes(gtype) ? gtype as Categorie : null;
    const investisseur = categorie === "investisseur"
      ? (texte(g.investor, 120)?.toUpperCase() === "AUTRE" ? texte(g.investorOther, 120) : texte(g.investor, 120)) : null;
    const decision = g.decision === "valide" || g.decision === "refuse" ? g.decision : "attente";
    const sitesBruts = Array.isArray(g.sites) ? g.sites : [];
    const sites: SiteLu[] = [];
    sitesBruts.forEach((s, k) => {
      if (!estObjet(s)) return;
      const herite = s.mode === "inherit";
      const salles: SalleLue[] = [];
      (Array.isArray(s.rooms) ? s.rooms : []).forEach((r, n) => {
        if (!estObjet(r)) return;
        const modalite = texte(r.mod, 20)?.toUpperCase();
        if (!modalite || !CODES_MODALITE.includes(modalite)) { modalitesInconnues++; return; }
        salles.push({ libelle: texte(r.label, 60) ?? `Salle ${n + 1}`, modalite });
      });
      // La version récente du calculateur range l'adresse en champs séparés (adr, cp, ville) et laisse « loc » vide.
      const siretSite = texte(s.siret, 20)?.replace(/\s/g, "") ?? null;
      sites.push({ cle: texte(s.id, 80) ?? `${cle}-site-${k + 1}`, nom: texte(s.name, 120) ?? `Site ${k + 1}`, adresse: texte(s.adr, 300) ?? texte(s.loc, 300),
        codePostal: texte(s.cp, 10), ville: texte(s.ville, 200), siret: siretSite && /^\d{14}$/.test(siretSite) ? siretSite : null, finess: texte(s.finess, 200),
        ris: risLu(s.ris, s.risOther), offreTalk: !herite && bool(s.talk), offreKonnect: !herite && bool(s.konnect),
        offreConnecteurRis: bool(s.edl), salles });
    });
    const contacts: ContactLu[] = (Array.isArray(g.contacts) ? g.contacts : []).flatMap((c) => {
      if (!estObjet(c)) return [];
      const fonction = texte(c.fonction, 120), telephone = texte(c.tel, 30), email = texte(c.email, 120);
      const nomContact = texte(c.nom, 120);
      if (!nomContact && !fonction && !telephone && !email) return [];
      return [{ nom: nomContact ?? fonction ?? "Interlocuteur", fonction, telephone, email }];
    });
    const prestataires: PrestataireLu[] = (Array.isArray(g.provs) ? g.provs : []).flatMap((v) => {
      if (!estObjet(v)) return [];
      const p = { type: texte(v.type, 80), societe: texte(v.soc, 120), nom: texte(v.nom, 120), telephone: texte(v.tel, 30),
        email: texte(v.email, 120), commentaire: texte(v.com, 300) };
      return Object.values(p).some(Boolean) ? [p] : [];
    });
    const siren = texte(g.siren, 20);
    const sirenPropre = siren && /^[0-9 ]{1,11}$/.test(siren) ? siren : null;
    if (siren && !sirenPropre) avertissements.push(`SIREN illisible écarté pour « ${nom} ».`);
    groupes.push({
      cle, nom, exemple: bool(g.example), cree: nombre(g.created) ?? i,
      apporteurCle: app, coApporteurCle: coApp, coApporteurPart: Math.max(0, Math.min(100, Math.round(coShareBrut))),
      denominationSociale: texte(g.legalName, 200), siren: sirenPropre,
      // Le siège en champs séparés (version récente) ou en un seul texte (version ancienne).
      adresseSiege: texte(g.hq, 300) ?? ([texte(g.hqAdr, 200), [texte(g.hqCp, 10), texte(g.hqVille, 100)].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null),
      categorie, investisseur, precisionCategorie: categorie && categorie !== "investisseur" ? texte(g.gtypeNote, 200) : null,
      signaleLe: jour(g.dSignal, "signalement"), besoin: texte(g.besoin, 2000), origine: origineLue(g.origine),
      ris: risLu(g.risEd, g.risEdOther), risCodeClient: texte(g.risCli, 60), risCodesSites: texte(g.risSites, 200),
      risCommercial: texte(g.risCom, 80), risCommercialTelephone: texte(g.risTel, 30), risCommercialEmail: texte(g.risMail, 120),
      perimetre: g.perimetre === "groupe" ? "groupe" : "sites", decision, decisionLe: jour(g.dDecision, "décision"),
      deploiementPrevuLe: jour(g.dPrevue, "déploiement prévu"), observations: texte(g.observ, 2000), notes: texte(g.notes, 4000),
      offreTalk: bool(g.talk), offreKonnect: bool(g.konnect), offreConnecteurRis: bool(g.edl),
      bcEnvoyeLe: jour(g.dEnvoyee, "bon de commande"), commandeValideeLe: jour(g.dValidee, "commande validée"),
      commandeInstalleeLe: jour(g.dInstallee, "commande installée"),
      sites, contacts, prestataires,
    });
  });
  if (modalitesInconnues) avertissements.push(`${modalitesInconnues} salle${modalitesInconnues > 1 ? "s" : ""} de modalité inconnue écartée${modalitesInconnues > 1 ? "s" : ""}.`);
  groupes.sort((a, b) => a.cree - b.cree || a.nom.localeCompare(b.nom, "fr"));

  // Factures
  const factures: FactureLue[] = [];
  if (estObjet(brut.invoices)) {
    for (const [cleFacture, v] of Object.entries(brut.invoices)) {
      if (!estObjet(v)) continue;
      const m = /^(?:(.+)_)?(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(cleFacture);
      const mois = texte(v.month, 7) ?? m?.[2] ?? null;
      const appCle = texte(v.app, 60) ?? m?.[1] ?? apporteurParDefautCle;
      if (!mois || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) { avertissements.push(`Facture illisible écartée (${cleFacture}).`); continue; }
      if (!connu(appCle)) { avertissements.push(`Facture de ${mois} d'un apporteur inconnu écartée.`); continue; }
      if (!apporteurs.find((a) => a.cle === appCle)!.commissionne) { avertissements.push(`Facture de ${mois} d'un apporteur non commissionné écartée.`); continue; }
      const jourFacture = (x: unknown) => { const t = texte(x, 40)?.slice(0, 10); return t && /^\d{4}-\d{2}-\d{2}$/.test(t) && t >= "2000-01-01" && t <= "2100-12-31" ? t : null; };
      const encaissements: Record<string, number> = {};
      if (estObjet(v.overrides)) for (const [gid, montant] of Object.entries(v.overrides)) {
        const c = centimes(montant);
        if (c !== undefined && c >= 0) encaissements[gid] = c;
      }
      let fige: FactureFigeeLue | null = null;
      if (estObjet(v.frozen)) {
        const f = v.frozen;
        fige = {
          lignes: (Array.isArray(f.lines) ? f.lines : []).filter(estObjet).map((l) => ({
            groupeCle: texte(l.id, 80) ?? "", nom: texte(l.name, 200) ?? "", theoriqueCentimes: centimes(l.rec) ?? 0,
            baseCentimes: centimes(l.base) ?? 0, commissionCentimes: centimes(l.com) ?? 0,
            talk: texte(l.talk, 40) ?? "", konnect: texte(l.konnect, 40) ?? "", connecteur: texte(l.ris, 40) ?? "",
            sites: Math.max(0, Math.round(nombre(l.sites) ?? 0)), salles: Math.max(0, Math.round(nombre(l.salles) ?? 0)),
          })),
          tauxPdm: pointsDeBase(f.rate) ?? 0, portefeuilleCentimes: centimes(f.portfolio) ?? 0, baseCentimes: centimes(f.baseTotal) ?? 0,
          commissionCentimes: centimes(f.commission) ?? 0, tvaCentimes: centimes(f.tva) ?? 0, ttcCentimes: centimes(f.ttc) ?? 0,
        };
      }
      const statut = v.status === "emise" || v.status === "payee" ? v.status : "a_emettre";
      if (statut !== "a_emettre" && !fige) avertissements.push(`Facture de ${mois} émise sans montants figés : ses montants seront recalculés.`);
      factures.push({ apporteurCle: appCle, mois, statut, numero: texte(v.number, 60), emiseLe: jourFacture(v.issuedOn),
        echeanceLe: jourFacture(v.dueOn), payeeLe: jourFacture(v.paidOn), encaissements, fige: statut === "a_emettre" ? null : fige });
    }
  }
  return { parametres, apporteurs, apporteurParDefautCle, groupes, factures, avertissements };
}

/* ----------------------------- Écriture ----------------------------- */

class AnnulationEssai extends Error { constructor(public readonly rapport: RapportImportCalculateur) { super("essai"); } }

const TYPE_PAR_CATEGORIE: Partial<Record<Categorie, CrmTypeOrganisation>> = { public: "HOPITAL", prive: "CLINIQUE" };
const versDate = (j: Jour | null) => j ? new Date(`${j}T00:00:00Z`) : null;
const versMois = (m: string) => new Date(`${m}-01T00:00:00Z`);

/** Un nom libre parmi ceux déjà pris : « Site 1 », puis « Site 1 (2) ». */
function nomLibre(voulu: string, pris: Set<string>): string {
  let nom = voulu, n = 2;
  while (pris.has(normaliser(nom))) nom = `${voulu} (${n++})`;
  pris.add(normaliser(nom));
  return nom;
}

function donneesSites(sites: SiteLu[], pris: Set<string>) {
  return sites.map((s) => ({
    nom: nomLibre(s.nom, pris), adresse: s.adresse, ris: s.ris,
    codePostal: s.codePostal ?? null, ville: s.ville ?? null, siret: s.siret ?? null, finess: s.finess ?? null,
    offreTalk: s.offreTalk, offreKonnect: s.offreKonnect, offreConnecteurRis: s.offreConnecteurRis,
    salles: { create: s.salles.map((r, ordre) => ({ libelle: r.libelle, modalite: r.modalite, ordre })) },
  }));
}

export async function importerSauvegarde(lue: SauvegardeLue, { essai, auteurId }: { essai: boolean; auteurId: number | null }): Promise<RapportImportCalculateur> {
  const rapport: RapportImportCalculateur = {
    essai, apporteurs: { crees: 0, retrouves: 0 }, groupes: { crees: 0, rattaches: 0, dejaImportes: 0, ignores: 0 },
    sites: 0, salles: 0, contacts: 0, prestataires: 0, factures: { importees: 0, ignorees: 0 }, parametres: false,
    avertissements: [...lue.avertissements],
  };
  // Les clients qui reçoivent des sites : leur position est cherchée après le commit (lot U).
  const avecSites: number[] = [];
  try {
    await transactionJournalisee(async (tx) => {
      await ecrire(tx, lue, rapport, auteurId, avecSites);
      if (essai) throw new AnnulationEssai(rapport);
    }, { timeout: 60_000, maxWait: 10_000 });
  } catch (erreur) {
    if (erreur instanceof AnnulationEssai) return erreur.rapport;
    throw erreur;
  }
  geocoderCentresDe(avecSites);
  return rapport;
}

async function ecrire(tx: Prisma.TransactionClient, lue: SauvegardeLue, rapport: RapportImportCalculateur, auteurId: number | null, avecSites: number[]) {
  // Apporteurs : par clé d'import, par identifiant Pilot exporté (p12), puis par nom.
  const existants = await tx.crmApporteur.findMany();
  const apporteurIds = new Map<string, number>();
  const commissionnes = new Map<number, boolean>();
  let ordre = existants.length;
  for (const a of lue.apporteurs) {
    const idPilot = /^p(\d+)$/.exec(a.cle)?.[1];
    const trouve = existants.find((e) => e.cleImport === `calc:${a.cle}`)
      ?? (idPilot ? existants.find((e) => e.id === Number(idPilot)) : undefined)
      ?? existants.find((e) => normaliser(e.nom) === normaliser(a.nom));
    if (trouve) {
      rapport.apporteurs.retrouves++;
      const completer: Prisma.CrmApporteurUpdateInput = {};
      for (const champ of ["structure", "telephone", "email", "adresse", "siret", "rcs", "tvaIntracom", "prefixeFacture", "mention"] as const) {
        if (!trouve[champ] && a[champ]) completer[champ] = a[champ];
      }
      if (!trouve.cleImport && !idPilot && !existants.some((e) => e.cleImport === `calc:${a.cle}`)) completer.cleImport = `calc:${a.cle}`;
      if (Object.keys(completer).length) await tx.crmApporteur.update({ where: { id: trouve.id }, data: completer });
      apporteurIds.set(a.cle, trouve.id);
      commissionnes.set(trouve.id, trouve.commissionne);
    } else {
      const { cle, ...champs } = a;
      const cree = await tx.crmApporteur.create({ data: { ...champs, ordre: ordre++, cleImport: `calc:${cle}` } });
      rapport.apporteurs.crees++;
      apporteurIds.set(cle, cree.id);
      commissionnes.set(cree.id, cree.commissionne);
      existants.push(cree);
    }
  }
  const apporteurDe = (cle: string | null) => cle === null ? null : apporteurIds.get(cle) ?? null;

  // Paramètres
  const defaut = apporteurDe(lue.apporteurParDefautCle);
  if (lue.parametres) {
    const data = { ...lue.parametres, apporteurParDefautId: defaut };
    await tx.crmParametresApport.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    rapport.parametres = true;
  } else if (defaut) {
    await tx.crmParametresApport.upsert({ where: { id: 1 }, create: { id: 1, apporteurParDefautId: defaut }, update: {} });
  }

  // Groupes
  const apports = await tx.crmApport.findMany({ select: { organisationId: true, cleImport: true } });
  const organisations = await tx.crmOrganisation.findMany({ select: { id: true, raisonSocialeNom: true, ris: true, notes: true, origine: true,
    apport: { select: { id: true } } } });
  const groupeIds = new Map<string, number>();
  const rattachables = new Map<string, (typeof organisations)[number]>();
  for (const o of organisations) if (!o.apport && !rattachables.has(normaliser(o.raisonSocialeNom))) rattachables.set(normaliser(o.raisonSocialeNom), o);

  for (const g of lue.groupes) {
    if (g.exemple) { rapport.groupes.ignores++; continue; }
    const idPilot = /^g(\d+)$/.exec(g.cle)?.[1];
    const deja = apports.find((a) => a.cleImport === `calc:${g.cle}`) ?? (idPilot ? apports.find((a) => a.organisationId === Number(idPilot)) : undefined);
    if (deja) { rapport.groupes.dejaImportes++; groupeIds.set(g.cle, deja.organisationId); continue; }
    const apporteurId = apporteurDe(g.apporteurCle) ?? defaut;
    if (!apporteurId) { rapport.groupes.ignores++; rapport.avertissements.push(`Groupe sans apporteur ignoré : « ${g.nom} ».`); continue; }
    const coApporteurId = apporteurDe(g.coApporteurCle);
    const apport = {
      apporteurId, coApporteurId: coApporteurId === apporteurId ? null : coApporteurId, coApporteurPart: g.coApporteurPart,
      denominationSociale: g.denominationSociale, siren: g.siren, adresseSiege: g.adresseSiege, categorie: g.categorie,
      investisseur: g.investisseur, precisionCategorie: g.precisionCategorie, signaleLe: versDate(g.signaleLe), besoin: g.besoin,
      risCodeClient: g.risCodeClient, risCodesSites: g.risCodesSites, risCommercial: g.risCommercial,
      risCommercialTelephone: g.risCommercialTelephone, risCommercialEmail: g.risCommercialEmail, perimetre: g.perimetre,
      decision: g.decision, decisionLe: versDate(g.decisionLe), deploiementPrevuLe: versDate(g.deploiementPrevuLe),
      observations: g.observations, offreTalk: g.offreTalk, offreKonnect: g.offreKonnect, offreConnecteurRis: g.offreConnecteurRis,
      bcEnvoyeLe: versDate(g.bcEnvoyeLe), commandeValideeLe: versDate(g.commandeValideeLe), commandeInstalleeLe: versDate(g.commandeInstalleeLe),
      cleImport: `calc:${g.cle}`,
    };
    const salles = g.sites.reduce((t, s) => t + s.salles.length, 0);
    const existant = rattachables.get(normaliser(g.nom));
    let organisationId: number;
    if (existant) {
      rattachables.delete(normaliser(g.nom));
      organisationId = existant.id;
      const centres = await tx.crmCentre.findMany({ where: { organisationId }, select: { nom: true } });
      const pris = new Set(centres.map((c) => normaliser(c.nom)));
      for (const site of donneesSites(g.sites, pris)) await tx.crmCentre.create({ data: { ...site, organisationId } });
      const contacts = await tx.crmContact.findMany({ where: { organisationId }, select: { nom: true } });
      const connus = new Set(contacts.map((c) => normaliser(c.nom)));
      const nouveaux = g.contacts.filter((c) => !connus.has(normaliser(c.nom)));
      if (nouveaux.length) await tx.crmContact.createMany({ data: nouveaux.map((c) => ({ ...c, organisationId })) });
      if (g.prestataires.length) await tx.crmPrestataire.createMany({ data: g.prestataires.map((p, i) => ({ ...p, organisationId, ordre: i })) });
      const completer = { ...(!existant.ris && g.ris ? { ris: g.ris } : {}), ...(!existant.notes && g.notes ? { notes: g.notes } : {}),
        ...(!existant.origine && g.origine ? { origine: g.origine } : {}) };
      if (Object.keys(completer).length) await tx.crmOrganisation.update({ where: { id: organisationId }, data: completer });
      rapport.groupes.rattaches++;
      rapport.contacts += nouveaux.length;
    } else {
      const pris = new Set<string>();
      const org = await tx.crmOrganisation.create({ data: {
        raisonSocialeNom: g.nom, type: (g.categorie && TYPE_PAR_CATEGORIE[g.categorie]) ?? "GROUPE_PRIVE", etape: "PROSPECT",
        etapeDepuisLe: new Date(), origine: g.origine ?? "APPORTEUR", ris: g.ris, notes: g.notes,
        centres: { create: donneesSites(g.sites, pris) },
        contacts: { create: g.contacts.map((c, i) => ({ ...c, principal: i === 0 })) },
        prestataires: { create: g.prestataires.map((p, i) => ({ ...p, ordre: i })) },
      } });
      organisationId = org.id;
      await journaliser(tx, { type: "ORGANISATION_CREEE", organisationId, auteurId, resume: "Prospect créé par import du calculateur",
        apres: { type: org.type, origine: org.origine } });
      rapport.groupes.crees++;
      rapport.contacts += g.contacts.length;
    }
    await tx.crmApport.create({ data: { ...apport, organisationId } });
    await journaliser(tx, { type: "APPORT_CREE", organisationId, auteurId, resume: "Suivi en apport d'affaires (import du calculateur)",
      apres: { apporteurId, sites: g.sites.length, salles } });
    apports.push({ organisationId, cleImport: apport.cleImport });
    groupeIds.set(g.cle, organisationId);
    if (g.sites.length) avecSites.push(organisationId);
    rapport.sites += g.sites.length;
    rapport.salles += salles;
    rapport.prestataires += g.prestataires.length;
  }

  // Factures : jamais par-dessus une facture déjà émise ou payée dans Pilot.
  let groupesInconnus = 0;
  for (const f of lue.factures) {
    const apporteurId = apporteurDe(f.apporteurCle);
    if (!apporteurId || !commissionnes.get(apporteurId)) {
      rapport.factures.ignorees++;
      rapport.avertissements.push(`Facture de ${f.mois} d'un apporteur non commissionné écartée.`);
      continue;
    }
    if (f.statut === "a_emettre" && !f.numero && !Object.keys(f.encaissements).length) continue;
    const mois = versMois(f.mois);
    const actuelle = await tx.crmFactureApport.findUnique({ where: { apporteurId_mois: { apporteurId, mois } }, select: { statut: true } });
    if (actuelle && (actuelle.statut === "emise" || actuelle.statut === "payee")) { rapport.factures.ignorees++; continue; }
    const encaissements: Record<string, number> = {};
    for (const [gid, c] of Object.entries(f.encaissements)) {
      const id = groupeIds.get(gid);
      if (id) encaissements[String(id)] = c; else groupesInconnus++;
    }
    const fige: FactureFigee | null = f.fige ? { ...f.fige, lignes: f.fige.lignes.map(({ groupeCle, ...l }) => {
      const id = groupeIds.get(groupeCle);
      if (!id) groupesInconnus++;
      return { ...l, organisationId: id ?? 0 };
    }) } : null;
    const data = { statut: f.statut, numero: f.numero, emiseLe: versDate(f.emiseLe), echeanceLe: versDate(f.echeanceLe), payeeLe: versDate(f.payeeLe),
      encaissements, fige: (fige ?? undefined) as unknown as Prisma.InputJsonValue | undefined };
    await tx.crmFactureApport.upsert({ where: { apporteurId_mois: { apporteurId, mois } }, create: { apporteurId, mois, ...data }, update: data });
    rapport.factures.importees++;
  }
  if (groupesInconnus) rapport.avertissements.push(`${groupesInconnus} montant${groupesInconnus > 1 ? "s" : ""} de facture rattaché${groupesInconnus > 1 ? "s" : ""} à un groupe absent de la sauvegarde.`);

  const g = rapport.groupes;
  await journaliser(tx, { type: "IMPORT_EXECUTE", auteurId,
    resume: `Import du calculateur : ${g.crees} groupe${g.crees > 1 ? "s" : ""} créé${g.crees > 1 ? "s" : ""}, ${g.rattaches} rattaché${g.rattaches > 1 ? "s" : ""}, ${rapport.factures.importees} facture${rapport.factures.importees > 1 ? "s" : ""}`,
    apres: { apporteurs: rapport.apporteurs, groupes: rapport.groupes, sites: rapport.sites, salles: rapport.salles, factures: rapport.factures, parametres: rapport.parametres } });
}

/* ----------------------------- Export (pur) ----------------------------- */

const euros = (c: number) => c / 100;
const pour = (pdm: number) => pdm / 100;

/**
 * La sauvegarde au format v2 du calculateur, depuis Pilot. Rechargée dans le
 * calculateur, elle s'ouvre telle quelle ; réimportée dans Pilot, elle retrouve
 * ses groupes par leur identifiant (g12) sans rien dupliquer.
 */
export function exporterSauvegarde(d: DonneesApports) {
  const p = d.parametres, prix = d.prix;
  const defautId = p.apporteurParDefautId != null && d.apporteurs.some((a) => a.id === p.apporteurParDefautId) ? p.apporteurParDefautId : d.apporteurs[0]?.id ?? null;
  const def = d.apporteurs.find((a) => a.id === defautId);
  const ris = (v: string | null) => { const connu = risReconnu(v); return { ris: connu ?? (v ? "AUTRE" : ""), autre: connu ? "" : v ?? "" }; };
  const params = {
    // Les prix de la grille en vigueur, au format du calculateur : TTC, connecteur en pourcentage, un seul mode d'installation (celui de Talk).
    talk: euros(versTtc(prix.talkHtCentimes, p)), konnect: euros(versTtc(prix.konnectHtCentimes, p)), tva: pour(p.tvaPdm), edl: pour(prix.connecteurRisPdm),
    instTalk: euros(prix.installationTalk.ttcCentimes), instKonnect: euros(prix.installationKonnect.ttcCentimes), instMode: prix.installationTalk.mode,
    s1: euros(p.seuil1Centimes), s2: euros(p.seuil2Centimes), r1: pour(p.taux1Pdm), r2: pour(p.taux2Pdm), r3: pour(p.taux3Pdm),
    existing: euros(p.autresClientsCentimes), offset: p.delaiEncaissementMois, duration: p.dureeCommissionMois, horizon: p.horizonMois,
    fcValidee: p.inclureValidees, fcEnvoyee: p.inclureBcEnvoyes, fcProspect: p.inclureProspects,
    tvaFacture: pour(p.tvaFacturePdm), prefix: def?.prefixeFacture ?? "", payDays: p.delaiPaiementJours, payMigrated: true,
    apporteurs: d.apporteurs.map((a) => ({ id: `p${a.id}`, nom: a.nom, structure: a.structure ?? "", commission: a.commissionne,
      tel: a.telephone ?? "", email: a.email ?? "", adresse: a.adresse ?? "", siret: a.siret ?? "", rcs: a.rcs ?? "",
      tva: a.tvaIntracom ?? "", prefix: a.prefixeFacture ?? "" })),
    defaultApp: defautId != null ? `p${defautId}` : "",
    provTypes: p.typesPrestataires,
    emNom: def ? def.structure ?? def.nom : "", emRep: def?.nom ?? "", emTel: def?.telephone ?? "", emEmail: def?.email ?? "",
    emAdresse: def?.adresse ?? "", emRcs: def?.rcs ?? "", emSiret: def?.siret ?? "", emTva: def?.tvaIntracom ?? "", emMention: def?.mention ?? "",
    clNom: p.clientNom, clAdresse: p.clientAdresse, clRcs: p.clientRcs,
  };
  const groups = d.groupes.map((g) => {
    const r = ris(g.ris);
    const investisseurConnu = g.investisseur && (INVESTISSEURS as readonly string[]).includes(g.investisseur.toUpperCase());
    return {
      id: `g${g.id}`, name: g.nom, created: Date.parse(g.creeLe) || 0, app: `p${g.apporteurId}`,
      coApp: g.coApporteurId ? `p${g.coApporteurId}` : "", coShare: g.coApporteurPart,
      talk: g.offreTalk, konnect: g.offreKonnect, edl: g.offreConnecteurRis, status: statutCommande(g),
      dEnvoyee: g.bcEnvoyeLe ?? "", dValidee: g.commandeValideeLe ?? "", dInstallee: g.commandeInstalleeLe ?? "", dPrevue: g.deploiementPrevuLe ?? "",
      notes: g.notes ?? "", legalName: g.denominationSociale ?? "", siren: g.siren ?? "", hq: g.adresseSiege ?? "",
      gtype: g.categorie ?? "", investor: g.categorie === "investisseur" && g.investisseur ? (investisseurConnu ? g.investisseur.toUpperCase() : "AUTRE") : "",
      investorOther: g.categorie === "investisseur" && g.investisseur && !investisseurConnu ? g.investisseur : "",
      gtypeNote: g.precisionCategorie ?? "", dSignal: g.signaleLe ?? "",
      origine: g.origine ? (ORIGINES as Record<string, string>)[g.origine] ?? g.origine : "", besoin: g.besoin ?? "",
      contacts: g.contacts.map((c) => ({ nom: c.nom, fonction: c.fonction ?? "", tel: c.telephone ?? "", email: c.email ?? "" })),
      provs: g.prestataires.map((v) => ({ type: v.type ?? "", soc: v.societe ?? "", nom: v.nom ?? "", tel: v.telephone ?? "", email: v.email ?? "", com: v.commentaire ?? "" })),
      perimetre: g.perimetre, decision: g.decision, dDecision: g.decisionLe ?? "", observ: g.observations ?? "",
      risEd: r.ris, risEdOther: r.autre, risCli: g.risCodeClient ?? "", risSites: g.risCodesSites ?? "", risCom: g.risCommercial ?? "",
      risTel: g.risCommercialTelephone ?? "", risMail: g.risCommercialEmail ?? "",
      sites: g.sites.map((s: SiteDonnees) => {
        const rs = ris(s.ris);
        return { id: `s${s.id}`, name: s.nom, loc: s.adresse ?? s.ville ?? "", ris: rs.ris, risOther: rs.autre,
          talk: s.offreTalk, konnect: s.offreKonnect, edl: s.offreConnecteurRis,
          rooms: s.salles.map((r: SalleDonnees) => ({ id: `r${r.id}`, mod: r.modalite, label: r.libelle })) };
      }),
    };
  });
  const invoices: Record<string, unknown> = {};
  for (const f of d.factures) {
    const cle = f.apporteurId === defautId ? f.mois : `p${f.apporteurId}_${f.mois}`;
    invoices[cle] = {
      month: f.mois, app: `p${f.apporteurId}`, status: f.statut, number: f.numero ?? "", issuedOn: f.emiseLe ?? "", dueOn: f.echeanceLe ?? "",
      paidOn: f.payeeLe ?? "",
      overrides: Object.fromEntries(Object.entries(f.encaissements).map(([id, c]) => [`g${id}`, euros(c)])),
      ...(f.fige ? { frozen: {
        lines: f.fige.lignes.map((l) => ({ id: `g${l.organisationId}`, name: l.nom, rec: euros(l.theoriqueCentimes), base: euros(l.baseCentimes),
          com: euros(l.commissionCentimes), talk: l.talk, konnect: l.konnect, ris: l.connecteur, sites: l.sites, salles: l.salles })),
        rate: pour(f.fige.tauxPdm), portfolio: euros(f.fige.portefeuilleCentimes), baseTotal: euros(f.fige.baseCentimes),
        commission: euros(f.fige.commissionCentimes), tva: euros(f.fige.tvaCentimes), ttc: euros(f.fige.ttcCentimes),
      } } : {}),
    };
  }
  return { version: 2, params, groups, invoices };
}
