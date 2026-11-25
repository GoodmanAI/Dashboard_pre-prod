import * as XLSX from "xlsx";
import type { CrmEtapeCommerciale, CrmTypeEchange, CrmTypeOrganisation, Prisma } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { geocoderCentresDe } from "@/pilot/lib/carte/localiser";
import { LIBELLES } from "@/pilot/lib/pipeline";
import { TYPES_ORGANISATION } from "@/pilot/lib/organisations/referentielClient";
import { compter } from "@/pilot/lib/texte";

/**
 * Import des prospects depuis un fichier Excel ou CSV, à l'écran (retour de Maxime,
 * 25/11/2026). Le fichier des commerciaux n'a pas d'en-têtes fixes : chaque colonne est
 * reconnue par son nom, accents, casse et ponctuation ignorés ; une colonne inconnue est
 * ignorée et le rapport le dit. Un essai à blanc montre ce qui sera créé avant d'écrire.
 *
 * On ne fait que créer : un établissement dont le nom existe déjà dans Pilot est laissé
 * tel quel (le rapport le nomme), pour ne jamais écraser une fiche suivie à la main.
 * Le journal ne porte que des identifiants et des comptes, jamais un nom (C-27).
 */

export const LIGNES_MAX = 2000;

export type Champ = "nom" | "marche" | "adresse" | "codePostal" | "ville" | "siteWeb" | "contact" | "fonction" | "telephone" | "email"
  | "dernierContact" | "statut" | "notes" | "nature" | "ris" | "agenda" | "prestataire";

/** Les noms de colonne reconnus, normalisés (sans accent, minuscules, ponctuation en espace). */
const SYNONYMES: Record<Champ, string[]> = {
  nom: ["nom du centre", "nom centre", "centre", "nom", "etablissement", "nom de l etablissement", "raison sociale", "prospect", "nom du prospect", "structure", "client"],
  marche: ["type de marche", "marche", "type", "public prive", "prive public", "secteur", "type d etablissement"],
  adresse: ["adresse", "adresse du centre", "adresse du prospect", "adresse du centre ou prospect", "adresse du centre ou du prospect", "adresse postale"],
  codePostal: ["code postal", "cp"],
  ville: ["ville", "commune"],
  siteWeb: ["site web", "site", "site internet", "url", "site web si precise"],
  contact: ["contact", "contacts", "contact precise", "contacts precises", "interlocuteur", "interlocuteurs", "nom du contact", "contact principal"],
  fonction: ["fonction", "poste", "fonction du contact", "role", "metier"],
  telephone: ["telephone", "tel", "telephone du contact", "portable", "numero", "numero de telephone"],
  email: ["email", "e mail", "mail", "adresse mail", "adresse e mail", "courriel", "mail du contact"],
  dernierContact: ["date du dernier contact", "dernier contact", "date dernier contact", "date de dernier contact", "date contact", "date"],
  statut: ["statut", "statut du prospect", "etape", "etat", "avancement"],
  notes: ["commentaires", "commentaire", "notes", "note", "notes terrain", "commentaires notes terrain", "commentaires notes", "remarques", "observations"],
  nature: ["nature du contact", "nature", "type de contact", "canal", "moyen de contact"],
  ris: ["ris", "logiciel ris", "editeur ris", "editeur du ris"],
  agenda: ["agenda maitre", "agenda", "agenda principal", "logiciel d agenda", "prise de rdv"],
  prestataire: ["prestataire telephonique", "prestataire telephonie", "prestataire tel", "operateur", "operateur telephonique", "telephonie"],
};

export const LIBELLES_CHAMPS: Record<Champ, string> = {
  nom: "Nom du centre", marche: "Type de marché", adresse: "Adresse", codePostal: "Code postal", ville: "Ville", siteWeb: "Site web",
  contact: "Contact", fonction: "Fonction", telephone: "Téléphone", email: "E-mail", dernierContact: "Date du dernier contact",
  statut: "Statut", notes: "Commentaires", nature: "Nature du contact", ris: "RIS", agenda: "Agenda maître", prestataire: "Prestataire téléphonique",
};

