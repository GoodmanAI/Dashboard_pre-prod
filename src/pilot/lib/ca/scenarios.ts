import type { z } from "zod";
import { Prisma } from "@prisma/client";
import { creationScenario, modificationScenario } from "@/pilot/lib/validation/scenario";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { compter } from "@/pilot/lib/texte";
import { signatureChoix } from "./etat";

const selection = { id: true, nom: true, majLe: true, opportunites: { select: {
  opportuniteId: true, cochee: true, demarrageDecaleLe: true,
}, orderBy: { opportuniteId: "asc" as const } } };
const conflit = () => new ErreurMetier("Ce scénario vient de changer. Rechargez la page.", 409);
type Contenu = z.output<typeof creationScenario>;
async function verifierContenu(tx: Prisma.TransactionClient, p: Contenu, id?: number) {
  // Sérialise les écritures portant le même nom avant la garde d'unicité.
  // Un doublon attendu ne provoque ainsi aucune erreur Prisma contenant du texte libre.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7419, hashtext(${p.nom}))`;
  if (await tx.crmScenario.findFirst({ where: { nom: p.nom, ...(id ? { id: { not: id } } : {}) }, select: { id: true } })) {
    throw new ErreurMetier("Un scénario porte déjà ce nom.", 409);
  }
  const ids = p.opportunites.map((o) => o.opportuniteId);
  if (ids.length) {
    // Le verrou partagé empêche une conclusion entre la garde et l'enregistrement.
    const ouvertes = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM "CrmOpportunite" WHERE id IN (${Prisma.join(ids)})
      AND "gagneeLe" IS NULL AND "perdueLe" IS NULL ORDER BY id FOR SHARE`);
    if (ouvertes.length !== ids.length) throw new ErreurMetier("Une opportunité est inconnue ou déjà conclue. Rechargez la page.", 400);
  }
}
async function tracer(tx: Prisma.TransactionClient, id: number, p: Contenu, auteurId: number) {
  const cochees = p.opportunites.filter((o) => o.cochee).length;
  const decalees = p.opportunites.filter((o) => o.demarrageDecaleLe !== null).length;
  await journaliser(tx, { type: "SCENARIO_ENREGISTRE", auteurId,
    resume: `Scénario enregistré : ${compter(cochees, "opportunité cochée", "opportunités cochées")} sur ${p.opportunites.length}`,
    apres: { scenarioId: id, cochees, decalees } });
}
export async function creerScenario(champs: Contenu, auteurId: number) {
  // Le service est aussi appelé par le seed : mêmes validations que l'API.
  const p = creationScenario.parse(JSON.parse(JSON.stringify(champs)));
  return transactionJournalisee(async (tx) => {
    await verifierContenu(tx, p);
    const scenario = await tx.crmScenario.create({ data: { nom: p.nom, notes: p.notes, auteurId,
      opportunites: { create: p.opportunites } }, select: selection });
    await tracer(tx, scenario.id, p, auteurId);
    return scenario;
  });
}
export async function modifierScenario(id: number, champs: z.output<typeof modificationScenario>, auteurId: number) {
  const p = modificationScenario.parse(JSON.parse(JSON.stringify(champs)));
  return transactionJournalisee(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CrmScenario" WHERE id = ${id} FOR UPDATE`;
    const actuel = await tx.crmScenario.findUnique({ where: { id }, select: { ...selection, notes: true } });
    if (!actuel) throw new ErreurMetier("Scénario inconnu.", 404);
    if (+actuel.majLe !== +p.majLe) throw conflit();
    await verifierContenu(tx, p, id);
    const signature = (lignes: Contenu["opportunites"]) => signatureChoix(lignes.map((o) => ({ ...o, demarrageDecaleLe: o.demarrageDecaleLe?.toISOString() ?? null })));
    const notes = p.notes === undefined ? actuel.notes : p.notes;
    if (actuel.nom === p.nom && actuel.notes === notes && signature(actuel.opportunites) === signature(p.opportunites)) {
      const { notes: privees, ...scenario } = actuel; void privees;
      return scenario;
    }
    const resultat = await tx.crmScenario.updateMany({ where: { id, majLe: p.majLe },
      data: { nom: p.nom, notes, majLe: new Date(Math.max(Date.now(), +actuel.majLe + 1)) } });
    if (!resultat.count) throw conflit();
    await tx.crmScenarioOpportunite.deleteMany({ where: { scenarioId: id } });
    if (p.opportunites.length) await tx.crmScenarioOpportunite.createMany({ data: p.opportunites.map((o) => ({ ...o, scenarioId: id })) });
    await tracer(tx, id, p, auteurId);
    return tx.crmScenario.findUniqueOrThrow({ where: { id }, select: selection });
  });
}
