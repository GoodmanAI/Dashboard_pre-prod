/**
 * Questionnaires remplis en ligne sur le lien de depot (lot B des documents
 * demandes). Plan : plans/2026-10-questionnaires-en-ligne.md (workspace).
 *
 * Un document demande peut porter un « formulaire » (colonne
 * "DocumentDemande"."formulaire") : les questions posees au patient, une par
 * etape, et pour chaque reponse l'endroit du PDF du centre ou l'ecrire. Le
 * patient repond sur la page, le serveur ecrit les reponses par-dessus le
 * modele (calque : le PDF du centre n'est pas modifie, aucun champ de
 * formulaire n'est cree) et range le resultat comme un depot.
 *
 * Coordonnees en points PDF, origine EN HAUT A GAUCHE de la page (celle de
 * PyMuPDF, qui sert a les relever) : `remplirPdf` les retourne pour pdf-lib.
 * Pour un texte, `y` est la ligne de base ; pour une case, le coin haut gauche.
 *
 * Le formulaire n'est valable que si "formulaireEmpreinte" vaut le sha256 du
 * modele en base : un modele remplace coupe le formulaire (retour au parcours
 * telecharger, remplir, redeposer).
 *
 * Ce fichier est partage avec la page du patient (format, conditions,
 * verification d'un champ) ; l'ecriture du PDF et la lecture en base sont
 * dans formulairesPdf.ts, cote serveur seulement.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

const placeTexte = z.object({
  page: z.number().int().min(1),
  x: z.number(),
  y: z.number(),
  /** Corps du texte, 10 par defaut. */
  taille: z.number().positive().max(24).optional(),
  /** Largeur disponible : le texte trop long est reduit, puis coupe. */
  largeur: z.number().positive().optional(),
});

const placeCase = z.object({
  page: z.number().int().min(1),
  x: z.number(),
  y: z.number(),
  /** Cote de la case, 8 par defaut. */
  taille: z.number().positive().max(30).optional(),
});

const placeCadre = z.object({
  page: z.number().int().min(1),
  x: z.number(),
  y: z.number(),
  largeur: z.number().positive(),
  hauteur: z.number().positive(),
});

const condition = z.object({
  champ: z.string(),
  valeurs: z.array(z.string()).min(1),
});

const base = {
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  libelle: z.string().min(1).max(300),
  aide: z.string().max(400).optional(),
  si: condition.optional(),
};

const champTexte = z.object({
  ...base,
  type: z.literal("texte"),
  requis: z.boolean().optional(),
  format: z.enum(["texte", "nombre", "mail", "telephone"]).optional(),
  /** Valeur proposee d'apres le lien (modifiable par le patient). */
  prerempli: z.enum(["nom", "prenom", "nom_prenom", "telephone"]).optional(),
  max: z.number().int().positive().max(200).optional(),
  /** Unite affichee a cote du champ (« kg », « cm »). */
  unite: z.string().max(10).optional(),
  place: placeTexte,
  /**
   * Adresse mail sur un modele qui imprime deja le « @ » : la partie avant va
   * a `place`, la partie apres a `arobase`.
   */
  arobase: placeTexte.optional(),
});

/** Soit une place pour « jj/mm/aaaa », soit trois places. */
const placesDate = {
  place: placeTexte.optional(),
  places: z
    .object({ jour: placeTexte, mois: placeTexte, annee: placeTexte })
    .optional(),
};

const champDate = z.object({
  ...base,
  type: z.literal("date"),
  requis: z.boolean().optional(),
  ...placesDate,
});

const option = z.object({
  valeur: z.string().regex(/^[a-z0-9_]{1,30}$/),
  libelle: z.string().min(1).max(200),
  place: placeCase.optional(),
  /** Libelle de l'alerte levee pour la secretaire si cette option est choisie. */
  alerte: z.string().max(160).optional(),
});

const champChoix = z.object({
  ...base,
  type: z.literal("choix"),
  requis: z.boolean().optional(),
  multiple: z.boolean().optional(),
  options: z.array(option).min(2).max(10),
});

