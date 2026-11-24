import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmTemperature, Prisma } from "@prisma/client";
import { forcerTemperature, libererTemperature } from "./forcerTemperature";

/**
 * Le forçage de la température côté serveur (C-74). Avec un forçage en place,
 * demander le niveau du calcul le retire, comme le retrait : la règle tient même
 * hors de l'écran. Une base en mémoire, juste assez pour une organisation et le journal.
 */
type Org = {
  etape: "PROSPECT" | "SIGNE"; temperatureForcee: CrmTemperature | null; temperatureForceeLe: Date | null; temperatureForceeParId: number | null;
  nombreSalles: number | null; nombreIrm: null; nombreScanners: null; nombreRadio: null; nombreEcho: null; nombreMammo: null; ris: string | null;
  qualifBudget: boolean; qualifBesoin: boolean; decisionAttendueLe: Date | null;
  contacts: { roleDecision: "DECIDEUR" | "AUTRE" }[]; centres: { ris: string | null; _count: { salles: number } }[];
};
const base = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/pilot/lib/prisma", () => ({ prisma: { $transaction: base.transaction } }));

let org: Org;
let evenements: { type: string }[];
const FORCEE_LE = new Date("2026-11-10T09:00:00Z");

function tables(): Prisma.TransactionClient {
  return {
    $queryRaw: async () => [{ id: 1 }],
    crmOrganisation: {
      findUniqueOrThrow: async () => structuredClone(org),
      updateMany: async ({ where, data }: { where: { temperatureForceeLe: Date | null }; data: Partial<Org> }) => {
        if ((where.temperatureForceeLe?.getTime() ?? null) !== (org.temperatureForceeLe?.getTime() ?? null)) return { count: 0 };
        Object.assign(org, data);
        return { count: 1 };
      },
    },
    crmEvenement: { create: async ({ data }: { data: { type: string } }) => { evenements.push({ type: data.type }); } },
  } as unknown as Prisma.TransactionClient;
}

beforeEach(() => {
  // Calcul : 0 salle, aucun RIS, aucun décideur, rien d'autre : froid.
  org = { etape: "PROSPECT", temperatureForcee: "CHAUD", temperatureForceeLe: FORCEE_LE, temperatureForceeParId: 4,
    nombreSalles: null, nombreIrm: null, nombreScanners: null, nombreRadio: null, nombreEcho: null, nombreMammo: null, ris: null,
    qualifBudget: false, qualifBesoin: false, decisionAttendueLe: null, contacts: [], centres: [] };
  evenements = [];
  base.transaction.mockImplementation(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => fn(tables()));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("forcerTemperature : revenir au calcul libère le forçage (C-74)", () => {
  it("forcé chaud, le calcul dit froid : demander froid retire le forçage et journalise une libération", async () => {
    const r = await forcerTemperature(1, { temperature: "FROID", forceeLe: FORCEE_LE }, 2);
    expect(r).toEqual({ temperatureForcee: null, temperatureForceeLe: null, temperatureForceeParId: null, modifie: true });
    expect(org.temperatureForcee).toBeNull();
    expect(evenements.map((e) => e.type)).toEqual(["TEMPERATURE_LIBEREE"]);
  });
  it("demander un autre niveau que le calcul change le forçage", async () => {
    const r = await forcerTemperature(1, { temperature: "TIEDE", forceeLe: FORCEE_LE }, 2);
    expect(r).toMatchObject({ temperatureForcee: "TIEDE", modifie: true });
    expect(org.temperatureForcee).toBe("TIEDE");
    expect(evenements.map((e) => e.type)).toEqual(["TEMPERATURE_FORCEE"]);
  });
  it("le calcul suit la fiche : avec un décideur, des salles et un RIS, le calcul change et le forçage au même niveau part", async () => {
    Object.assign(org, { nombreSalles: 6, ris: "Xplore", qualifBudget: true, qualifBesoin: true, contacts: [{ roleDecision: "DECIDEUR" }],
      decisionAttendueLe: new Date(Date.now() + 20 * 86400000), temperatureForcee: "FROID" });
    await forcerTemperature(1, { temperature: "CHAUD", forceeLe: FORCEE_LE }, 2);
    expect(org.temperatureForcee).toBeNull();
  });
  it("sans forçage en place, rien ne change à la règle : le niveau demandé s'écrit", async () => {
    Object.assign(org, { temperatureForcee: null, temperatureForceeLe: null, temperatureForceeParId: null });
    await forcerTemperature(1, { temperature: "CHAUD", forceeLe: null }, 2);
    expect(org.temperatureForcee).toBe("CHAUD");
  });
  it("une lecture périmée reçoit 409, rien n'est écrit", async () => {
    await expect(forcerTemperature(1, { temperature: "FROID", forceeLe: new Date("2026-11-01") }, 2)).rejects.toMatchObject({ statut: 409 });
    expect(org.temperatureForcee).toBe("CHAUD");
    expect(evenements).toEqual([]);
  });
  it("le retrait garde son comportement", async () => {
    await libererTemperature(1, { forceeLe: FORCEE_LE }, 2);
    expect(org.temperatureForcee).toBeNull();
    expect(evenements.map((e) => e.type)).toEqual(["TEMPERATURE_LIBEREE"]);
  });
});
