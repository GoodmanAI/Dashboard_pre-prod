import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { journaliser, ligneAudit, transactionJournalisee, type EvenementAJournaliser } from "./journaliser";

const base = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/pilot/lib/prisma", () => ({ prisma: { $transaction: base.transaction } }));
afterEach(() => vi.restoreAllMocks());

const evenement: EvenementAJournaliser = {
  type: "ETAPE_COMMERCIALE_CHANGEE", organisationId: 7, auteurId: 2,
  resume: "Étape : Proposition vers Signé",
  avant: { etape: "PROPOSITION", secret: "Texte privé" },
  apres: { etape: "SIGNE" },
};
const date = new Date("2026-10-26T09:00:00.000Z");

it("ligneAudit ne sérialise que les six champs publics", () => {
  const ligne = ligneAudit(evenement, date);
  expect(JSON.parse(ligne)).toEqual({
    niveau: "audit", type: evenement.type, organisationId: 7, auteurId: 2,
    resume: evenement.resume, ts: date.toISOString(),
  });
  expect(ligne).not.toMatch(/avant|apres|Texte privé/);
});

it("conserve les clés pour un événement système sans organisation", () => {
  expect(JSON.parse(ligneAudit({ type: "IMPORT_EXECUTE", resume: "Import terminé", auteurId: null }, date)))
    .toMatchObject({ auteurId: null, organisationId: null });
});

describe("audit et transaction", () => {
  function transactionFictive() {
    const creer = vi.fn().mockResolvedValue({});
    return { creer, tx: { crmEvenement: { create: creer } } as unknown as Prisma.TransactionClient };
  }

  it("publie après le commit, dans l'ordre des événements", async () => {
    const { tx, creer } = transactionFictive();
    const sortie = vi.spyOn(console, "log").mockImplementation(() => {});
    base.transaction.mockImplementation(async (fn) => {
      const resultat = await fn(tx);
      expect(sortie).not.toHaveBeenCalled();
      return resultat;
    });
    const resultat = await transactionJournalisee(async (courante) => {
      await journaliser(courante, evenement);
      await journaliser(courante, { ...evenement, resume: "Deuxième événement" });
      return 42;
    });
    expect(resultat).toBe(42);
    expect(creer).toHaveBeenCalledTimes(2);
    expect(sortie).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sortie.mock.calls[1][0]).resume).toBe("Deuxième événement");
  });

  it("n'émet rien si le métier échoue après la création de l'événement", async () => {
    const { tx } = transactionFictive();
    const sortie = vi.spyOn(console, "log").mockImplementation(() => {});
    base.transaction.mockImplementation(async (fn) => fn(tx));
    await expect(transactionJournalisee(async (courante) => {
      await journaliser(courante, evenement);
      throw new Error("Annulation");
    })).rejects.toThrow("Annulation");
    expect(sortie).not.toHaveBeenCalled();
  });

  it("n'émet rien si le commit échoue", async () => {
    const { tx } = transactionFictive();
    const sortie = vi.spyOn(console, "log").mockImplementation(() => {});
    base.transaction.mockImplementation(async (fn) => {
      await fn(tx);
      throw new Error("Commit refusé");
    });
    await expect(transactionJournalisee((courante) => journaliser(courante, evenement))).rejects.toThrow("Commit refusé");
    expect(sortie).not.toHaveBeenCalled();
  });

  it("émet immédiatement pour un tx non enregistré, notamment le seed", async () => {
    const { tx, creer } = transactionFictive();
    const sortie = vi.spyOn(console, "log").mockImplementation(() => {});
    await journaliser(tx, { ...evenement, surveneuLe: date });
    expect(creer).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ surveneuLe: date }),
    }));
    expect(sortie).toHaveBeenCalledWith(ligneAudit(evenement, date));
  });
});
