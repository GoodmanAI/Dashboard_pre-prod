import { euros, eurosPrecis } from "@/pilot/lib/argent";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { eurosCsv, texteCsv } from "@/pilot/lib/ca/export";
import { ORIGINES, type CleOrigine } from "@/pilot/lib/organisations/referentielClient";
import {
  ajouterJours, ajouterMois, caducite, creerMoteur, jourFr, libelleMois, offresDuSite, palierPour, partDuMontant, pourcentage,
  statutCommande, syntheseModalites, versTtc, type Mois, type Moteur, type Vue,
} from "./calcul";
import type { DonneesApports, GroupeDonnees, SiteDonnees } from "./charger";
import { contexteDe } from "./charger";
import { CATEGORIES, ETAPES_COMMANDE, MODALITES, STATUTS_FACTURE, etapeCommande, libelleModalite, type Categorie, type StatutCommande, de } from "./referentiel";

/**
 * Les documents de l'apport d'affaires (CHOIX.md, C-63), repris du calculateur :
 * fiche de signalement (annexe 2 du contrat d'apporteur), synthèse des groupes,
 * synthèse des commissions, facture d'apporteur, et le CSV du suivi mensuel.
 *
 * Des fonctions pures qui renvoient du texte : elles servent aux routes de
 * documents et à l'écran (copie du détail d'une facture). Le « PDF » est
 * l'impression du navigateur : `imprimer` ouvre la boîte d'impression au
 * chargement, où l'on choisit « Enregistrer en PDF ». Aucune dépendance ajoutée.
 */

export type OptionsDocument = { imprimer?: boolean };
export type FiltreGroupes = { statut: "all" | StatutCommande; recherche: string };

/* ----------------------------- Utilitaires ----------------------------- */

export function echapper(valeur: unknown): string {
  return String(valeur ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
const lignes = (valeur: unknown) => echapper(valeur).replace(/\n/g, "<br>");
const pluriel = (n: number, un: string, plusieurs = `${un}s`) => `${n} ${n > 1 ? plusieurs : un}`;
const sansAccents = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** « Neuracorp AI » depuis « Neuracorp AI, SAS ». */
const nomClientCourt = (d: DonneesApports) => (d.parametres.clientNom || "Neuracorp AI").split(",")[0].trim();

export function nomApporteur(d: DonneesApports, id: number | null | undefined): string {
  if (id == null) return "";
  return d.apporteurs.find((a) => a.id === id)?.nom ?? "Apporteur supprimé";
}
/** « M. LORIMIER » pour « Matthieu LORIMIER », comme le calculateur. */
export function nomCourtApporteur(d: DonneesApports, id: number | null | undefined): string {
  const nom = nomApporteur(d, id), mots = nom.split(/\s+/);
  return mots.length > 1 && /[a-zà-ÿ]/.test(mots[0]) ? `${mots[0][0]}. ${mots.slice(1).join(" ")}` : nom;
}
/** « tous » ou l'identifiant d'un apporteur connu, depuis un paramètre d'adresse. */
export function vueDepuis(d: DonneesApports, valeur: string | null): Vue {
  if (valeur === null || valeur === "" || valeur === "tous") return "tous";
  const id = Number(valeur);
  if (!Number.isInteger(id) || id <= 0) throw new ErreurMetier("Apporteur invalide.", 400);
  if (!d.apporteurs.some((a) => a.id === id)) throw new ErreurMetier("Apporteur inconnu.", 404);
  return id;
}
export function libelleVue(d: DonneesApports, vue: Vue): string {
  return vue === "tous" ? "Tous les apporteurs" : nomApporteur(d, vue);
}
export function libelleCategorie(g: Pick<GroupeDonnees, "categorie" | "investisseur" | "precisionCategorie">): string {
  const base = g.categorie ? CATEGORIES[g.categorie as Categorie] ?? g.categorie : "";
  if (!base) return "";
  const precision = g.categorie === "investisseur" ? g.investisseur : g.precisionCategorie;
  return base + (precision ? ` · ${precision}` : "");
}
export const libelleOrigine = (o: string | null) => o ? ORIGINES[o as CleOrigine] ?? o : "";

/** Le RIS d'un site : le sien, sinon celui du site principal, sinon celui du groupe. */
/** Les sites d'un groupe avec leurs champs d'affichage (l'intersection de types les lirait comme ceux du calcul). */
export const sitesDe = (g: GroupeDonnees) => g.sites as SiteDonnees[];

export function risDuSite(g: GroupeDonnees, s: SiteDonnees): string {
  if (s.ris) return s.ris;
  const principal = sitesDe(g)[0];
  if (principal && principal !== s && principal.ris) return principal.ris;
  return g.ris ?? "";
}
export function risDuGroupe(g: GroupeDonnees): string[] {
  const liste = [...new Set(sitesDe(g).map((s) => risDuSite(g, s)).filter(Boolean))];
  return liste.length ? liste : g.ris ? [g.ris] : [];
}
const localisation = (s: SiteDonnees) => s.adresse || s.ville || "";
function modalitesDuSite(s: SiteDonnees): string {
  const compte = new Map<string, number>();
  for (const r of s.salles) compte.set(r.modalite, (compte.get(r.modalite) ?? 0) + 1);
  return [...compte].map(([code, n]) => `${n} × ${libelleModalite(code)}`).join(", ");
}

type Emetteur = { nom: string; representant: string; telephone: string; email: string; adresse: string; rcs: string; siret: string; tva: string; mention: string; prefixe: string };
export function emetteur(d: DonneesApports, apporteurId: number): Emetteur {
  const a = d.apporteurs.find((x) => x.id === apporteurId);
  return { nom: a?.structure || a?.nom || "", representant: a?.nom ?? "", telephone: a?.telephone ?? "", email: a?.email ?? "",
    adresse: a?.adresse ?? "", rcs: a?.rcs ?? "", siret: a?.siret ?? "", tva: a?.tvaIntracom ?? "", mention: a?.mention ?? "", prefixe: a?.prefixeFacture ?? "" };
}

const moteurDe = (d: DonneesApports) => creerMoteur(contexteDe(d));
function groupeDe(d: DonneesApports, organisationId: number): GroupeDonnees {
  const g = d.groupes.find((x) => x.id === organisationId);
  if (!g) throw new Error("Groupe inconnu.");
  return g;
}

/** Noms de fichiers, comme le calculateur. */
const etiquette = (texte: string, defaut: string) => texte.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || defaut;
export const nomFichier = {
  fiche: (g: Pick<GroupeDonnees, "denominationSociale" | "nom">, jour: string) => `Fiche_signalement_${etiquette(g.denominationSociale || g.nom, "groupe")}_${jour}.html`,
  syntheseGroupes: (filtre: FiltreGroupes, jour: string) => `Synthese_groupes_LYRAE_${filtre.statut === "all" ? "tous" : filtre.statut}${filtre.recherche.trim() ? "_recherche" : ""}_${jour}.html`,
  syntheseCommissions: (jour: string) => `Synthese_commissions_LYRAE_${jour}.html`,
  facture: (numero: string) => `Facture_${numero.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_") || "apporteur"}.html`,
  suivi: (mois: Mois) => `Suivi_commissions_LYRAE_${mois}.csv`,
};

/* ----------------------------- Gabarit ----------------------------- */

const CSS_COMMUN = `
:root{--fg:#0f1e33;--muted:#566779;--navy:#13254a;--teal:#0e8a7d;--teal-soft:#d7efec;--navy-soft:#dde4f2;--amber:#b86e00;--amber-soft:#fbecd3;
--danger:#b3322a;--danger-soft:#f8dedb;--line:#d5dfe5;--surface:#fff;--surface-2:#eaf0f3;--bg:#f3f6f8;--t2:#4f86c6;--c-place:#00917f;--c-venir:#c0761a}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;color:var(--fg);font-size:13.5px;line-height:1.45;background:#fff}
h1,h2,h3{color:var(--navy);margin:0}
.printbar{display:flex;justify-content:flex-end;padding:12px 0}
.printbar button{font:inherit;padding:6px 14px;border-radius:6px;border:1px solid var(--navy);background:var(--navy);color:#fff;cursor:pointer}
@media print{.printbar{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid}}
`;

function page({ titre, css, corps, imprimer, orientation }: { titre: string; css: string; corps: string; imprimer?: boolean; orientation: "portrait" | "landscape" }): string {
  const auto = imprimer ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})</script>` : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(titre)}</title><style>${CSS_COMMUN}${css}@media print{@page{size:A4 ${orientation};margin:${orientation === "portrait" ? "14mm" : "10mm"}}}</style></head><body>
<div class="printbar"><button type="button" onclick="window.print()">Imprimer</button></div>
${corps}${auto}</body></html>`;
}

