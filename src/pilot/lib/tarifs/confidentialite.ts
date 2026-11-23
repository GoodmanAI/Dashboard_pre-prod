import { exiger, peutVoirCa, type Acteur } from "@/pilot/lib/autorisations";
import { prisma } from "@/pilot/lib/prisma";

/** C-95 uniquement. Les anciens tarifs restent régis par C-64. */
export function grillePourActeur<T extends { tarifs: Array<{ code: string }> }>(g: T, acteur: Acteur): T {
  return { ...g, tarifs: g.tarifs.filter((t) => t.code !== "FORMATION_POC" || peutVoirCa(acteur)) };
}
export async function exigerTarifVisible(tarifId: number, acteur: Acteur) {
  if (peutVoirCa(acteur)) return;
  const t = await prisma.crmTarif.findUnique({ where: { id: tarifId }, select: { code: true } });
  exiger(t?.code !== "FORMATION_POC");
}
