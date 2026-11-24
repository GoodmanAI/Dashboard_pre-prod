import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ charger: vi.fn(), tx: { $queryRaw: vi.fn(), crmCaMensuel: { findMany: vi.fn(), createMany: vi.fn() }, crmFormationPoc: { updateMany: vi.fn() } }, journal: vi.fn() }));
vi.mock("@/pilot/lib/ca/entreesReel", () => ({ chargerEntreesReel: m.charger }));
vi.mock("@/pilot/lib/evenements/journaliser", () => ({ transactionJournalisee: (f: (tx: unknown) => unknown) => f(m.tx), journaliser: m.journal }));
import { figerMois } from "@/pilot/lib/ca/figer";
const mois = new Date("2026-10-01T00:00:00Z"), maintenant = new Date("2026-11-22T00:00:00Z");
beforeEach(() => {
  vi.clearAllMocks();
  m.tx.crmCaMensuel.findMany.mockResolvedValue([]);
  m.tx.crmCaMensuel.createMany.mockResolvedValue({ count: 1 });
  m.charger.mockResolvedValue({ mois, contrats: [], formations: [{ organisationId: 1, debuteLe: mois, montantCentimes: 12345 }], rattachements: [], usage: new Map() });
});
it("une nouvelle clé inclut la formation et enregistre sa comptabilisation dans la transaction", async () => {
  expect((await figerMois(mois, maintenant)).ecrites).toBe(1);
  expect(m.tx.crmCaMensuel.createMany.mock.calls[0][0].data[0]).toMatchObject({ cle: "2026-10|1|0|0", miseEnServiceCentimes: 12345 });
  expect(m.tx.crmFormationPoc.updateMany).toHaveBeenCalledWith({ where: { organisationId: { in: [1] }, comptabiliseeLe: null }, data: { comptabiliseeLe: maintenant } });
});
it("clé déjà figée : ni réécriture, ni marqueur, ni événement, même après complétion tardive", async () => {
  const ancienne = { cle: "2026-10|1|0|0", miseEnServiceCentimes: 20000 };
  m.tx.crmCaMensuel.findMany.mockResolvedValue([ancienne]);
  expect((await figerMois(mois, maintenant)).ecrites).toBe(0);
  expect(ancienne.miseEnServiceCentimes).toBe(20000);
  expect(m.tx.crmCaMensuel.createMany).not.toHaveBeenCalled();
  expect(m.tx.crmFormationPoc.updateMany).not.toHaveBeenCalled();
  expect(m.journal).not.toHaveBeenCalled();
});
it("prix manquant : ne crée aucune clé ni marqueur", async () => {
  m.charger.mockResolvedValue({ mois, contrats: [], formations: [{ organisationId: 1, debuteLe: mois, montantCentimes: null }], rattachements: [], usage: new Map() });
  expect((await figerMois(mois, maintenant)).ecrites).toBe(0);
  expect(m.tx.crmFormationPoc.updateMany).not.toHaveBeenCalled();
});
