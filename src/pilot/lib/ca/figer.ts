import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { compter } from "@/pilot/lib/texte";
import { chargerEntreesReel } from "./entreesReel";
import { decalerMois } from "./projeter";
import { cleCa, moisIso, reelDuMois, totalLigne } from "./reel";

/** Même verrou pour l'arrêté et le rattrapage, afin qu'ils ne se dépassent pas. */
export const VERROU_FIGER = 72105;

/** « Mois d'octobre 2026 », « Mois de mai 2026 ». */
export function libelleMois(mois: Date): string {
  const nom = mois.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  return `Mois ${/^[aeiouy]/i.test(nom) ? "d'" : "de "}${nom}`;
}

/**
 * Fige le réel d'un mois terminé dans CrmCaMensuel (C-16, §8.9). Une clé déjà
 * figée n'est jamais réécrite, en silence : rejouer ne fait rien, sans
 * événement. `figeLe = maintenant`.
 */
export async function figerMois(moisDemande: Date, maintenant: Date) {
  const mois = decalerMois(moisDemande, 0);
  if (!Number.isFinite(+mois) || decalerMois(mois, 1) > maintenant) throw new ErreurMetier("Seul un mois terminé se fige.", 400);
  const libelle = libelleMois(mois);
  const entrees = await chargerEntreesReel({ mois, finCompteurs: decalerMois(mois, 1) });
  const { lignes } = reelDuMois(entrees);
  if (!lignes.length) return { ecrites: 0, dejaFigees: 0, message: `${libelle} : aucune ligne à figer` };
  return transactionJournalisee(async (tx) => {
    // Un arrêté et un rattrapage se suivent, y compris s'ils traitent plusieurs mois.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${VERROU_FIGER}::integer, 0::integer)`;
    const existantes = new Set((await tx.crmCaMensuel.findMany({ where: { mois }, select: { cle: true } })).map((l) => l.cle));
    const nouvelles = lignes.filter((l) => !existantes.has(l.cle));
    const { count: ecrites } = nouvelles.length
      ? await tx.crmCaMensuel.createMany({ data: nouvelles.map((l) => ({ ...l, figeLe: maintenant })), skipDuplicates: true })
      : { count: 0 };
    const dejaFigees = lignes.length - ecrites;
    // Marqueur écrit uniquement avec une nouvelle clé incluant cette formation.
    const formationsIncluses = entrees.formations.filter((f) => f.montantCentimes !== null && !existantes.has(cleCa(mois, f.organisationId, null, null)));
    if (formationsIncluses.length) await tx.crmFormationPoc.updateMany({
      where: { organisationId: { in: formationsIncluses.map((f) => f.organisationId) }, comptabiliseeLe: null }, data: { comptabiliseeLe: maintenant } });
    if (!ecrites) return { ecrites, dejaFigees, message: `${libelle} déjà figé, rien à écrire` };
    const resume = `${libelle} figé : ${compter(ecrites, "ligne")}`;
    await journaliser(tx, { type: "CA_MENSUEL_FIGE", auteurId: null, resume,
      apres: { mois: moisIso(mois), lignes: ecrites, totalCentimes: nouvelles.reduce((s, l) => s + totalLigne(l), 0) } });
    return { ecrites, dejaFigees, message: resume };
  }, { timeout: 120000 });
}