/* ----------------------------- Fiche de signalement ----------------------------- */

export function ficheDonnees(d: DonneesApports, organisationId: number) {
  const g = groupeDe(d, organisationId), m = moteurDe(d), c = m.calcul(g);
  const principal = m.principal(g), co = m.partCo(g);
  const apporteur = d.apporteurs.find((a) => a.id === principal);
  const sites = sitesDe(g).map((s) => {
    const o = offresDuSite(s, g);
    return { nom: s.nom, localisation: localisation(s), ris: risDuSite(g, s), salles: s.salles.length, modalites: modalitesDuSite(s),
      offres: [o.talk ? "Talk" : "", o.konnect ? "Konnect" : "", o.ris ? "Connecteur RIS" : ""].filter(Boolean).join(", ") || "Aucune" };
  });
  const offres = [
    g.offreTalk || sites.some((s) => s.offres.includes("Talk")) ? "LYRAE Talk" : "",
    g.offreKonnect || sites.some((s) => s.offres.includes("Konnect")) ? "LYRAE Konnect" : "",
    g.offreConnecteurRis || sites.some((s) => s.offres.includes("RIS")) ? "connecteur RIS" : "",
  ].filter(Boolean).join(", ");
  const contacts = g.contacts.filter((x) => x.nom || x.fonction || x.telephone || x.email);
  const totalSalles = sites.reduce((t, s) => t + s.salles, 0);
  const rubriques: [string, string][] = [
    ["Date du signalement", jourFr(g.signaleLe)],
    ["Dénomination sociale du prospect", g.denominationSociale || g.nom],
    ["Nom d'usage", g.denominationSociale && g.nom !== g.denominationSociale ? g.nom : ""],
    ["Numéro SIREN", g.siren ?? ""],
    ["Adresse du siège", g.adresseSiege ?? ""],
    ["Type de structure", libelleCategorie(g)],
    ["Sites concernés (nombre et localisation)", pluriel(sites.length, "site") + (sites.length ? " : " + sites.map((s) => s.nom + (s.localisation ? ` (${s.localisation})` : "")).join(" ; ") : "")],
    ["Nombre de salles par site", sites.map((s) => `${s.nom} : ${s.salles}`).join(" ; ") + (sites.length > 1 ? ` ; total ${totalSalles}` : "")],
    ["Interlocuteur(s), nom, fonction et coordonnées", contacts.map((x) => {
      const l1 = [x.nom, x.fonction].filter(Boolean).join(", ");
      const l2 = [x.telephone ? `Tél. ${x.telephone}` : "", x.email ? `Email ${x.email}` : ""].filter(Boolean).join(" · ");
      return [l1, l2].filter(Boolean).join("\n");
    }).join("\n\n")],
    ["Nature du besoin identifié", (g.besoin ?? "") + (offres ? `${g.besoin ? "\n" : ""}Solutions envisagées : ${offres}` : "")],
    ["Origine du contact", libelleOrigine(g.origine)],
    ["Prestataires", g.prestataires.filter((v) => v.societe || v.nom).map((v) =>
      (v.type ? `${v.type} : ` : "") + [v.societe, [v.nom, v.telephone, v.email].filter(Boolean).join(", ")].filter(Boolean).join(", ")).join("\n")],
    ["RIS en place", risDuGroupe(g).join(", ")],
    ["Éditeur RIS, contacts et codes", [
      g.risCodeClient ? `Code client : ${g.risCodeClient}` : "",
      g.risCodesSites ? `Code(s) de site : ${g.risCodesSites}` : "",
      [g.risCommercial, g.risCommercialTelephone, g.risCommercialEmail].some(Boolean) ? `Commercial : ${[g.risCommercial, g.risCommercialTelephone, g.risCommercialEmail].filter(Boolean).join(", ")}` : "",
    ].filter(Boolean).join("\n")],
    ["Périmètre de validation (art. 3.4)", g.perimetre === "groupe"
      ? "Ensemble des entités contrôlées par le groupe (art. L. 233-3 du Code de commerce), sous réserve de confirmation écrite"
      : "Sites identifiés dans la présente fiche"],
    ["Apporteur d'affaires", nomApporteur(d, principal) + (apporteur?.structure ? ` (${apporteur.structure})` : "")],
    ["Apport partagé (art. 3.5)", co > 0
      ? `Oui, avec ${nomApporteur(d, g.coApporteurId)} ; répartition proposée du chiffre d'affaires : ${nomApporteur(d, principal)} ${100 - co} %, ${nomApporteur(d, g.coApporteurId)} ${co} %`
      : "Non, apport exclusif"],
    ["Date envisagée du déploiement", jourFr(g.deploiementPrevuLe)],
    ["Bon de commande envoyé le", jourFr(g.bcEnvoyeLe)],
    ["Estimation d'abonnement (grille 2026)", c.recurrent > 0
      ? `${euros(c.recurrent)} HT par mois pour ${pluriel(c.sallesActives, "salle")}, hors connecteur et frais d'installation` : ""],
  ];
  const facultatives = new Set(["Nom d'usage", "Bon de commande envoyé le", "Éditeur RIS, contacts et codes"]);
  const cad = caducite(g);
  return { groupe: g, apporteurId: principal, sites, totalSalles,
    rubriques: rubriques.filter(([k, v]) => !facultatives.has(k) || v),
    decision: g.decision, decisionLe: jourFr(g.decisionLe), caducite: cad ? jourFr(cad) : "", observations: g.observations ?? "" };
}

