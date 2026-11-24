import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tx: { $queryRaw: vi.fn(), crmCaMensuel: { createManyAndReturn: vi.fn() }, crmFormationPoc: { updateMany: vi.fn() } }, journal: vi.fn() }));
vi.mock("@/pilot/lib/evenements/journaliser", () => ({ transactionJournalisee: (f: (tx: unknown) => unknown) => f(m.tx), journaliser: m.journal }));
import { rattraperFormations } from "@/pilot/lib/ca/rattraperFormations";
const maintenant = new Date("2027-01-10T00:00:00Z");
const formation = { organisationId: 1, debuteLe: new Date("2026-10-15T00:00:00Z"), montantCentimes: 12345, comptabiliseeLe: null, cleExiste: false };
beforeEach(() => {
  vi.clearAllMocks();
  m.tx.$queryRaw.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([formation]);
  m.tx.crmCaMensuel.createManyAndReturn.mockResolvedValue([{ organisationId: 1, miseEnServiceCentimes: 12345 }]);
});
it("insère uniquement la formation du vieux mois et marque les seules insertions confirmées", async () => {
  expect(await rattraperFormations(maintenant)).toEqual({ ecrites: 1 });
  const p = m.tx.crmCaMensuel.createManyAndReturn.mock.calls[0][0];
  expect(p.data).toEqual([{ cle: "2026-10|1|0|0", mois: new Date("2026-10-01T00:00:00Z"), organisationId: 1, miseEnServiceCentimes: 12345, figeLe: maintenant }]);
  expect(p.skipDuplicates).toBe(true);
  expect(m.tx.crmFormationPoc.updateMany).toHaveBeenCalledWith({ where: { organisationId: { in: [1] }, comptabiliseeLe: null }, data: { comptabiliseeLe: maintenant } });
  expect(m.journal.mock.calls[0][1]).toMatchObject({ type: "CA_MENSUEL_FIGE", resume: "Formations ajoutées au réel : 1 formation", apres: { formations: 1, totalCentimes: 12345 } });
});
it("rejeu ou clé existante : aucune écriture ni journal", async () => {
  m.tx.$queryRaw.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...formation, cleExiste: true }]);
  expect(await rattraperFormations(maintenant)).toEqual({ ecrites: 0 });
  expect(m.tx.crmCaMensuel.createManyAndReturn).not.toHaveBeenCalled();
  expect(m.tx.crmFormationPoc.updateMany).not.toHaveBeenCalled();
  expect(m.journal).not.toHaveBeenCalled();
});
it("une insertion ignorée ne pose pas de marqueur et ne journalise rien", async () => {
  m.tx.crmCaMensuel.createManyAndReturn.mockResolvedValue([]);
  expect(await rattraperFormations(maintenant)).toEqual({ ecrites: 0 });
  expect(m.tx.crmFormationPoc.updateMany).not.toHaveBeenCalled();
  expect(m.journal).not.toHaveBeenCalled();
});
