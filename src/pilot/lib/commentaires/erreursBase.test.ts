import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { MESSAGE_CONFLIT, MESSAGE_CONTRAINTE, MESSAGE_DISPARU, MESSAGE_PANNE, traduireErreurBase } from "./erreursBase";

// L'écriture simulée : la transaction échoue avec l'erreur que le test choisit, sans base.
const echec = vi.hoisted(() => ({ erreur: null as unknown }));
vi.mock("@/pilot/lib/evenements/journaliser", () => ({
  transactionJournalisee: async () => { throw echec.erreur; },
  journaliser: async () => undefined,
}));
vi.mock("@/pilot/lib/prisma", () => ({ prisma: {} }));

const SECRET = "Texte confidentiel du commentaire 7Q2";
const version = "6.1.0";
const connue = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(`Échec avec la valeur ${SECRET}`, { code, clientVersion: version, meta });
const inconnue = (message: string) => new Prisma.PrismaClientUnknownRequestError(message, { clientVersion: version });
const CHECK = `Error occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23514", message: "new row for relation \\"CrmCommentaire\\" violates check constraint \\"CrmCommentaire_texte_valide\\"", severity: "ERROR", detail: Some("Failing row contains (12, 3, 4, ${SECRET}, AUCUN, null, null, 2026-11-19).") }) })`;

describe("erreurs de la base à l'écriture d'un commentaire (lot T)", () => {
  let journal: MockInstance;
  beforeEach(() => { journal = vi.spyOn(console, "error").mockImplementation(() => undefined); });
  afterEach(() => { journal.mockRestore(); });
  const journalise = () => journal.mock.calls.map((appel) => appel.map(String).join(" ")).join("\n");

  it("une clé étrangère disparue devient un 409, sans le texte", () => {
    const e = traduireErreurBase(connue("P2003", { field_name: "CrmCommentaire_organisationId_fkey (index)" }));
    expect(e).toBeInstanceOf(ErreurMetier);
    expect((e as ErreurMetier).statut).toBe(409);
    expect((e as ErreurMetier).message).toBe(MESSAGE_DISPARU);
    expect(journalise()).toContain("P2003");
    expect(journalise()).toContain("CrmCommentaire_organisationId_fkey");
    expect(journalise()).not.toContain(SECRET);
  });
  it("une contrainte non tenue devient un 400", () => {
    for (const code of ["P2000", "P2004", "P2011"]) {
      const e = traduireErreurBase(connue(code));
      expect((e as ErreurMetier).statut).toBe(400);
      expect((e as ErreurMetier).message).toBe(MESSAGE_CONTRAINTE);
    }
  });
  it("un doublon devient un 409 « Rechargez la page »", () => {
    expect((traduireErreurBase(connue("P2002", { target: ["commentaireId", "destinataireId"] })) as ErreurMetier).message).toBe(MESSAGE_CONFLIT);
  });
  it("une CHECK que Prisma ne classe pas devient un 400, et seul le nom de la contrainte est journalisé", () => {
    const e = traduireErreurBase(inconnue(CHECK));
    expect((e as ErreurMetier).statut).toBe(400);
    expect(journalise()).toContain("SQL 23514");
    expect(journalise()).toContain("CrmCommentaire_texte_valide");
    expect(journalise()).not.toContain(SECRET);
    expect(journalise()).not.toContain("Failing row");
  });
  it("une erreur inconnue devient une erreur neutre, sans le message d'origine", () => {
    for (const brute of [connue("P1001"), inconnue(`Panne ${SECRET}`), new Prisma.PrismaClientValidationError(`Argument texte: "${SECRET}"`, { clientVersion: version })]) {
      const e = traduireErreurBase(brute);
      expect(e).not.toBeInstanceOf(ErreurMetier);
      expect((e as Error).message).toBe(MESSAGE_PANNE);
    }
    expect(journalise()).not.toContain(SECRET);
  });
  it("une erreur métier ou étrangère à Prisma passe telle quelle", () => {
    const metier = new ErreurMetier("Client inconnu.", 404);
    const autre = new TypeError("autre");
    expect(traduireErreurBase(metier)).toBe(metier);
    expect(traduireErreurBase(autre)).toBe(autre);
    expect(journal).not.toHaveBeenCalled();
  });

  it("ecrireCommentaire ne laisse sortir ni le texte ni l'erreur brute", async () => {
    const { ecrireCommentaire } = await import("./gerer");
    const appel = () => ecrireCommentaire(3, { texte: SECRET, cible: { cible: "AUCUN" } }, { id: 1, role: "ADMIN" }).catch((e: unknown) => e);
    echec.erreur = inconnue(CHECK);
    const contrainte = await appel();
    expect(contrainte).toBeInstanceOf(ErreurMetier);
    expect((contrainte as ErreurMetier).statut).toBe(400);
    expect(String((contrainte as Error).message)).not.toContain(SECRET);
    echec.erreur = connue("P2003", { field_name: "CrmCommentaire_auteurId_fkey (index)" });
    expect(((await appel()) as ErreurMetier).statut).toBe(409);
    echec.erreur = connue("P1001");
    const panne = await appel();
    expect(panne).not.toBeInstanceOf(ErreurMetier);
    expect(JSON.stringify({ message: (panne as Error).message, stack: (panne as Error).stack })).not.toContain(SECRET);
    expect(journalise()).not.toContain(SECRET);
  });
});