export function ficheSignalementHtml(d: DonneesApports, organisationId: number, options: OptionsDocument = {}): string {
  const F = ficheDonnees(d, organisationId), E = emetteur(d, F.apporteurId), client = nomClientCourt(d);
  const contrat = `${client.toUpperCase()} / ${(E.nom || "l'apporteur").toUpperCase()}`;
  const coche = (oui: boolean, libelle: string) => `<span class="cb">${oui ? "&#9746;" : "&#9744;"}</span> ${libelle}`;
  const css = `
body{max-width:900px;margin:0 auto;padding:0 24px 32px}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
.identite{font-size:20px;font-weight:700;color:var(--navy)}
h1{font-size:21px;margin:18px 0 2px}.sub{color:var(--muted);font-size:12.5px;margin:0 0 18px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}.box{border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.box .k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}
table{width:100%;border-collapse:collapse;margin:6px 0 18px}th,td{border:1px solid #c9d4dc;padding:7px 9px;text-align:left;vertical-align:top}
.fiche th{width:34%;background:#eef2f6;font-weight:600}.sites th{background:var(--navy);color:#fff;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em}
td.r{text-align:right}h2{font-size:15px;margin:20px 0 6px}.cb{font-size:16px}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px}.sign .box{min-height:90px}
.foot{margin-top:22px;font-size:11px;color:var(--muted);border-top:1px solid var(--line);padding-top:8px}
@media print{body{max-width:none;padding:0}}`;
  const corps = `
<div class="top"><div class="identite">${echapper(E.nom)}</div><div style="text-align:right;font-size:12px;color:var(--muted)">Annexe 2 du contrat d'apporteur d'affaires<br>${echapper(contrat)}, article 3</div></div>
<h1>Fiche de signalement et de validation de prospect</h1>
<p class="sub">Fiche à compléter par l'Apporteur d'affaires et à adresser par courriel à ${echapper(client)} préalablement à toute démarche.</p>
<div class="parties">
 <div class="box"><div class="k">Apporteur d'affaires</div><b>${echapper(E.nom)}</b><br>${echapper(E.representant)}<br>${echapper(E.telephone)}${E.email ? " · " + echapper(E.email) : ""}<br><span style="color:var(--muted)">${echapper(E.adresse)}${E.rcs ? ", " + echapper(E.rcs) : ""}</span></div>
 <div class="box"><div class="k">Destinataire</div><b>${echapper(d.parametres.clientNom)}</b><br>${echapper(d.parametres.clientAdresse)}<br><span style="color:var(--muted)">${echapper(d.parametres.clientRcs)}</span></div>
</div>
<table class="fiche"><tbody>${F.rubriques.map(([k, v]) => `<tr><th>${echapper(k)}</th><td>${lignes(v) || "&nbsp;"}</td></tr>`).join("")}</tbody></table>
<h2>Détail des sites et des salles</h2>
<table class="sites"><thead><tr><th>Site</th><th>Localisation</th><th>RIS en place</th><th>Salles</th><th>Modalités</th><th>Solutions envisagées</th></tr></thead>
<tbody>${F.sites.map((s) => `<tr><td><b>${echapper(s.nom)}</b></td><td>${echapper(s.localisation)}</td><td>${echapper(s.ris)}</td><td class="r">${s.salles}</td><td>${echapper(s.modalites)}</td><td>${echapper(s.offres)}</td></tr>`).join("") || '<tr><td colspan="6">Aucun site renseigné</td></tr>'}
<tr><td colspan="3"><b>Total</b></td><td class="r"><b>${F.totalSalles}</b></td><td colspan="2"></td></tr></tbody></table>
<h2>Décision ${echapper(de(client))}</h2>
<table class="fiche"><tbody>
<tr><th>Décision</th><td>${coche(F.decision === "valide", "Validé")} &nbsp;&nbsp; ${coche(F.decision === "refuse", "Refusé")}</td></tr>
<tr><th>Date de la décision</th><td>${echapper(F.decisionLe) || "&nbsp;"}</td></tr>
<tr><th>Date de caducité (12 mois)</th><td>${echapper(F.caducite) || "&nbsp;"}</td></tr>
<tr><th>Observations</th><td>${lignes(F.observations) || "&nbsp;"}</td></tr></tbody></table>
<div class="sign"><div class="box"><div class="k">Pour ${echapper(E.nom)}, l'Apporteur d'affaires</div>${echapper(E.representant)}<br>Date et signature :</div>
<div class="box"><div class="k">Pour ${echapper(client.toUpperCase())}</div>Nom, fonction, date et signature :</div></div>
<p class="foot">Réponse ${echapper(de(client))} sous sept (7) jours calendaires ; à défaut, le prospect est réputé refusé (art. 3.1). Validation valable douze (12) mois, prorogée de douze (12) mois en cas de remise d'une proposition commerciale (art. 3.3). Données collectées dans le cadre d'une prospection professionnelle (art. 14).</p>`;
  return page({ titre: `Fiche de signalement, ${F.groupe.denominationSociale || F.groupe.nom}`, css, corps, imprimer: options.imprimer, orientation: "portrait" });
}

/* ----------------------------- Synthèses : éléments communs ----------------------------- */