/** L'ordre du modèle à télécharger. */
export const COLONNES_MODELE: Champ[] = ["nom", "marche", "adresse", "siteWeb", "contact", "fonction", "telephone", "email",
  "dernierContact", "nature", "statut", "notes", "ris", "agenda", "prestataire"];

export const normaliserEntete = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();

/** Le champ d'une colonne, ou null si elle n'est pas reconnue. */
export function champDeColonne(entete: string): Champ | null {
  const n = normaliserEntete(entete);
  if (!n) return null;
  for (const [champ, noms] of Object.entries(SYNONYMES) as [Champ, string[]][]) if (noms.includes(n)) return champ;
  // « Type de marché (public/privé) », « Contacts précisés (nom, tél) » : le plus long nom reconnu qui ouvre l'en-tête.
  let meilleur: { champ: Champ; longueur: number } | null = null;
  for (const [champ, noms] of Object.entries(SYNONYMES) as [Champ, string[]][]) {
    for (const nom of noms) if (nom.length >= 4 && n.startsWith(nom + " ") && (!meilleur || nom.length > meilleur.longueur)) meilleur = { champ, longueur: nom.length };
  }
  return meilleur?.champ ?? null;
}

export type Cellule = string | number | Date | boolean | null | undefined;
export type FeuilleLue = { colonnes: Array<{ entete: string; champ: Champ | null }>; lignes: Array<{ numero: number; valeurs: Partial<Record<Champ, Cellule>> }> };

/** Lit la première feuille d'un .xlsx, .xls ou .csv (séparateur deviné : point-virgule ou virgule). */
export function lireFichier(contenu: Buffer, nomFichier: string): FeuilleLue {
  const csv = /\.csv$/i.test(nomFichier) || /\.txt$/i.test(nomFichier);
  let classeur: XLSX.WorkBook;
  try {
    if (csv) {
      const texte = contenu.toString("utf8").replace(/^﻿/, "");
      const premiere = texte.split(/\r?\n/, 1)[0] ?? "";
      const FS = (premiere.match(/;/g)?.length ?? 0) >= (premiere.match(/,/g)?.length ?? 0) ? ";" : ",";
      classeur = XLSX.read(texte, { type: "string", FS, cellDates: true, raw: true });
    } else classeur = XLSX.read(contenu, { type: "buffer", cellDates: true });
  } catch { throw new ErreurMetier("Le fichier n'a pas pu être lu. Enregistrez-le en .xlsx ou en .csv, puis réessayez.", 400); }
  const feuille = classeur.Sheets[classeur.SheetNames[0] ?? ""];
  if (!feuille) throw new ErreurMetier("Le fichier ne contient aucune feuille.", 400);
  const tableau = XLSX.utils.sheet_to_json<Cellule[]>(feuille, { header: 1, blankrows: false, defval: null, raw: true });
  return depuisTableau(tableau);
}

/** La ligne d'en-tête est la première qui nomme le centre (des lignes de titre peuvent la précéder). */
export function depuisTableau(tableau: Cellule[][]): FeuilleLue {
  const indexEntete = tableau.slice(0, 10).findIndex((l) => l.some((c) => typeof c === "string" && champDeColonne(c) === "nom"));
  if (indexEntete < 0) throw new ErreurMetier("Colonne du nom du centre introuvable. Nommez-la « Nom du centre » (voir le modèle).", 400);
  const deja = new Set<Champ>();
  const colonnes = tableau[indexEntete].map((c) => {
    const entete = c == null ? "" : String(c).trim();
    const champ = champDeColonne(entete);
    // Une colonne déjà prise (deux « Contact ») : la seconde est ignorée plutôt que d'écraser la première.
    if (champ && !deja.has(champ)) { deja.add(champ); return { entete, champ }; }
    return { entete, champ: null };
  });
  const lignes = tableau.slice(indexEntete + 1).map((l, i) => ({
    numero: indexEntete + i + 2,
    valeurs: Object.fromEntries(colonnes.flatMap((col, j) => (col.champ ? [[col.champ, l[j]]] : []))) as Partial<Record<Champ, Cellule>>,
  })).filter((l) => Object.values(l.valeurs).some((v) => v != null && String(v).trim() !== ""));
  if (lignes.length > LIGNES_MAX) throw new ErreurMetier(`Le fichier compte ${lignes.length} lignes : ${LIGNES_MAX} au plus par import.`, 400);
  return { colonnes, lignes };
}