/** Une case seule (« Je m'engage a… »). `requis` : elle doit etre cochee. */
const champCase = z.object({
  ...base,
  type: z.literal("case"),
  requis: z.boolean().optional(),
  place: placeCase,
});

const champSignature = z.object({
  ...base,
  type: z.literal("signature"),
  place: placeCadre,
});

/** Date du jour, ecrite sans question. */
const champDateDuJour = z.object({
  ...base,
  type: z.literal("dateDuJour"),
  ...placesDate,
});

const champ = z.discriminatedUnion("type", [
  champTexte,
  champDate,
  champChoix,
  champCase,
  champSignature,
  champDateDuJour,
]);

export const formulaireSchema = z
  .object({
    version: z.literal(1),
    /** Pour chaque page du modele : dimensions et rendu de fond (apercu). */
    pages: z
      .array(
        z.object({
          largeur: z.number().positive(),
          hauteur: z.number().positive(),
          /** data:image/jpeg;base64,... ou data:image/png;base64,... */
          fond: z.string().regex(/^data:image\/(jpeg|png);base64,/),
        })
      )
      .min(1)
      .max(10),
    etapes: z
      .array(
        z.object({
          titre: z.string().min(1).max(120),
          aide: z.string().max(400).optional(),
          champs: z.array(z.string()).min(1),
        })
      )
      .min(1)
      .max(20),
    champs: z.array(champ).min(1).max(120),
  })
  .superRefine((f, ctx) => {
    const ids = new Set<string>();
    for (const c of f.champs) {
      if (ids.has(c.id)) {
        ctx.addIssue({ code: "custom", message: `champ en double : ${c.id}` });
      }
      ids.add(c.id);
      if (c.si && !f.champs.some((x) => x.id === c.si!.champ)) {
        ctx.addIssue({ code: "custom", message: `${c.id} : condition sur un champ inconnu` });
      }
      for (const p of placesDe(c)) {
        if (p.page > f.pages.length) {
          ctx.addIssue({ code: "custom", message: `${c.id} : page ${p.page} absente` });
        }
      }
      if ((c.type === "date" || c.type === "dateDuJour") && !c.place && !c.places) {
        ctx.addIssue({ code: "custom", message: `${c.id} : date sans place` });
      }
    }
    const dansUneEtape = new Set(f.etapes.flatMap((e) => e.champs));
    for (const id of Array.from(dansUneEtape)) {
      if (!ids.has(id)) {
        ctx.addIssue({ code: "custom", message: `etape : champ inconnu ${id}` });
      }
    }
    // La signature et la date du jour ne sont pas des questions : la page
    // fait signer apres l'apercu, et la date s'ecrit seule.
    for (const c of f.champs) {
      const question = c.type !== "dateDuJour" && c.type !== "signature";
      if (question && !dansUneEtape.has(c.id)) {
        ctx.addIssue({ code: "custom", message: `${c.id} : dans aucune etape` });
      }
      if (!question && dansUneEtape.has(c.id)) {
        ctx.addIssue({ code: "custom", message: `${c.id} : pas une question` });
      }
    }
  });

export type Formulaire = z.infer<typeof formulaireSchema>;
export type Champ = Formulaire["champs"][number];

/** Une reponse : texte, date ISO (aaaa-mm-jj), option(s) choisie(s), case. */
export type Reponse = string | string[] | boolean;
export type Reponses = Record<string, Reponse>;

function placesDe(c: Champ): { page: number }[] {
  switch (c.type) {
    case "texte":
      return c.arobase ? [c.place, c.arobase] : [c.place];
    case "signature":
    case "case":
      return [c.place];
    case "date":
    case "dateDuJour":
      return [
        ...(c.place ? [c.place] : []),
        ...(c.places ? [c.places.jour, c.places.mois, c.places.annee] : []),
      ];
    case "choix":
      return c.options.flatMap((o) => (o.place ? [o.place] : []));
  }
}

// ---------------------------------------------------------------------------
// Ce que voit le patient
// ---------------------------------------------------------------------------