const CSS_SYNTHESE = `
.wrap{max-width:1400px;margin:0 auto;padding:0 20px 40px;display:flex;flex-direction:column;gap:16px}
.eyebrow{font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:600}
header.top h1{font-size:1.5rem;margin-top:2px}header.top p{margin:4px 0 0;color:var(--muted)}
.summary,.panel{border:1px solid var(--line);border-radius:10px;padding:14px 18px}
.panel{display:flex;flex-direction:column;gap:10px}.panel h2{font-size:1.05rem}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:14px}
.kpi{display:flex;flex-direction:column;gap:2px;min-width:0}
.kpi .v{font-size:1.25rem;font-weight:700;color:var(--navy);font-variant-numeric:tabular-nums}
.kpi.hero .v{color:var(--teal);font-size:1.4rem}.kpi .s{font-size:.8rem;color:var(--muted)}
.pill{display:inline-block;padding:1px 10px;border-radius:999px;font-weight:600}
.p1{background:var(--surface-2);color:var(--muted)}.p2{background:var(--navy-soft);color:var(--t2)}.p3{background:var(--teal-soft);color:var(--teal)}
.tscroll{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:.84rem}
th,td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap;vertical-align:top}
th{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}
td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
.st{display:inline-block;font-size:.74rem;font-weight:700;padding:1px 8px;border-radius:999px;white-space:nowrap}
.st-prospect{background:var(--surface-2);color:var(--muted)}.st-envoyee{background:var(--navy-soft);color:var(--t2)}
.st-validee{background:var(--amber-soft);color:var(--amber)}.st-installee{background:var(--teal-soft);color:var(--teal)}
.inv{font-size:.7rem;font-weight:700;padding:1px 7px;border-radius:5px}
.inv-a_emettre{background:var(--amber-soft);color:var(--amber)}.inv-emise{background:var(--navy-soft);color:var(--t2)}
.inv-payee{background:var(--teal-soft);color:var(--teal)}.inv-encours{background:var(--surface-2);color:var(--muted)}.inv-retard{background:var(--danger-soft);color:var(--danger)}
tr.sec td{background:var(--navy-soft);font-weight:700;color:var(--navy);font-size:.76rem;text-transform:uppercase;letter-spacing:.05em}
tr.sec.venir td{background:var(--amber-soft);color:var(--amber)}
tr.sub td{font-weight:700}tr.tot td{font-weight:700;color:var(--navy);border-top:2px solid var(--navy)}
tr.com td{font-weight:700;color:var(--teal)}tr.gt td{font-weight:700;background:var(--surface-2)}
tr.grow td{background:var(--navy-soft);font-weight:600;color:var(--navy);white-space:normal}
td.fut,th.fut{background:var(--surface-2);font-style:italic}td.zero{color:var(--muted)}
.gi{padding-left:20px;white-space:normal}small,.muted{color:var(--muted)}small{font-size:.76rem}
.snote{font-size:.82rem;color:var(--muted);margin:0}
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:.84rem;color:var(--muted)}
.sw{width:14px;height:10px;border-radius:2px;display:inline-block;margin-right:6px;vertical-align:baseline}
.dotp,.dotv{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}.dotp{background:var(--c-place)}.dotv{background:var(--c-venir)}
.chart svg{width:100%;height:auto;display:block}
@media print{.wrap{padding:0;gap:12px;max-width:none}.summary,.panel{border:0;padding:0;break-inside:avoid}
.tscroll{overflow:visible;border:0}table{font-size:6.8pt}th,td{padding:2px 3px}.kpi .v{font-size:12pt}.kpi.hero .v{font-size:13pt}}`;

function entete(d: DonneesApports, vue: Vue, titre: string, texte: string): string {
  const a = vue === "tous" ? null : d.apporteurs.find((x) => x.id === vue);
  return `<header class="top"><div class="eyebrow">${echapper(nomClientCourt(d))} · Apport d'affaires${a ? " " + echapper(a.structure || a.nom) : ""}</div>
<h1>${echapper(titre)}</h1><p>${texte}</p></header>`;
}

const pastilleStatut = (g: GroupeDonnees, avecDate = true) => {
  const st = statutCommande(g), e = etapeCommande(st), date = e.champ ? g[e.champ] : null;
  return `<span class="st st-${st}">${echapper(e.court)}</span>${avecDate && date ? " " + jourFr(date) : ""}`;
};

/** Le bandeau de pilotage, comme en tête de l'écran. */
export function indicateursHtml(d: DonneesApports, m: Moteur, vue: Vue): string {
  const i = m.indicateurs(vue), cur = i.courant, s = i.parStatut;
  const accord = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  let taux: string, sousTaux: string;
  if (vue === "tous") {
    const liste = m.tauxParApporteur().map((x) => `${nomCourtApporteur(d, x.apporteur.id)} ${pourcentage(x.calcul.tauxPlacePdm ?? 0)}`);
    taux = `<span class="pill p1">par apporteur</span>`; sousTaux = liste.join(", ") || "Aucun portefeuille en place";
  } else if (!m.commissionne(vue)) {
    taux = `<span class="pill p1">sans commission</span>`; sousTaux = "Vente directe, non commissionnée";
  } else {
    taux = `<span class="pill p${palierPour(cur.portefeuillePlace, m.parametres)}">${pourcentage(cur.tauxPlacePdm ?? 0)}</span>`;
    sousTaux = `Portefeuille ${euros(cur.portefeuillePlace)} HT`;
  }
  return `<div class="kpis">
<div class="kpi"><span class="eyebrow">Groupes${vue === "tous" ? "" : ", " + echapper(nomCourtApporteur(d, vue))}</span><span class="v">${i.groupes}</span><span class="s">${accord(s.installee, "installé")}, ${accord(s.validee, "validé")}, ${accord(s.envoyee, "BC envoyé")}, ${accord(s.prospect, "prospect")}</span></div>
<div class="kpi"><span class="eyebrow">À la grille, en place, ${echapper(libelleMois(d.moisCourant))}</span><span class="v">${euros(cur.basePlace)}</span><span class="s">HT/mois, ${accord(cur.place.length, "groupe")} ${cur.place.length > 1 ? "facturés" : "facturé"}</span></div>
<div class="kpi"><span class="eyebrow">Taux du mois</span><span>${taux}</span><span class="s">${echapper(sousTaux)}</span></div>
<div class="kpi hero"><span class="eyebrow">Commission du mois</span><span class="v">${euros(cur.commissionPlace + cur.commissionVenir)}</span><span class="s">HT, à facturer début ${echapper(libelleMois(ajouterMois(d.moisCourant, 1)))}</span></div>
<div class="kpi"><span class="eyebrow">Prévision 12 mois</span><span class="v">${euros(i.placeAnnee + i.venirAnnee)}</span><span class="s"><span class="dotp"></span>${euros(i.placeAnnee)} en place, <span class="dotv"></span>${euros(i.venirAnnee)} à venir</span></div>
<div class="kpi"><span class="eyebrow">Factures</span><span class="v">${euros(i.aEmettre)}</span><span class="s">TTC à émettre (${i.aEmettreNombre}), ${euros(i.aEncaisser)} à encaisser, ${euros(i.encaisse)} encaissés</span></div>
</div>`;
}

/** Sites, salles et modalités par statut, comme la synthèse du calculateur. */
export function tableauModalitesHtml(groupes: GroupeDonnees[]): string {
  const s = syntheseModalites(groupes);
  const cellules = (o: Parameters<typeof s.total>[0]) => s.cles.map((k) => `<td class="r">${o[k] || ""}</td>`).join("") + `<td class="r">${s.total(o) || ""}</td>`;
  const corps = MODALITES.filter((x) => s.modalites.has(x.code)).map((x) => `<tr><td class="gi">${echapper(x.libelle)}</td>${cellules(s.modalites.get(x.code)!)}</tr>`).join("");
  return `<table><thead><tr><th>Synthèse</th>${ETAPES_COMMANDE.map((e) => `<th class="r">${echapper(e.court)}</th>`).join("")}<th class="r">Hors offre</th><th class="r">Total</th></tr></thead><tbody>
<tr class="sub"><td>Groupes</td>${cellules(s.groupes)}</tr>
<tr class="tot"><td>Nb sites / total salles</td>${s.cles.map((k) => `<td class="r">${s.sites[k] || s.salles[k] ? `${s.sites[k]} / ${s.salles[k]}` : ""}</td>`).join("")}<td class="r">${s.total(s.sites)} / ${s.total(s.salles)}</td></tr>
<tr class="sec"><td>Salles par modalité</td>${"<td></td>".repeat(6)}</tr>
${corps || '<tr><td colspan="7" class="muted">Aucune salle</td></tr>'}</tbody></table>`;
}