/* ----------------------------- Lecture d'une ligne ----------------------------- */

const texte = (v: Cellule, max = 500): string | null => {
  if (v == null) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};
const sansAccent = (s: string) => normaliserEntete(s);

/** Public : hôpital ; privé : cabinet ; ou un type de Pilot écrit en toutes lettres. */
export function typeDepuisMarche(v: string | null): { type: CrmTypeOrganisation; deduit: boolean } {
  const n = v ? sansAccent(v) : "";
  for (const [code, libelle] of Object.entries(TYPES_ORGANISATION) as [CrmTypeOrganisation, string][]) {
    if (n === sansAccent(libelle) || n === sansAccent(code)) return { type: code, deduit: false };
  }
  if (/\bchu\b/.test(n)) return { type: "CHU", deduit: false };
  if (/clinique/.test(n)) return { type: "CLINIQUE", deduit: false };
  if (/\bgie\b/.test(n)) return { type: "GIE", deduit: false };
  if (/groupe/.test(n)) return { type: "GROUPE_PRIVE", deduit: false };
  if (/public|hopital|\bch\b|\bgh\b|ght/.test(n)) return { type: "HOPITAL", deduit: false };
  if (/prive|liberal|cabinet/.test(n)) return { type: "CABINET", deduit: false };
  return { type: "CABINET", deduit: true };
}

/** Les étapes qu'un import peut poser : celles d'avant la signature. Le reste se pose dans Pilot. */
const ETAPES_IMPORTABLES: CrmEtapeCommerciale[] = ["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION"];
export function etapeDepuisStatut(v: string | null): { etape: CrmEtapeCommerciale; exact: boolean } {
  if (!v) return { etape: "PROSPECT", exact: true };
  const n = sansAccent(v);
  for (const e of ETAPES_IMPORTABLES) if (n === sansAccent(LIBELLES[e]) || n === sansAccent(e)) return { etape: e, exact: true };
  if (/devis|proposition|offre/.test(n)) return { etape: "PROPOSITION", exact: false };
  if (/technique|etude|visio tech/.test(n)) return { etape: "VISIO_TECHNIQUE", exact: false };
  if (/echange|discussion|en cours|contacte|relance|interesse|chaud|tiede|rdv|rendez|demo|visio/.test(n) && !/pas interesse|non interesse/.test(n)) return { etape: "POURPARLERS", exact: false };
  return { etape: "PROSPECT", exact: false };
}

/** La nature d'un échange, si la cellule en nomme une ; sinon null (c'est peut-être le métier du contact). */
export function echangeDepuisNature(v: string | null): CrmTypeEchange | null {
  if (!v) return null;
  const n = sansAccent(v);
  if (/linkedin/.test(n)) return "LINKEDIN";
  if (/demo/.test(n)) return "DEMO";
  if (/visio|teams|zoom|meet/.test(n)) return "VISIO_POURPARLERS";
  if (/devis/.test(n)) return "DEVIS_ENVOYE";
  if (/relance/.test(n)) return "RELANCE";
  if (/mail|courriel/.test(n)) return "MAIL";
  if (/visite|salon|physique|sur place|rencontre|deplacement|rdv|rendez/.test(n)) return "VISITE";
  if (/appel|telephon|tel\b|phone/.test(n)) return "APPEL";
  return null;
}

/** Une date de cellule : Date d'Excel, nombre de série, AAAA-MM-JJ ou JJ/MM/AAAA (ou JJ/MM/AA). */
export function dateDepuisCellule(v: Cellule): Date | null | "invalide" {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isFinite(+v) ? new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())) : "invalide";
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d && d.y > 1990 ? new Date(Date.UTC(d.y, d.m - 1, d.d)) : "invalide";
  }
  const s = String(v).trim();
  let a: number, m: number, j: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (iso) [a, m, j] = [+iso[1], +iso[2], +iso[3]];
  else if (fr) [j, m, a] = [+fr[1], +fr[2], fr[3].length === 2 ? 2000 + +fr[3] : +fr[3]];
  else return "invalide";
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j ? d : "invalide";
}

