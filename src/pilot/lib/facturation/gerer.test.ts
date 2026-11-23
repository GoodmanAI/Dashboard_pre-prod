import { beforeEach, describe, expect, it, vi } from "vitest";
import { droitsEffectifs } from "@/pilot/lib/acces/droits";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }));
vi.mock("@/pilot/lib/evenements/journaliser", () => ({ transactionJournalisee: mocks.transaction, journaliser: vi.fn() }));
vi.mock("@/pilot/lib/prisma", () => ({ prisma: { $queryRaw: mocks.query } }));
import { assurerFormationPoc, modifierFormationPoc, refusModificationFormation } from "./gerer";
import { chargerFacturation } from "./charger";
const d = (s: string) => new Date(s + "T00:00:00Z");
const f = { montantCentimes: null, debuteLe: d("2026-11-01"), factureEmiseLe: null };
describe("Compléter la formation conservée", () => {
  it("un nouveau cycle conserve le prix et la grille du premier, sans relire les tarifs", async () => {
    const tx = { crmFormationPoc: { findUnique: vi.fn().mockResolvedValue({ ...f, montantCentimes: 12345, grilleId: 7 }), create: vi.fn() }, crmCyclePoc: { findMany: vi.fn() } };
    await assurerFormationPoc(tx as unknown as import("@prisma/client").Prisma.TransactionClient, 1, { id: "nouveau", debuteLe: d("2027-06-01"), prolongeLe: null }, 42);
    expect(tx.crmFormationPoc.create).not.toHaveBeenCalled();
    expect(tx.crmCyclePoc.findMany).not.toHaveBeenCalled();
  });
  it("complète un prix inconnu même après le POC, sans toucher à la grille", () => expect(refusModificationFormation(f, { montantCentimes: 12345 }, d("2027-01-01"))).toBeNull());
  it.each([-1, 1.5, 2147483648, NaN])("prix invalide %s", (montantCentimes) => expect(refusModificationFormation(f, { montantCentimes }, d("2027-01-01"))).toContain("entier"));
  it("le prix conservé ne se remplace plus", () => expect(refusModificationFormation({ ...f, montantCentimes: 0 }, { montantCentimes: 123 }, d("2027-01-01"))).toContain("déjà conservé"));
  it("date de facture avant le POC ou future refusée", () => {
    for (const date of ["2026-10-31", "2026-11-23"]) expect(refusModificationFormation({ ...f, montantCentimes: 123 }, { factureEmiseLe: d(date) }, d("2026-11-22"))).toContain("comprise");
  });
  it("prix requis pour déclarer la facture", () => expect(refusModificationFormation(f, { factureEmiseLe: d("2026-11-22") }, d("2026-11-22"))).toContain("Renseignez le prix"));
  it("facture déclarée ne se réécrit pas", () => expect(refusModificationFormation({ ...f, montantCentimes: 123, factureEmiseLe: d("2026-11-02") }, { factureEmiseLe: d("2026-11-03") }, d("2026-11-22"))).toContain("déjà déclarée"));
});
describe("Confidentialité serveur C-64/C-95", () => {
  beforeEach(() => vi.clearAllMocks());
  it("développeur même avec droits stockés cochés : aucune lecture du calendrier", async () => {
    const droits = droitsEffectifs("ADMIN", { profil: "DEVELOPPEUR", droits: ["VOIR_CA", "MODIFIER_MONTANTS"], retireLe: null });
    expect(await chargerFacturation(1, { role: "ADMIN", droits })).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
    await expect(modifierFormationPoc(1, { montantCentimes: 123 }, { id: 1, role: "ADMIN", droits })).rejects.toMatchObject({ statut: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("lecteur CA sans droit de modifier : aucune transaction", async () => {
    await expect(modifierFormationPoc(1, { factureEmiseLe: d("2026-11-22") }, { id: 1, role: "ADMIN", droits: ["VOIR_CA"] })).rejects.toMatchObject({ statut: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
