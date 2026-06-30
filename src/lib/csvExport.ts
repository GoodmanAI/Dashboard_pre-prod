/**
 * Helpers d'export CSV — utilitaires purs, aucune dépendance externe.
 *
 * Convention : on génère un CSV "Excel-friendly" :
 *  - BOM UTF-8 en tête (sinon Excel casse les accents)
 *  - Séparateur `;` (préféré sur Excel FR — ',' casse parfois)
 *  - Fin de ligne CRLF (\r\n)
 *  - Valeurs quotées si elles contiennent `;`, `"`, ou un saut de ligne
 */

/** Échappe une valeur pour insertion dans une cellule CSV. */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Si la valeur contient un séparateur, un guillemet ou un saut de ligne,
  // on entoure de guillemets et on double les guillemets internes.
  if (/[;"\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Convertit un array 2D en string CSV (lignes vides autorisées pour séparer sections). */
export function rowsToCsv(rows: Array<Array<unknown> | null>): string {
  const lines: string[] = [];
  for (const row of rows) {
    if (row === null) {
      lines.push(""); // ligne vide = séparateur de section
      continue;
    }
    lines.push(row.map(escapeCsvCell).join(";"));
  }
  return lines.join("\r\n");
}

/**
 * Déclenche le téléchargement d'un CSV côté navigateur.
 * - Préfixe BOM UTF-8 pour qu'Excel respecte les accents et caractères spéciaux.
 * - Auto-nettoyage de l'URL blob après clic.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  // ﻿ = BOM UTF-8 (sinon Excel ouvre en Windows-1252 et casse "é/à/…")
  const blob = new Blob(["﻿" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Libère la mémoire du blob après un léger délai (le clic doit avoir été pris en compte).
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/** Format date locale FR court pour les noms de fichiers : "2025-05-18". */
export function isoDateForFilename(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format date FR lisible pour l'affichage dans le CSV : "18/05/2025". */
export function formatDateFr(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
