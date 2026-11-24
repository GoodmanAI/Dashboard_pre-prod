import { ErreurMetier } from "@/pilot/lib/erreurs";
import { LIBELLES_UNITE } from "@/pilot/lib/propositions/regles";
import { decalerMois } from "./projeter";
import { moisIso, totalLigne, type Unite } from "./reel";

/**
 * Export comptable depuis CrmCaMensuel, au format attendu par une comptabilité
 * française : UTF-8 avec BOM, `;`, virgule décimale, CRLF.
 *
 * Tant que le modèle tarifaire n'est pas tranché (question ouverte Q1, C-21),
 * le fichier commence par un avertissement. C'est le seul endroit à changer.
 */
export const MODELE_TARIFAIRE_VALIDE = false;
export const AVERTISSEMENT_EXPORT = "Modèle tarifaire à valider : ne pas facturer sur cette base sans accord.";
export const EN_TETE_EXPORT = ["mois", "organisation", "produit", "centre", "recurrent", "variable", "mise_en_service", "total", "volume", "unite"];
export const MOIS_EXPORT_MAXIMUM = 36;
/**
 * Le produit d'une ligne du réel sans produit du catalogue (lot S) : une
 * prestation, le connecteur RIS. Plusieurs lignes hors catalogue d'un même
 * centre partagent une clé : leur libellé n'est pas dans CrmCaMensuel.
 */
export const PRODUIT_HORS_CATALOGUE = "Hors catalogue";

/** Centimes entiers vers « 1234,56 », sans passer par un flottant. */
export function eurosCsv(centimes: number): string {
  if (!Number.isSafeInteger(centimes)) throw new Error("Montant hors des entiers sûrs.");
  const chiffres = String(Math.abs(centimes)).padStart(3, "0");
  return `${centimes < 0 ? "-" : ""}${chiffres.slice(0, -2)},${chiffres.slice(-2)}`;
}
/**
 * Un champ texte, toujours entre guillemets, `"` doublé. Une valeur qui
 * commence par `=`, `+`, `-`, `@` (ou une tabulation, un retour chariot) serait
 * lue comme une formule par un tableur : elle est préfixée d'une apostrophe.
 */
export function texteCsv(valeur: string | null): string {
  const texte = valeur ?? "";
  const neutre = /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
  return `"${neutre.replace(/"/g, '""')}"`;
}

const FORMAT_MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;
/** Valide `de` et `a` (AAAA-MM), bornes comprises, 36 mois au plus. 400 sinon. */
export function periodeExport(p: { de: unknown; a: unknown }): { de: Date; a: Date; finExclue: Date; nbMois: number } {
  const lire = (valeur: unknown) => {
    const m = typeof valeur === "string" ? FORMAT_MOIS.exec(valeur) : null;
    return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : null;
  };
  const de = lire(p.de), a = lire(p.a);
  if (!de || !a) throw new ErreurMetier("Période invalide : mois au format AAAA-MM attendus.", 400);
  if (de > a) throw new ErreurMetier("Période invalide : le premier mois suit le dernier.", 400);
  const nbMois = (a.getUTCFullYear() - de.getUTCFullYear()) * 12 + a.getUTCMonth() - de.getUTCMonth() + 1;
  if (nbMois > MOIS_EXPORT_MAXIMUM) throw new ErreurMetier(`Période trop longue : ${MOIS_EXPORT_MAXIMUM} mois au plus.`, 400);
  return { de, a, finExclue: decalerMois(a, 1), nbMois };
}
export function nomFichierExport(de: Date, a: Date): string {
  return `pilot-ca-${moisIso(de)}-${moisIso(a)}.csv`;
}

export type LigneExport = {
  /** null : ligne sans produit (lot S), écrite « Hors catalogue ». */
  mois: Date; organisation: string; produit: string | null; centre: string | null;
  /** `miseEnServiceCentimes` : ce qui se facture une fois, installations et prestations (lot S). */
  recurrentCentimes: number; variableCentimes: number; miseEnServiceCentimes: number;
  volumeVariable: number | null; uniteVariable: Unite | null;
};
export function construireCsv(lignes: LigneExport[], modeleValide = MODELE_TARIFAIRE_VALIDE): string {
  const sortie = [
    ...(modeleValide ? [] : [texteCsv(AVERTISSEMENT_EXPORT)]),
    EN_TETE_EXPORT.join(";"),
    ...lignes.map((l) => [
      texteCsv(moisIso(l.mois)), texteCsv(l.organisation), texteCsv(l.produit ?? PRODUIT_HORS_CATALOGUE), texteCsv(l.centre),
      eurosCsv(l.recurrentCentimes), eurosCsv(l.variableCentimes), eurosCsv(l.miseEnServiceCentimes), eurosCsv(totalLigne(l)),
      l.volumeVariable === null ? "" : String(l.volumeVariable),
      texteCsv(l.uniteVariable === null ? null : LIBELLES_UNITE[l.uniteVariable]),
    ].join(";")),
  ];
  return "﻿" + sortie.map((ligne) => ligne + "\r\n").join("");
}
