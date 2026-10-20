/**
 * Questionnaires remplis en ligne, cote serveur : lecture du formulaire valable
 * d'un document, signature recue, ecriture des reponses dans le PDF du centre.
 * Format et regles partagees avec la page : formulaires.ts.
 * Plan : plans/2026-10-questionnaires-en-ligne.md (workspace).
 */

import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "@/lib/db";
import {
  aujourdhuiIso,
  elementsAEcrire,
  formulaireSchema,
  type Formulaire,
  type Reponses,
} from "@/lib/formulaires";

/** sha256 hex d'un modele, compare a "formulaireEmpreinte". */
export function empreinteModele(modele: Uint8Array): string {
  return createHash("sha256").update(modele).digest("hex");
}

/**
 * Le formulaire du document demande vise par une piece d'un lien, s'il est
 * valable : prepare, lisible, et prepare sur le modele actuellement en base.
 * Sinon null (parcours telecharger, remplir, redeposer).
 */
export async function formulaireDeLaPiece(
  uploadId: number,
  pieceId: number
): Promise<{ formulaire: Formulaire; modele: Buffer; libelle: string } | null> {
  const res = await db.query<{
    libelle: string;
    formulaire: unknown;
    formulaireEmpreinte: string | null;
    modeleContenu: Buffer | null;
  }>(
    `SELECT p."libelle", dd."formulaire", dd."formulaireEmpreinte", dd."modeleContenu"
       FROM "PieceAttendue" p
       JOIN "DocumentDemande" dd ON dd."id" = p."documentDemandeId"
      WHERE p."uploadId" = $1
        AND p."id" = $2
      LIMIT 1`,
    [uploadId, pieceId]
  );
  const row = res.rows[0];
  if (!row?.formulaire || !row.modeleContenu || !row.formulaireEmpreinte) return null;
  if (empreinteModele(row.modeleContenu) !== row.formulaireEmpreinte) return null;
  const lu = formulaireSchema.safeParse(row.formulaire);
  if (!lu.success) {
    console.error("[formulaires] formulaire illisible pour la piece", pieceId, lu.error.issues[0]);
    return null;
  }
  return { formulaire: lu.data, modele: row.modeleContenu, libelle: row.libelle };
}


// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

/** 300 Ko au plus : un trace au doigt pese quelques Ko. */
export const MAX_SIGNATURE_OCTETS = 300 * 1024;

/** PNG d'une signature envoyee en data URL, ou null si absente ou invalide. */
export function lireSignature(dataUrl: unknown): Buffer | null {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[1], "base64");
  if (buf.length < 100 || buf.length > MAX_SIGNATURE_OCTETS) return null;
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return png.every((b, i) => buf[i] === b) ? buf : null;
}

// ---------------------------------------------------------------------------
// Ecriture du PDF
// ---------------------------------------------------------------------------

const ENCRE = rgb(0.05, 0.13, 0.45);

/**
 * Les polices standard du PDF ne savent ecrire que le jeu WinAnsi : un
 * caractere hors de ce jeu (emoji, autre alphabet) ferait echouer l'ecriture.
 * On le remplace par son equivalent sans accent, ou par « ? ».
 */
function ecrivable(police: PDFFont, texte: string): string {
  let out = "";
  for (const ch of Array.from(texte.replace(/\s+/g, " "))) {
    try {
      police.encodeText(ch);
      out += ch;
    } catch {
      const simple = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      try {
        police.encodeText(simple);
        out += simple;
      } catch {
        out += "?";
      }
    }
  }
  return out;
}

function ecrire(
  page: PDFPage,
  police: PDFFont,
  texte: string,
  place: { x: number; y: number; taille?: number; largeur?: number }
) {
  let t = ecrivable(police, texte);
  let taille = place.taille ?? 10;
  if (place.largeur) {
    while (taille > 6 && police.widthOfTextAtSize(t, taille) > place.largeur) taille -= 0.5;
    while (t.length > 1 && police.widthOfTextAtSize(t, taille) > place.largeur) {
      t = t.slice(0, -2) + "…";
    }
  }
  page.drawText(t, {
    x: place.x,
    y: page.getHeight() - place.y,
    size: taille,
    font: police,
    color: ENCRE,
  });
}

function cocher(page: PDFPage, place: { x: number; y: number; taille?: number }) {
  const c = place.taille ?? 8;
  const marge = c * 0.15;
  const h = page.getHeight();
  const x0 = place.x + marge;
  const x1 = place.x + c - marge;
  const y0 = h - place.y - marge;
  const y1 = h - place.y - c + marge;
  const epaisseur = Math.max(1, c / 8);
  page.drawLine({ start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thickness: epaisseur, color: ENCRE });
  page.drawLine({ start: { x: x0, y: y1 }, end: { x: x1, y: y0 }, thickness: epaisseur, color: ENCRE });
}

/**
 * Ecrit les reponses (deja verifiees) dans le modele et rend le PDF.
 * `signature` : PNG du trace, ou null (le cadre reste vide). Les elements
 * viennent de `elementsAEcrire`, comme l'apercu de la page.
 */
export async function remplirPdf(
  modele: Uint8Array,
  f: Formulaire,
  reponses: Reponses,
  signature: Buffer | null,
  maintenant = new Date()
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(modele, { ignoreEncryption: true });
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const page = (n: number) => pages[Math.min(n, pages.length) - 1];
  const image = signature ? await doc.embedPng(signature) : null;

  for (const e of elementsAEcrire(f, reponses, aujourdhuiIso(maintenant))) {
    const p = page(e.page);
    switch (e.sorte) {
      case "texte":
        ecrire(p, police, e.texte, e);
        break;
      case "croix":
        cocher(p, e);
        break;
      case "signature":
        if (image) {
          const echelle = Math.min(e.largeur / image.width, e.hauteur / image.height);
          const l = image.width * echelle;
          const h = image.height * echelle;
          p.drawImage(image, { x: e.x, y: p.getHeight() - e.y - h, width: l, height: h });
        }
        break;
    }
  }

  doc.setProducer("Lyrae");
  doc.setModificationDate(maintenant);
  return doc.save();
}