/* ----------------------------- Synthèse des groupes ----------------------------- */

/** Les groupes de la vue, puis ceux qui répondent à la recherche, puis ceux du statut choisi. */
export function filtrerGroupes(d: DonneesApports, m: Moteur, vue: Vue, filtre: FiltreGroupes) {
  const parId = new Map(d.groupes.map((g) => [g.id, g]));
  const tous = m.groupes.map((g) => parId.get(g.id)!).filter((g) => g && m.dansVue(g, vue));
  const q = sansAccents(filtre.recherche).trim();
  const trouves = q ? tous.filter((g) => sansAccents([
    g.nom, g.denominationSociale, g.siren, libelleCategorie(g), g.notes, g.observations, g.risCodeClient, g.risCodesSites, g.risCommercial,
    ...g.prestataires.map((v) => [v.type, v.societe, v.nom, v.commentaire].join(" ")),
    ...g.contacts.map((c) => `${c.nom} ${c.fonction ?? ""}`), g.ris,
    ...sitesDe(g).map((s) => `${s.nom} ${localisation(s)} ${risDuSite(g, s)}`),
  ].join(" ")).includes(q)) : tous;
  const affiches = trouves.filter((g) => filtre.statut === "all" || statutCommande(g) === filtre.statut);
  return { tous, trouves, affiches, recherche: q };
}

export function syntheseGroupesHtml(d: DonneesApports, vue: Vue, filtre: FiltreGroupes, options: OptionsDocument = {}): string {
  const m = moteurDe(d), p = m.parametres, { affiches } = filtrerGroupes(d, m, vue, filtre);
  const critere = `${libelleVue(d, vue)} · ${filtre.statut === "all" ? "tous les statuts" : etapeCommande(filtre.statut).libelle}${filtre.recherche.trim() ? ` · recherche « ${filtre.recherche.trim()} »` : ""}`;
  let recurrent = 0, commission = 0, sites = 0, salles = 0;
  const lignesHtml = affiches.map((g) => {
    const c = m.calcul(g), o = m.resumeOffres(g), part = vue === "tous" ? 100 : m.part(g, vue);
    const com = m.commissionActuelle(g).filter((x) => vue === "tous" || x.apporteurId === vue).reduce((t, x) => t + x.commission, 0);
    const rec = partDuMontant(c.recurrent, part);
    recurrent += rec; commission += com; sites += o.sites; salles += o.salles;
    const co = m.partCo(g);
    const tete = `<tr class="grow"><td>${echapper(g.nom)}</td><td>${echapper(libelleCategorie(g))}<br><small>${echapper(nomApporteur(d, m.principal(g)))}${co > 0 ? `, avec ${echapper(nomApporteur(d, g.coApporteurId))} (${co} %)` : ""}</small></td>
<td>${pastilleStatut(g)}</td><td>${statutCommande(g) !== "installee" && g.deploiementPrevuLe ? jourFr(g.deploiementPrevuLe) : ""}</td><td class="r">${o.sites}</td><td class="r">${o.salles}</td>
<td>${o.talk}</td><td>${o.konnect}</td><td>${o.connecteur}</td><td class="r">${euros(rec)}</td><td class="r">${euros(com)}</td></tr>`;
    const detail = sitesDe(g).map((s) => {
      const so = offresDuSite(s, g), sc = c.sites.find((x) => x.id === s.id);
      return `<tr><td class="gi" colspan="4">${echapper(s.nom)}<br><small>${echapper(modalitesDuSite(s) || "aucune salle")}</small></td><td class="r">${sc?.actif ? 1 : 0}</td><td class="r">${s.salles.length}</td>
<td>${so.talk ? "Oui" : "Non"}</td><td>${so.konnect ? "Oui" : "Non"}</td><td>${so.ris ? "Oui" : "Non"}</td><td class="r">${euros(sc?.recurrent ?? 0)}</td><td></td></tr>`;
    }).join("");
    return tete + detail;
  }).join("");
  const corps = `<div class="wrap">
${entete(d, vue, "Synthèse des groupes LYRAE", `Situation au ${jourFr(d.aujourdhui)}. Vue : ${echapper(critere)}.`)}
<section class="summary"><div class="kpis">
<div class="kpi"><span class="eyebrow">Groupes</span><span class="v">${affiches.length}</span></div>
<div class="kpi"><span class="eyebrow">Sites actifs</span><span class="v">${sites}</span></div>
<div class="kpi"><span class="eyebrow">Salles facturables</span><span class="v">${salles}</span></div>
<div class="kpi hero"><span class="eyebrow">À la grille HT / mois</span><span class="v">${euros(recurrent)}</span><span class="s">${euros(versTtc(recurrent, p))} TTC</span></div>
<div class="kpi"><span class="eyebrow">Commission / mois</span><span class="v">${euros(commission)}</span><span class="s">au taux actuel de chaque apporteur</span></div>
</div></section>
<section class="panel"><h2>Synthèse des sites et des salles</h2><div class="tscroll">${tableauModalitesHtml(affiches)}</div></section>
<section class="panel"><h2>Détail par groupe et par site</h2><div class="tscroll"><table><thead><tr><th>Groupe / site</th><th>Type et apporteur</th><th>Statut</th><th>Installation prévue</th><th class="r">Sites</th><th class="r">Salles</th><th>Talk</th><th>Konnect</th><th>Connecteur RIS</th><th class="r">À la grille HT/mois</th><th class="r">Commission/mois</th></tr></thead>
<tbody>${lignesHtml || '<tr><td colspan="11" class="muted">Aucun groupe dans cette vue</td></tr>'}
<tr class="gt"><td colspan="4">Total</td><td class="r">${sites}</td><td class="r">${salles}</td><td colspan="3"></td><td class="r">${euros(recurrent)}</td><td class="r">${euros(commission)}</td></tr></tbody></table></div></section>
<p class="snote">Prix de la grille en vigueur : Talk ${euros(versTtc(p.prix.talkHtCentimes, p))} TTC et Konnect ${euros(versTtc(p.prix.konnectHtCentimes, p))} TTC par salle et par mois. Commission estimée au taux actuel du portefeuille de chaque apporteur, connecteur RIS, installation et formation exclus.</p>
</div>`;
  return page({ titre: `Synthèse des groupes LYRAE, ${jourFr(d.aujourdhui)}`, css: CSS_SYNTHESE, corps, imprimer: options.imprimer, orientation: "landscape" });
}

/* ----------------------------- Synthèse des commissions ----------------------------- */