/** « 12 rue X, 56300 Pontivy » : adresse, code postal et ville, quand le code postal s'y lit. */
export function decouperAdresse(v: string | null): { adresse: string | null; codePostal: string | null; ville: string | null } {
  if (!v) return { adresse: null, codePostal: null, ville: null };
  const m = /^(.*?)[,\s]+(\d{5})\s+(.+)$/.exec(v);
  if (!m) return { adresse: v, codePostal: null, ville: null };
  return { adresse: m[1].replace(/[,\s]+$/, "") || null, codePostal: m[2], ville: m[3].trim() };
}

const EMAIL = /[^\s<>,;()]+@[^\s<>,;()]+\.[a-z]{2,}/i;
const TELEPHONE = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/;

export type ProspectLu = {
  numero: number; nom: string; type: CrmTypeOrganisation; etape: CrmEtapeCommerciale;
  siteWeb: string | null; notes: string | null; ris: string | null; outilRdv: string | null;
  centre: { adresse: string | null; codePostal: string | null; ville: string | null } | null;
  contact: { nom: string; fonction: string | null; telephone: string | null; email: string | null } | null;
  echange: { type: CrmTypeEchange; le: Date } | null;
  prestataire: string | null;
  avertissements: string[];
};

/** Une ligne du fichier, prête à écrire, ou la raison de son refus. */
export function lireLigne(numero: number, v: Partial<Record<Champ, Cellule>>, maintenant = new Date()): { prospect: ProspectLu } | { refus: string } {
  const nom = texte(v.nom, 200);
  if (!nom) return { refus: "nom du centre vide" };
  const avertissements: string[] = [];
  const notes: string[] = [];

  const marche = texte(v.marche);
  const { type, deduit } = typeDepuisMarche(marche);
  if (deduit) avertissements.push(marche ? `marché « ${marche} » rangé en ${TYPES_ORGANISATION[type]}` : `marché non précisé, rangé en ${TYPES_ORGANISATION[type]}`);

  const statut = texte(v.statut);
  const { etape, exact } = etapeDepuisStatut(statut);
  if (statut && !exact) { avertissements.push(`statut « ${statut} » lu comme « ${LIBELLES[etape]} »`); notes.push(`Statut dans le fichier : ${statut}`); }

  let contactTexte = texte(v.contact, 500);
  let email = texte(v.email, 200)?.match(EMAIL)?.[0]?.toLowerCase() ?? null;
  let telephone = texte(v.telephone, 50);
  // Une cellule « Contact » qui porte aussi le mail ou le téléphone : on les sort du nom.
  if (contactTexte) {
    const mail = contactTexte.match(EMAIL)?.[0];
    if (mail) { email ??= mail.toLowerCase(); contactTexte = contactTexte.replace(mail, " "); }
    const tel = contactTexte.match(TELEPHONE)?.[0];
    if (tel) { telephone ??= tel; contactTexte = contactTexte.replace(tel, " "); }
    contactTexte = contactTexte.replace(/[\s,;:/()-]+$/g, "").replace(/^[\s,;:/()-]+/g, "").replace(/\s+/g, " ").trim() || null;
  }
  const natureTexte = texte(v.nature, 200);
  const typeEchange = echangeDepuisNature(natureTexte);
  let fonction = texte(v.fonction, 200);
  if (natureTexte && !typeEchange) { if (!fonction) fonction = natureTexte; else notes.push(`Nature du contact : ${natureTexte}`); }
  const nomContact = contactTexte ?? (email || telephone ? fonction ?? "Contact" : null);
  const contact = nomContact ? { nom: nomContact.slice(0, 200), fonction: contactTexte ? fonction : null, telephone, email } : null;

  const date = dateDepuisCellule(v.dernierContact ?? null);
  let echange: ProspectLu["echange"] = null;
  if (date === "invalide") avertissements.push(`date du dernier contact « ${texte(v.dernierContact)} » illisible, ignorée`);
  else if (date && +date > +maintenant) avertissements.push("date du dernier contact dans le futur, ignorée");
  else if (date) echange = { type: typeEchange ?? "APPEL", le: date };

  const decoupe = decouperAdresse(texte(v.adresse, 300));
  const codePostal = texte(v.codePostal, 10) ?? decoupe.codePostal;
  const ville = texte(v.ville, 120) ?? decoupe.ville;
  const centre = decoupe.adresse || codePostal || ville ? { adresse: decoupe.adresse, codePostal, ville } : null;

  let siteWeb = texte(v.siteWeb, 300);
  if (siteWeb && !/^https?:\/\//i.test(siteWeb)) siteWeb = /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(siteWeb) ? "https://" + siteWeb : null;
  if (texte(v.siteWeb) && !siteWeb) notes.push(`Site web : ${texte(v.siteWeb)}`);

  const commentaire = texte(v.notes, 4000);
  return { prospect: {
    numero, nom, type, etape, siteWeb, ris: texte(v.ris, 200), outilRdv: texte(v.agenda, 200),
    notes: [commentaire, ...notes].filter(Boolean).join("\n") || null,
    centre, contact, echange, prestataire: texte(v.prestataire, 200), avertissements,
  } };
}

/* ----------------------------- Écriture ----------------------------- */

export type RapportImportProspects = {
  essai: boolean; lues: number; creees: number;
  aCreer: Array<{ ligne: number; nom: string; etape: string; type: string }>;
  dejaLa: Array<{ ligne: number; nom: string; id: number }>;
  refusees: Array<{ ligne: number; raison: string }>;
  avertissements: Array<{ ligne: number; message: string }>;
  colonnesIgnorees: string[];
  colonnesReconnues: string[];
};

class AnnulationEssai extends Error { constructor(readonly rapport: RapportImportProspects) { super("essai"); } }
const cleNom = (s: string) => sansAccent(s);

export function resumeImportProspects(r: RapportImportProspects): string {
  return [compter(r.essai ? r.aCreer.length : r.creees, r.essai ? "prospect à créer" : "prospect créé", r.essai ? "prospects à créer" : "prospects créés"),
    compter(r.dejaLa.length, "déjà dans Pilot", "déjà dans Pilot"), compter(r.refusees.length, "ligne refusée", "lignes refusées")].join(", ");
}

/**
 * Crée les prospects du fichier, en une transaction : tout passe ou rien. En essai, la
 * même écriture est faite puis annulée, pour que le rapport dise exactement ce qui se passera.
 * Le commercial de chaque prospect est celui qui importe.
 */
export async function importerProspects(feuille: FeuilleLue, { auteurId, essai }: { auteurId: number; essai: boolean }): Promise<RapportImportProspects> {
  const rapport: RapportImportProspects = {
    essai, lues: feuille.lignes.length, creees: 0, aCreer: [], dejaLa: [], refusees: [], avertissements: [],
    colonnesIgnorees: feuille.colonnes.filter((c) => !c.champ && c.entete).map((c) => c.entete),
    colonnesReconnues: feuille.colonnes.filter((c) => c.champ).map((c) => `${c.entete} → ${LIBELLES_CHAMPS[c.champ!]}`),
  };
  const lus: ProspectLu[] = [];
  for (const l of feuille.lignes) {
    const r = lireLigne(l.numero, l.valeurs);
    if ("refus" in r) rapport.refusees.push({ ligne: l.numero, raison: r.refus });
    else lus.push(r.prospect);
  }
  const creees: number[] = [];
  try {
    await transactionJournalisee(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(72104, 0)`;
      const existantes = await tx.crmOrganisation.findMany({ select: { id: true, raisonSocialeNom: true } });
      const parNom = new Map(existantes.map((o) => [cleNom(o.raisonSocialeNom), o.id]));
      const maintenant = new Date();
      const dansLeFichier = new Set<string>();
      for (const p of lus) {
        const cle = cleNom(p.nom);
        if (dansLeFichier.has(cle)) { rapport.refusees.push({ ligne: p.numero, raison: `« ${p.nom} » apparaît déjà plus haut dans le fichier` }); continue; }
        dansLeFichier.add(cle);
        const deja = parNom.get(cle);
        if (deja !== undefined) { rapport.dejaLa.push({ ligne: p.numero, nom: p.nom, id: deja }); continue; }
        for (const message of p.avertissements) rapport.avertissements.push({ ligne: p.numero, message });
        const org = await ecrireProspect(tx, p, auteurId, maintenant);
        creees.push(org);
        rapport.aCreer.push({ ligne: p.numero, nom: p.nom, etape: LIBELLES[p.etape], type: TYPES_ORGANISATION[p.type] });
      }
      rapport.creees = essai ? 0 : creees.length;
      if (creees.length) await journaliser(tx, { type: "IMPORT_EXECUTE", auteurId, resume: `Import de prospects : ${resumeImportProspects({ ...rapport, creees: creees.length })}`,
        apres: { creees: creees.length, dejaLa: rapport.dejaLa.length, refusees: rapport.refusees.length } });
      if (essai) throw new AnnulationEssai(rapport);
    }, { timeout: 120_000, maxWait: 10_000 });
  } catch (erreur) {
    if (erreur instanceof AnnulationEssai) return erreur.rapport;
    throw erreur;
  }
  geocoderCentresDe(creees);
  return rapport;
}

async function ecrireProspect(tx: Prisma.TransactionClient, p: ProspectLu, auteurId: number, maintenant: Date): Promise<number> {
  const org = await tx.crmOrganisation.create({ data: {
    raisonSocialeNom: p.nom, type: p.type, etape: p.etape, etapeDepuisLe: maintenant, responsableId: auteurId,
    siteWeb: p.siteWeb, notes: p.notes, ris: p.ris, outilRdv: p.outilRdv,
    ...(p.echange ? { dernierEchangeLe: p.echange.le } : {}),
  } });
  await journaliser(tx, { type: "ORGANISATION_CREEE", organisationId: org.id, auteurId, resume: "Prospect importé",
    apres: { type: org.type, responsableId: auteurId, etape: org.etape } });
  if (p.centre) {
    await tx.crmCentre.create({ data: { organisationId: org.id, nom: p.nom, adresse: p.centre.adresse, codePostal: p.centre.codePostal, ville: p.centre.ville, ris: p.ris } });
  }
  let contactId: number | null = null;
  if (p.contact) {
    const c = await tx.crmContact.create({ data: { organisationId: org.id, principal: true, nom: p.contact.nom, fonction: p.contact.fonction,
      telephone: p.contact.telephone, email: p.contact.email, ...(p.echange ? { dernierContactLe: p.echange.le } : {}) } });
    contactId = c.id;
  }
  if (p.echange) {
    await tx.crmEchange.create({ data: { organisationId: org.id, contactId, type: p.echange.type, surveneuLe: p.echange.le, auteurId,
      compteRendu: "Dernier contact repris du fichier de prospection importé." } });
  }
  if (p.prestataire) await tx.crmPrestataire.create({ data: { organisationId: org.id, type: "Téléphonie", societe: p.prestataire, ordre: 0 } });
  return org.id;
}

/** Le modèle à remplir, en .xlsx : les en-têtes reconnus et une ligne d'exemple. */
export function modeleXlsx(): Buffer {
  const entetes = COLONNES_MODELE.map((c) => LIBELLES_CHAMPS[c]);
  const exemple = ["Centre d'imagerie Exemple", "Privé", "12 rue de la Gare, 56300 Pontivy", "www.exemple.fr", "Marie Martin", "Responsable des secrétaires",
    "02 97 00 00 00", "marie.martin@exemple.fr", "20/11/2026", "Appel", "Premiers échanges", "Intéressée par Talk, rappeler en janvier", "Xplore (EDL)", "Doctolib", "Orange"];
  const feuille = XLSX.utils.aoa_to_sheet([entetes, exemple]);
  feuille["!cols"] = entetes.map((e) => ({ wch: Math.max(14, e.length + 2) }));
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "Prospects");
  return XLSX.write(classeur, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