/**
 * Le formulaire sans les rendus de fond (servis a part, ils pesent). Les
 * places restent : la page dessine l'apercu avec les memes coordonnees que le
 * PDF.
 */
export function formulairePourLaPage(f: Formulaire) {
  return {
    ...f,
    pages: f.pages.map((p) => ({ largeur: p.largeur, hauteur: p.hauteur })),
  };
}

export type FormulairePage = ReturnType<typeof formulairePourLaPage>;

// ---------------------------------------------------------------------------
// Reponses
// ---------------------------------------------------------------------------

/** Le champ est-il pose, compte tenu des reponses deja donnees ? */
export function champVisible(
  f: Pick<Formulaire, "champs">,
  c: Champ,
  reponses: Reponses,
  profondeur = 0
): boolean {
  if (!c.si) return true;
  if (profondeur > 10) return false;
  const parent = f.champs.find((x) => x.id === c.si!.champ);
  if (!parent || !champVisible(f, parent, reponses, profondeur + 1)) return false;
  const r = reponses[c.si.champ];
  const valeurs = Array.isArray(r) ? r : typeof r === "string" ? [r] : r === true ? ["oui"] : [];
  return valeurs.some((v) => c.si!.valeurs.includes(v));
}

const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dateValide(v: string): boolean {
  const m = DATE_ISO.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return (
    d.getUTCFullYear() === +m[1] &&
    d.getUTCMonth() === +m[2] - 1 &&
    d.getUTCDate() === +m[3] &&
    +m[1] >= 1900 &&
    +m[1] <= 2100
  );
}

/**
 * Message d'erreur d'un champ visible, ou null. Partage par la page (avant
 * de passer a l'etape suivante) et par le serveur (avant d'ecrire le PDF).
 */
export function erreurDuChamp(c: Champ, r: Reponse | undefined): string | null {
  switch (c.type) {
    case "texte": {
      const v = typeof r === "string" ? r.trim() : "";
      if (!v) return c.requis ? "Répondez à cette question." : null;
      if (v.length > (c.max ?? 120)) return "Cette réponse est trop longue.";
      if (c.format === "nombre" && !/^\d{1,4}([.,]\d{1,2})?$/.test(v)) {
        return "Écrivez un nombre, sans unité.";
      }
      if (c.format === "mail" && !MAIL.test(v)) {
        return "Cette adresse mail n'est pas complète.";
      }
      if (c.format === "telephone" && v.replace(/\D/g, "").length < 10) {
        return "Ce numéro de téléphone n'est pas complet.";
      }
      return null;
    }
    case "date": {
      const v = typeof r === "string" ? r : "";
      if (!v) return c.requis ? "Indiquez la date." : null;
      return dateValide(v) ? null : "Cette date n'existe pas.";
    }
    case "choix": {
      const valeurs = Array.isArray(r) ? r : typeof r === "string" && r ? [r] : [];
      if (valeurs.length === 0) return c.requis ? "Choisissez une réponse." : null;
      const connues = c.options.map((o) => o.valeur);
      if (valeurs.some((v) => !connues.includes(v))) return "Choisissez une réponse.";
      if (!c.multiple && valeurs.length > 1) return "Choisissez une seule réponse.";
      return null;
    }
    case "case":
      return c.requis && r !== true ? "Cochez la case pour continuer." : null;
    case "signature":
    case "dateDuJour":
      return null;
  }
}

/**
 * Verifie les reponses et ne garde que celles des champs poses : une reponse
 * a une question devenue sans objet (« date et reference » d'un materiel
 * passe a non) n'est pas ecrite dans le PDF.
 */