function pasRond(v: number): number {
  const puissance = Math.pow(10, Math.floor(Math.log10(v || 1))), f = v / puissance;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * puissance;
}
function barre(x: number, haut: number, l: number, h: number, r: number): string {
  if (h <= 0) return "";
  r = Math.min(r, h, l / 2);
  return `M${x},${haut + h}V${haut + r}Q${x},${haut} ${x + r},${haut}H${x + l - r}Q${x + l},${haut} ${x + l},${haut + r}V${haut + h}Z`;
}
const nombreFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Commission mensuelle HT : en place en plein, à venir en hachuré, le mois en cours en pointillé. */
export function graphiqueCommissionsSvg(m: Moteur, mois: Mois[], vue: Vue, moisCourant: Mois): string {
  const C = mois.map((x) => m.calculMois(x, vue));
  const n = mois.length, W = Math.max(640, n * 44), H = 260, L = 58, R = 10, T = 14, B = 34;
  // Géométrie en euros : le dessin seul, aucun montant n'en sort.
  const totaux = C.map((c) => (c.commissionPlace + c.commissionVenir) / 100), max = Math.max(...totaux, 1);
  const pas = pasRond(max / 4), haut = Math.ceil(max / pas) * pas || 1;
  const y = (v: number) => T + (H - T - B) * (1 - v / haut), bw = (W - L - R) / Math.max(1, n), w = Math.max(6, Math.min(28, bw * 0.62));
  let g = `<defs><pattern id="hachures" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#c0761a" opacity=".35"/><rect width="3" height="6" fill="#c0761a"/></pattern></defs>`;
  for (let v = 0; v <= haut + 0.1; v += pas) {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#d5dfe5" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#566779">${nombreFr.format(v)}</text>`;
  }
  mois.forEach((x, i) => {
    const c = C[i], cx = L + bw * i + bw / 2, gauche = cx - w / 2;
    const place = c.commissionPlace / 100, venir = c.commissionVenir / 100;
    if (place > 0) g += `<path d="${barre(gauche, y(place), w, y(0) - y(place), venir > 0 ? 0 : 4)}" fill="#00917f"/>`;
    if (venir > 0) g += `<path d="${barre(gauche, y(place + venir), w, Math.max(0, y(0) - y(venir) - (place > 0 ? 2 : 0)), 4)}" fill="url(#hachures)"/>`;
    if (x === moisCourant) g += `<line x1="${L + bw * i}" x2="${L + bw * i}" y1="${T}" y2="${H - B}" stroke="#566779" stroke-width="1.5" stroke-dasharray="4 4"/>`;
    if (n <= 24 || i % 2 === 0) g += `<text x="${cx}" y="${H - B + 16}" font-size="10.5" text-anchor="middle" fill="${x === moisCourant ? "#0f1e33" : "#566779"}" font-weight="${x === moisCourant ? 700 : 400}">${echapper(libelleMois(x))}</text>`;
  });
  g += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#566779" stroke-width="1"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Commission mensuelle HT, en place et à venir">${g}</svg>`;
}

/** Le tableau mensuel par groupe de l'écran Suivi : en place, à venir, portefeuille, taux, commissions, socle. */
export function tableauSuiviHtml(d: DonneesApports, m: Moteur, vue: Vue): string {
  const mois = m.moisAffiches(), C = mois.map((x) => m.calculMois(x, vue)), courant = d.moisCourant;
  const groupes = m.groupes.filter((g) => m.dansVue(g, vue) && m.calcul(g).recurrent > 0);
  const enPlace = groupes.filter((g) => m.calendrier(g)?.nature === "place"), aVenir = groupes.filter((g) => m.calendrier(g)?.nature === "venir");
  const classe = (x: Mois) => `${x > courant ? "fut" : ""}`;
  const cellule = (x: Mois, v: number) => `<td class="r ${classe(x)} ${v ? "" : "zero"}">${v ? euros(v) : "·"}</td>`;
  const douze = new Set(mois.filter((x) => x >= courant && x < ajouterMois(courant, 12)));
  const somme12 = (f: (c: (typeof C)[number]) => number) => mois.reduce((t, x, i) => t + (douze.has(x) ? f(C[i]) : 0), 0);
  const vide = mois.map((x) => `<td class="${classe(x)}"></td>`).join("");
  const ligneGroupe = (g: (typeof groupes)[number], nature: "place" | "venir") => {
    const valeurs = C.map((c) => (nature === "place" ? c.place : c.venir).find((e) => e.groupe.id === g.id)?.base ?? 0);
    const st = statutCommande(g);
    return `<tr><td class="gi">${echapper(g.nom)}${nature === "venir" ? ` <span class="st st-${st}">${echapper(etapeCommande(st).court)}</span>` : ""}</td>${mois.map((x, i) => cellule(x, valeurs[i])).join("")}<td class="r">${euros(mois.reduce((t, x, i) => t + (douze.has(x) ? valeurs[i] : 0), 0))}</td></tr>`;
  };
  const rangs: string[] = [];
  rangs.push(`<tr class="sec"><td><span class="dotp"></span>En place, facturés</td>${vide}<td></td></tr>`);
  enPlace.forEach((g) => rangs.push(ligneGroupe(g, "place")));
  if (!enPlace.length) rangs.push(`<tr><td class="gi muted">Aucun groupe installé</td>${vide}<td></td></tr>`);
  rangs.push(`<tr class="sub"><td>Encaissé HT en place</td>${mois.map((x, i) => cellule(x, C[i].basePlace)).join("")}<td class="r">${euros(somme12((c) => c.basePlace))}</td></tr>`);
  rangs.push(`<tr class="sec venir"><td><span class="dotv"></span>À venir, prévisionnel</td>${vide}<td></td></tr>`);
  aVenir.forEach((g) => rangs.push(ligneGroupe(g, "venir")));
  if (!aVenir.length) rangs.push(`<tr><td class="gi muted">Aucune commande datée à venir</td>${vide}<td></td></tr>`);
  rangs.push(`<tr class="sub"><td>Encaissé HT à venir</td>${mois.map((x, i) => cellule(x, C[i].baseVenir)).join("")}<td class="r">${euros(somme12((c) => c.baseVenir))}</td></tr>`);
  rangs.push(`<tr class="tot"><td>Portefeuille à la grille HT${m.parametres.autresClientsCentimes ? " (avec autres clients)" : ""}</td>${mois.map((x, i) => cellule(x, C[i].portefeuille)).join("")}<td></td></tr>`);
  rangs.push(`<tr><td>Taux appliqué</td>${mois.map((x, i) => `<td class="r ${classe(x)}">${C[i].tauxPdm === null ? '<span class="muted">par apporteur</span>' : `<span class="pill p${palierPour(C[i].portefeuille, m.parametres)}">${pourcentage(C[i].tauxPdm)}</span>`}</td>`).join("")}<td></td></tr>`);
  rangs.push(`<tr><td><span class="dotp"></span>Commission en place</td>${mois.map((x, i) => cellule(x, C[i].commissionPlace)).join("")}<td class="r">${euros(somme12((c) => c.commissionPlace))}</td></tr>`);
  rangs.push(`<tr><td><span class="dotv"></span>Commission à venir</td>${mois.map((x, i) => cellule(x, C[i].commissionVenir)).join("")}<td class="r">${euros(somme12((c) => c.commissionVenir))}</td></tr>`);
  rangs.push(`<tr class="com"><td>Commission totale HT</td>${mois.map((x, i) => cellule(x, C[i].commissionPlace + C[i].commissionVenir)).join("")}<td class="r">${euros(somme12((c) => c.commissionPlace + c.commissionVenir))}</td></tr>`);
  rangs.push(`<tr><td>Socle sécurisé (en place seuls)</td>${mois.map((x, i) => cellule(x, C[i].socle)).join("")}<td class="r">${euros(somme12((c) => c.socle))}</td></tr>`);
  if (vue !== "tous" && m.commissionne(vue)) {
    rangs.push(`<tr><td>Facture ${echapper(nomClientCourt(d))}</td>${mois.map((x, i) => {
      if (x > courant) return `<td class="fut"></td>`;
      const st = m.statutFacture(x, vue);
      if (st !== "payee" && st !== "emise" && st !== "retard" && !(C[i].basePlace > 0)) return `<td></td>`;
      return `<td class="r"><span class="inv inv-${st}">${echapper(STATUTS_FACTURE[st])}</span></td>`;
    }).join("")}<td></td></tr>`);
  }
  return `<table><thead><tr><th>Groupe</th>${mois.map((x) => `<th class="r ${classe(x)}">${echapper(libelleMois(x))}</th>`).join("")}<th class="r">12 mois</th></tr></thead><tbody>${rangs.join("")}</tbody></table>`;
}

