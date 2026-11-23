import { describe, expect, it } from "vitest";
import { conversionClient, SIGNATURE_FUTURE } from "./conversion";
import { dansJours } from "@/pilot/lib/dates";

const jour = (d: Date) => d.toISOString().slice(0, 10);
const aujourdhui = jour(new Date());
describe("conversionClient", () => {
  it("accepte une signature aujourd'hui, sans début officiel", () =>
    expect(conversionClient.safeParse({ etapeLue: "PROSPECT", signeLe: aujourdhui }).success).toBe(true));
  it("accepte une signature passée et un début officiel", () =>
    expect(conversionClient.safeParse({ etapeLue: "PROPOSITION", signeLe: "2026-01-05", debuteLe: "2026-02-01" }).success).toBe(true));
  it("refuse une signature demain, en le disant", () => {
    const r = conversionClient.safeParse({ etapeLue: "PROSPECT", signeLe: jour(dansJours(new Date(), 1)) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ["signeLe"], message: SIGNATURE_FUTURE });
  });
  it.each([
    { etapeLue: "PROSPECT" },
    { etapeLue: "PROSPECT", signeLe: "" },
    { etapeLue: "PROSPECT", signeLe: "pas une date" },
    { signeLe: aujourdhui },
    { etapeLue: "INCONNUE", signeLe: aujourdhui },
    { etapeLue: "PROSPECT", signeLe: aujourdhui, debuteLe: "pas une date" },
    { etapeLue: "PROSPECT", signeLe: aujourdhui, lignes: [] },
  ])("refuse %j", (corps) => expect(conversionClient.safeParse(corps).success).toBe(false));
});
