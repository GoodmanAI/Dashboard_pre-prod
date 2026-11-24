import { transactionJournalisee, journaliser } from "@/pilot/lib/evenements/journaliser";
import { instantSql } from "@/pilot/lib/datesSql";
import { compter } from "@/pilot/lib/texte";
import { selectionnerFormationsARattraper, type FormationPourRattrapage } from "@/pilot/lib/facturation/rattrapage";
import { VERROU_FIGER } from "./figer";
import { decalerMois } from "./projeter";
import { moisIso } from "./reel";

/**
 * Après l'arrêté mensuel : seules les formations anciennes connues sont reprises.
 * Deux lectures SQL fixes (verrou commun et sélection), puis écritures groupées.
 * Aucune relecture des contrats ou compteurs des vieux mois. Seules les clés
 * réellement insérées par RETURNING autorisent un marqueur et un événement.
 */
export async function rattraperFormations(maintenant: Date) {
  return transactionJournalisee(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${VERROU_FIGER}::integer, 0::integer)`;
    const formations = await tx.$queryRaw<FormationPourRattrapage[]>`SELECT f."organisationId", f."debuteLe", f."montantCentimes", f."comptabiliseeLe",
      EXISTS(SELECT 1 FROM "CrmCaMensuel" m WHERE m.cle = to_char(f."debuteLe", 'YYYY-MM') || '|' || f."organisationId"::text || '|0|0') AS "cleExiste"
      FROM "CrmFormationPoc" f WHERE f."comptabiliseeLe" IS NULL AND f."montantCentimes" IS NOT NULL
        AND f."debuteLe" < ${instantSql(decalerMois(maintenant, 0))}
      ORDER BY f."debuteLe", f."organisationId"`;
    const aInserer = selectionnerFormationsARattraper(formations, maintenant);
    if (!aInserer.length) return { ecrites: 0 };
    const inserees = await tx.crmCaMensuel.createManyAndReturn({
      data: aInserer.map(({ montantCentimes, ...f }) => ({ ...f, miseEnServiceCentimes: montantCentimes, figeLe: maintenant })),
      skipDuplicates: true, select: { organisationId: true, miseEnServiceCentimes: true },
    });
    if (!inserees.length) return { ecrites: 0 };
    const organisationsInserees = new Set(inserees.map((f) => f.organisationId));
    await tx.crmFormationPoc.updateMany({ where: { organisationId: { in: [...organisationsInserees] }, comptabiliseeLe: null }, data: { comptabiliseeLe: maintenant } });
    await journaliser(tx, { type: "CA_MENSUEL_FIGE", auteurId: null,
      resume: `Formations ajoutées au réel : ${compter(inserees.length, "formation")}`,
      apres: { formations: inserees.length, totalCentimes: inserees.reduce((s, f) => s + f.miseEnServiceCentimes, 0),
        mois: [...new Set(aInserer.filter((f) => organisationsInserees.has(f.organisationId)).map((f) => moisIso(f.mois)))] } });
    return { ecrites: inserees.length };
  }, { timeout: 120000 });
}