export function syntheseCommissionsHtml(d: DonneesApports, vue: Vue, options: OptionsDocument = {}): string {
  const m = moteurDe(d), p = m.parametres;
  const groupes = m.groupes.filter((g) => m.dansVue(g, vue));
  const parId = new Map(d.groupes.map((g) => [g.id, g]));
  const part = (g: (typeof groupes)[number]) => vue === "tous" ? 100 : m.part(g, vue);
  const portefeuille = groupes.map((g) => {
    const gd = parId.get(g.id)!, c = m.calcul(g), o = m.resumeOffres(g), cal = m.calendrier(g);
    return `<tr><td>${echapper(g.nom)}</td><td>${echapper(libelleCategorie(gd))}</td><td>${pastilleStatut(gd, false)}</td><td>${jourFr(g.bcEnvoyeLe)}</td><td>${jourFr(g.commandeValideeLe)}</td>
<td>${jourFr(g.commandeInstalleeLe) || (g.deploiementPrevuLe ? "prévue " + jourFr(g.deploiementPrevuLe) : "")}</td><td class="r">${o.sites}</td><td class="r">${o.salles}</td><td>${o.talk}</td><td>${o.konnect}</td><td>${o.connecteur}</td>
<td class="r">${euros(partDuMontant(c.recurrent, part(g)))}</td><td>${cal ? echapper(libelleMois(cal.debut, true)) : ""}</td></tr>`;
  }).join("");
  const total = groupes.reduce((t, g) => t + partDuMontant(m.calcul(g).recurrent, part(g)), 0);
  const corps = `<div class="wrap">
${entete(d, vue, "Synthèse des commissions LYRAE", `${echapper(libelleVue(d, vue))}. Situation au ${jourFr(d.aujourdhui)}. Mois passés : réalisé. Mois futurs : prévisionnel selon les dates d'installation prévues.`)}
<section class="summary">${indicateursHtml(d, m, vue)}</section>
<section class="panel"><h2>Commission mensuelle HT</h2>
<div class="legend"><span><i class="sw" style="background:var(--c-place)"></i>Groupes en place</span><span><i class="sw" style="background:var(--c-venir)"></i>Groupes à venir (hachuré)</span><span><i class="sw" style="border-left:2px dashed var(--muted);width:2px;border-radius:0"></i>Mois en cours</span></div>
<div class="chart">${graphiqueCommissionsSvg(m, m.moisAffiches(), vue, d.moisCourant)}</div></section>
<section class="panel"><h2>Portefeuille de groupes</h2><div class="tscroll"><table><thead><tr><th>Groupe</th><th>Type</th><th>Statut</th><th>BC envoyé</th><th>Validée</th><th>Installée</th><th class="r">Sites</th><th class="r">Salles</th><th>Talk</th><th>Konnect</th><th>Connecteur RIS</th><th class="r">À la grille HT/mois</th><th>1er encaissement</th></tr></thead>
<tbody>${portefeuille || '<tr><td colspan="13" class="muted">Aucun groupe dans cette vue</td></tr>'}<tr class="gt"><td>Total</td><td colspan="10"></td><td class="r">${euros(total)}</td><td></td></tr></tbody></table></div></section>
<section class="panel"><h2>Suivi mensuel par groupe (encaissé HT), ${echapper(libelleVue(d, vue))}</h2><div class="tscroll">${tableauSuiviHtml(d, m, vue)}</div></section>
<p class="snote">Taux selon le plan de commissionnement ${echapper(nomClientCourt(d))} : ${pourcentage(p.taux1Pdm)} jusqu'à ${euros(p.seuil1Centimes)} HT/mois, ${pourcentage(p.taux2Pdm)} jusqu'à ${euros(p.seuil2Centimes)}, ${pourcentage(p.taux3Pdm)} au-delà, appliqué à la totalité du portefeuille. Connecteur RIS, installation et formation exclus de l'assiette.</p>
</div>`;
  return page({ titre: `Synthèse commissions LYRAE, ${libelleMois(d.moisCourant, true)}`, css: CSS_SYNTHESE, corps, imprimer: options.imprimer, orientation: "landscape" });
}

/* ----------------------------- Facture ----------------------------- */

function enteteFacture(d: DonneesApports, apporteurId: number, mois: Mois) {
  if (!d.apporteurs.some((a) => a.id === apporteurId)) throw new Error("Apporteur inconnu.");
  const m = moteurDe(d), E = emetteur(d, apporteurId), c = m.calculFacture(mois, apporteurId), f = m.facture(apporteurId, mois);
  const numero = f?.numero || `${E.prefixe}${mois}`, emiseLe = f?.emiseLe || d.aujourdhui;
  const echeanceLe = f?.echeanceLe || ajouterJours(emiseLe, d.parametres.delaiPaiementJours || 30);
  return { E, c, numero, emiseLe, echeanceLe };
}

export function factureHtml(d: DonneesApports, apporteurId: number, mois: Mois, options: OptionsDocument = {}): string {
  const { E, c, numero, emiseLe, echeanceLe } = enteteFacture(d, apporteurId, mois), p = d.parametres, client = nomClientCourt(d);
  const rangs = c.lignes.map((l) => `<tr><td>Commission sur encaissements ${echapper(l.nom)}<br><small>Abonnements LYRAE encaissés en ${echapper(libelleMois(mois, true))}</small></td><td>${echapper(l.talk)}</td><td>${echapper(l.konnect)}</td><td class="r">${l.sites}</td><td class="r">${l.salles}</td><td class="r">${eurosPrecis(l.baseCentimes)}</td><td class="r">${pourcentage(c.tauxPdm)}</td><td class="r">${eurosPrecis(l.commissionCentimes)}</td></tr>`).join("");
  const css = `
body{max-width:900px;margin:0 auto;padding:0 24px 40px;font-size:14px}
.top{display:flex;justify-content:space-between;gap:24px;margin-bottom:28px}.identite{font-size:20px;font-weight:700;color:var(--navy);margin-bottom:4px}
.box{border:1px solid var(--line);border-radius:8px;padding:12px 14px;min-width:240px}table{width:100%;border-collapse:collapse;margin-top:18px}
th,td{padding:8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:11px;text-transform:uppercase;color:var(--muted)}
.r{text-align:right;white-space:nowrap}.tot td{font-weight:700}.small,small{color:var(--muted);font-size:12px}
@media print{body{max-width:none;padding:0}}`;
  const corps = `
<div class="top"><div><div class="identite">${echapper(E.nom)}</div>${E.representant && E.representant !== E.nom ? `<div>${echapper(E.representant)}</div>` : ""}<div class="small">${lignes(E.adresse)}${E.siret ? "<br>SIRET " + echapper(E.siret) : ""}${E.rcs ? "<br>" + echapper(E.rcs) : ""}${E.tva ? "<br>TVA intracommunautaire " + echapper(E.tva) : ""}</div></div>
<div class="box"><b>FACTURE N° ${echapper(numero)}</b><br>Date : ${jourFr(emiseLe)}<br>Échéance : ${jourFr(echeanceLe)}</div></div>
<div class="box" style="margin-left:auto;max-width:340px"><span class="small">Facturé à</span><br><b>${echapper(p.clientNom)}</b><br>${echapper(p.clientAdresse)}<br><span class="small">${echapper(p.clientRcs)}</span></div>
<p style="margin-top:24px"><b>Objet :</b> commissions d'apport d'affaires, encaissements du mois ${echapper(de(libelleMois(mois, true)))}, selon le plan de commissionnement apporteurs d'affaires ${echapper(client)}.</p>
<table><thead><tr><th>Désignation</th><th>Talk</th><th>Konnect</th><th class="r">Sites</th><th class="r">Salles</th><th class="r">Base HT</th><th class="r">Taux</th><th class="r">Montant HT</th></tr></thead><tbody>${rangs || '<tr><td colspan="8" class="small">Aucun groupe facturé ce mois</td></tr>'}
<tr class="tot"><td colspan="7" class="r">Total HT</td><td class="r">${eurosPrecis(c.commissionCentimes)}</td></tr>
<tr><td colspan="7" class="r">TVA ${pourcentage(p.tvaFacturePdm)}</td><td class="r">${eurosPrecis(c.tvaCentimes)}</td></tr>
<tr class="tot"><td colspan="7" class="r">Total TTC</td><td class="r">${eurosPrecis(c.ttcCentimes)}</td></tr></tbody></table>
<p class="small">Taux de ${pourcentage(c.tauxPdm)} déterminé sur un portefeuille mensuel récurrent de ${euros(c.portefeuilleCentimes)} HT, appliqué à la totalité des encaissements du mois. Règlement par virement sous ${p.delaiPaiementJours || 30} jours.${E.mention ? "<br>" + echapper(E.mention) : ""}</p>`;
  return page({ titre: `Facture ${numero}`, css, corps, imprimer: options.imprimer, orientation: "portrait" });
}

/** Le détail d'une facture en texte, pour le copier dans un courriel. */
export function texteFacture(d: DonneesApports, apporteurId: number, mois: Mois): string {
  const { E, c, numero } = enteteFacture(d, apporteurId, mois), p = d.parametres;
  return [
    `Facture ${numero} ; commissions d'apport d'affaires, encaissements ${de(libelleMois(mois, true))}`,
    `Émetteur : ${E.nom}${E.siret ? `, SIRET ${E.siret}` : ""}`,
    `Client : ${p.clientNom}, ${p.clientAdresse}`,
    "",
    ...c.lignes.map((l) => `${l.nom} (Talk ${l.talk}, Konnect ${l.konnect}, ${l.sites} sites, ${l.salles} salles) : encaissé ${eurosPrecis(l.baseCentimes)} HT, commission ${eurosPrecis(l.commissionCentimes)}`),
    "",
    `Taux appliqué : ${pourcentage(c.tauxPdm)} (portefeuille ${euros(c.portefeuilleCentimes)} HT/mois)`,
    `Total HT : ${eurosPrecis(c.commissionCentimes)}`,
    `TVA ${pourcentage(p.tvaFacturePdm)} : ${eurosPrecis(c.tvaCentimes)}`,
    `Total TTC : ${eurosPrecis(c.ttcCentimes)}`,
  ].join("\n");
}

/* ----------------------------- CSV du suivi ----------------------------- */

/** Le suivi mensuel au format tableur français : BOM, « ; », virgule décimale, CRLF. */
export function suiviCsv(d: DonneesApports, vue: Vue): string {
  const m = moteurDe(d), mois = m.moisAffiches(), C = mois.map((x) => m.calculMois(x, vue));
  const groupes = m.groupes.filter((g) => m.dansVue(g, vue) && m.calcul(g).recurrent > 0);
  const valeur = (n: number | null) => n === null ? "" : eurosCsv(n);
  const rangs: string[] = [[texteCsv("Ligne"), texteCsv("Type"), ...mois.map((x) => texteCsv(x))].join(";")];
  for (const [nature, libelle] of [["place", "En place"], ["venir", "À venir"]] as const) {
    for (const g of groupes.filter((x) => m.calendrier(x)?.nature === nature)) {
      rangs.push([texteCsv(g.nom), texteCsv(libelle), ...C.map((c) => valeur((nature === "place" ? c.place : c.venir).find((e) => e.groupe.id === g.id)?.base ?? 0))].join(";"));
    }
  }
  const total = (libelle: string, f: (c: (typeof C)[number]) => number | null) => rangs.push([texteCsv(libelle), texteCsv(""), ...C.map((c) => valeur(f(c)))].join(";"));
  total("Portefeuille HT", (c) => c.portefeuille);
  total("Taux %", (c) => c.tauxPdm);
  total("Commission en place", (c) => c.commissionPlace);
  total("Commission à venir", (c) => c.commissionVenir);
  total("Commission totale", (c) => c.commissionPlace + c.commissionVenir);
  return "﻿" + rangs.map((r) => r + "\r\n").join("");
}
