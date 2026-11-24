import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { sansErreurBrute, traduireErreurBase, type MessagesErreurBase } from "./erreursBase";

vi.mock("@/pilot/lib/prisma", () => ({ prisma: {} }));

const SECRET = "Libellé confidentiel 4K9";
const version = "6.1.0";
const connue = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(`Échec avec la valeur ${SECRET}`, { code, clientVersion: version, meta });
const inconnue = (message: string) => new Prisma.PrismaClientUnknownRequestError(message, { clientVersion: version });
const CHECK = `PostgresError { code: "23514", message: "new row for relation \\"CrmTarif\\" violates check constraint \\"CrmTarif_base_valide\\"", detail: Some("Failing row contains (3, ${SECRET}).") }`;
const MESSAGES: MessagesErreurBase = { contrainte: "Refus.", disparu: "Disparu.", conflit: "Conflit.", panne: "Panne.", ecriture: "Écriture d'essai" };

describe("erreurs de la base à l'écriture : un module partagé", () => {
  let journal: MockInstance;
  beforeEach(() => { journal = vi.spyOn(console, "error").mockImplementation(() => undefined); });
  afterEach(() => { journal.mockRestore(); });
  const journalise = () => journal.mock.calls.map((appel) => appel.map(String).join(" ")).join("\n");

  it("chaque famille d'erreur prend la phrase du service, jamais le message d'origine", () => {
    expect(traduireErreurBase(connue("P2003"), MESSAGES)).toMatchObject({ statut: 409, message: "Disparu." });
    expect(traduireErreurBase(connue("P2002"), MESSAGES)).toMatchObject({ statut: 409, message: "Conflit." });
    expect(traduireErreurBase(connue("P2000"), MESSAGES)).toMatchObject({ statut: 400, message: "Refus." });
    expect(traduireErreurBase(inconnue(CHECK), MESSAGES)).toMatchObject({ statut: 400, message: "Refus." });
    const panne = traduireErreurBase(connue("P1001"), MESSAGES);
    expect(panne).not.toBeInstanceOf(ErreurMetier);
    expect((panne as Error).message).toBe("Panne.");
  });
  it("le log porte l'écriture, le code et la contrainte, jamais la valeur", () => {
    traduireErreurBase(inconnue(CHECK), MESSAGES);
    traduireErreurBase(connue("P2003", { field_name: "CrmTarif_grilleId_fkey (index)" }), MESSAGES);
    expect(journalise()).toContain("Écriture d'essai refusée par la base");
    expect(journalise()).toContain("CrmTarif_base_valide");
    expect(journalise()).toContain("CrmTarif_grilleId_fkey");
    expect(journalise()).not.toContain(SECRET);
    expect(journalise()).not.toContain("Failing row");
  });
  it("sansErreurBrute rend le résultat, traduit une erreur de base et laisse passer une erreur métier", async () => {
    expect(await sansErreurBrute(async () => 7, MESSAGES)).toBe(7);
    const traduite = await sansErreurBrute(async () => { throw connue("P2025"); }, MESSAGES).catch((e: unknown) => e);
    expect(traduite).toMatchObject({ statut: 409, message: "Disparu." });
    const metier = new ErreurMetier("Concurrent inconnu.", 404);
    expect(await sansErreurBrute(async () => { throw metier; }, MESSAGES).catch((e: unknown) => e)).toBe(metier);
  });

  it("concurrents, grilles et propositions ont leurs phrases, sans texte saisi", async () => {
    const { MESSAGES_BASE_CONCURRENT } = await import("@/pilot/lib/concurrents/gerer");
    const { MESSAGES_BASE_GRILLE } = await import("@/pilot/lib/tarifs/gerer");
    const { MESSAGES_BASE_PROPOSITION } = await import("@/pilot/lib/propositions/commun");
    for (const messages of [MESSAGES_BASE_CONCURRENT, MESSAGES_BASE_GRILLE, MESSAGES_BASE_PROPOSITION]) {
      for (const erreur of [connue("P2003"), connue("P2002"), inconnue(CHECK)]) {
        const e = traduireErreurBase(erreur, messages) as ErreurMetier;
        expect(e).toBeInstanceOf(ErreurMetier);
        expect(e.message).not.toContain(SECRET);
        expect(Object.values(messages)).toContain(e.message);
      }
    }
    expect(journalise()).not.toContain(SECRET);
  });
});