export function verifierReponses(
  f: Formulaire,
  brutes: unknown
): { ok: true; reponses: Reponses } | { ok: false; erreurs: Record<string, string> } {
  const entree = (brutes && typeof brutes === "object" ? brutes : {}) as Record<string, unknown>;
  const lues: Reponses = {};
  for (const [k, v] of Object.entries(entree)) {
    if (typeof v === "string" || typeof v === "boolean") lues[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "string")) lues[k] = v as string[];
  }
  const reponses: Reponses = {};
  const erreurs: Record<string, string> = {};
  for (const c of f.champs) {
    if (c.type === "signature" || c.type === "dateDuJour") continue;
    if (!champVisible(f, c, lues)) continue;
    const r = lues[c.id];
    const e = erreurDuChamp(c, r);
    if (e) erreurs[c.id] = e;
    else if (r !== undefined) reponses[c.id] = typeof r === "string" ? r.trim() : r;
  }
  return Object.keys(erreurs).length > 0 ? { ok: false, erreurs } : { ok: true, reponses };
}

/** Libelles des alertes levees par les reponses (options marquees `alerte`). */
export function alertesDe(f: Formulaire, reponses: Reponses): string[] {
  const out: string[] = [];
  for (const c of f.champs) {
    if (c.type !== "choix") continue;
    const r = reponses[c.id];
    const valeurs = Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
    for (const o of c.options) {
      if (o.alerte && valeurs.includes(o.valeur)) out.push(o.alerte);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Format affiche et ecrit d'une date ISO : jj/mm/aaaa. */
export function dateFr(iso: string): string {
  const m = DATE_ISO.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Date du jour a Paris, en ISO. */
export function aujourdhuiIso(maintenant = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(maintenant);
}

// ---------------------------------------------------------------------------
// Ce qui s'ecrit sur la page
// ---------------------------------------------------------------------------

/**
 * Ce que les reponses ecrivent sur le modele, element par element. Une seule
 * source pour le PDF (`remplirPdf`) et pour l'apercu de la page : le patient
 * voit exactement ce qui partira.
 */
export type Element =
  | { sorte: "texte"; page: number; x: number; y: number; taille: number; largeur?: number; texte: string }
  | { sorte: "croix"; page: number; x: number; y: number; taille: number }
  | { sorte: "signature"; page: number; x: number; y: number; largeur: number; hauteur: number };

export function elementsAEcrire(
  f: Pick<Formulaire, "champs">,
  reponses: Reponses,
  aujourdhui: string
): Element[] {
  const out: Element[] = [];
  const texte = (
    t: string,
    p: { page: number; x: number; y: number; taille?: number; largeur?: number }
  ) => {
    if (t) out.push({ sorte: "texte", page: p.page, x: p.x, y: p.y, taille: p.taille ?? 10, largeur: p.largeur, texte: t });
  };
  const croix = (p: { page: number; x: number; y: number; taille?: number }) =>
    out.push({ sorte: "croix", page: p.page, x: p.x, y: p.y, taille: p.taille ?? 8 });
  const date = (
    iso: string,
    c: Extract<Champ, { type: "date" | "dateDuJour" }>
  ) => {
    if (c.places) {
      const [a, m, j] = iso.split("-");
      texte(j, c.places.jour);
      texte(m, c.places.mois);
      texte(a, c.places.annee);
    } else if (c.place) {
      texte(dateFr(iso), c.place);
    }
  };

  for (const c of f.champs) {
    if (c.type === "signature") {
      out.push({ sorte: "signature", ...c.place });
      continue;
    }
    if (c.type === "dateDuJour") {
      date(aujourdhui, c);
      continue;
    }
    if (!champVisible(f, c, reponses)) continue;
    const r = reponses[c.id];
    switch (c.type) {
      case "texte": {
        if (typeof r !== "string" || !r.trim()) break;
        const v = r.trim();
        const at = c.arobase ? v.lastIndexOf("@") : -1;
        if (c.arobase && at > 0) {
          texte(v.slice(0, at), c.place);
          texte(v.slice(at + 1), c.arobase);
        } else {
          texte(v, c.place);
        }
        break;
      }
      case "date":
        if (typeof r === "string" && r) date(r, c);
        break;
      case "choix": {
        const valeurs = Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
        for (const o of c.options) {
          if (o.place && valeurs.includes(o.valeur)) croix(o.place);
        }
        break;
      }
      case "case":
        if (r === true) croix(c.place);
        break;
    }
  }
  return out;
}
