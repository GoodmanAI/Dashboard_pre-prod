/**
 * L'export PDF d'une transcription d'appel, pour la liste des appels et les incidents.
 * -----------------------------------------------------------------------------
 * Il était recopié dans les deux écrans, et devinait le locuteur à la parité de l'index
 * après avoir retiré les WaitSound : un « Lyrae » sur deux était en réalité le patient
 * dès que deux phrases de Lyrae se suivaient. Le locuteur vient maintenant du préfixe de
 * la ligne (`lireTour`), comme à l'écran.
 */

import { lireTour } from "@/lib/entitesTranscription";

/** Formate un numéro français pour affichage : `+33 6 12 34 56 78` ou `06 12 34 56 78`. */
export function formatPhoneFR(p?: string | null): string {
  if (!p) return "-";
  const digits = p.replace(/\s/g, "");
  if (digits.startsWith("+33") && digits.length === 12) {
    return `+33 ${digits[3]} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
  }
  return p;
}

// jsPDF ne lit pas les variables CSS : `var(--accent-deep)` laissait le nom en noir.
const COULEUR_LYRAE = "#2a6f64";
const COULEUR_PATIENT = "#374151";

/**
 * Génère et télécharge le PDF. `call.steps` est pris tel que stocké, WaitSound compris :
 * ils sont écartés ici, sur leur préfixe.
 */
export async function exporterTranscriptionPdf(
  call: any,
  { titre, prefixeFichier }: { titre: string; prefixeFichier: string }
) {
  // Import dynamique : évite d'embarquer jsPDF dans le bundle initial
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - 2 * margin;

  let y = margin;

  // ── Titre
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#1f2937");
  doc.text(titre, margin, y);
  y += 28;

  // ── Métadonnées
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#374151");

  const date = new Date(call.createdAt);
  const dateStr = date.toLocaleDateString("fr-FR");
  const timeStr = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const phone = formatPhoneFR(call.stats?.phoneNumber);

  const metas: string[] = [`Date : ${dateStr} à ${timeStr}`, `Numéro appelant : ${phone}`];
  if (call.stats?.rdv_status) metas.push(`Statut RDV : ${call.stats.rdv_status}`);
  if (call.stats?.transferReason) metas.push(`Motif transfert : ${call.stats.transferReason}`);
  if (call.stats?.duration) metas.push(`Durée : ${call.stats.duration}s`);

  metas.forEach((line) => {
    doc.text(line, margin, y);
    y += 14;
  });

  // ── Séparateur
  y += 8;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // ── Conversation
  const steps: any[] = Array.isArray(call.steps) ? call.steps : Object.values(call.steps ?? {});
  doc.setFontSize(11);
  steps.forEach((brut, i) => {
    const tour = lireTour(brut, i);
    if (tour.locuteur === "WaitSound" || !tour.texte) return;
    const lyrae = tour.locuteur === "Lyrae";

    const wrapped = doc.splitTextToSize(tour.texte, contentWidth - 12);
    const blockHeight = 16 + wrapped.length * 14 + 6;

    // Saut de page si plus de place
    if (y + blockHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }

    // Locuteur, et l'heure quand la ligne la porte
    doc.setFont("helvetica", "bold");
    doc.setTextColor(lyrae ? COULEUR_LYRAE : COULEUR_PATIENT);
    doc.text(`${lyrae ? "Lyrae" : "Patient"}${tour.heure ? ` (${tour.heure})` : ""} :`, margin, y);
    y += 14;

    // Texte
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#1f2937");
    doc.text(wrapped, margin + 12, y);
    y += wrapped.length * 14 + 10;
  });

  // ── Pied de page sur chaque page : numéro de page + horodatage
  const pageCount = (doc as any).internal.getNumberOfPages?.() ?? 1;
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#9ca3af");
    doc.text(`Page ${p}/${pageCount}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    doc.text(`Exporté le ${new Date().toLocaleString("fr-FR")}`, margin, pageHeight - 20);
  }

  const fileDate = date.toISOString().slice(0, 10);
  doc.save(`${prefixeFichier}-${call.id}-${fileDate}.pdf`);
}
