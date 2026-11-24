import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmStatutContrat, CrmStatutProposition, Prisma } from "@prisma/client";
import { accepter } from "./accepter";
import { MESSAGE_VERSION_REMPLACEE_ACCEPTER } from "./regles";

/**
 * L'acceptation reprend un contrat en brouillon sans ligne au lieu d'en créer un
 * second (C-71) : après une conversion sans proposition, le brouillon resterait
 * « À compléter » et son activation compterait le signé deux fois. Un brouillon
 * qui a des lignes n'est pas touché. Une base en mémoire, juste assez pour une
 * proposition, des contrats, des opportunités et le journal ; les faux évaluent
 * le `where` reçu (`correspond`). `$transaction` restaure l'état si la fonction lève.
 */
type LigneContrat = { productId: number; type: string; montantCentimes: number };
type Contrat = { id: number; organisationId: number; statut: CrmStatutContrat; majLe: Date; creeLe: Date; signeLe: Date | null; debuteLe: Date | null;
  engagementMois: number | null; preavisMois: number | null; propositionId: number | null; reference: string | null; lignes: LigneContrat[] };
type Proposition = { id: number; organisationId: number; version: number; statut: CrmStatutProposition; majLe: Date; remisePourMille: number;
  engagementMois: number | null; preavisMois: number | null; repondueLe: Date | null;
  lignes: { productId: number; centreId: null; type: "ABONNEMENT"; montantCentimes: number; unite: null; volumeInclus: null; libelle: null }[] };
type Etat = { proposition: Proposition; autresVersions?: Pick<Proposition, "id" | "organisationId" | "version" | "statut">[]; contrats: Contrat[]; evenements: { type: string; resume: string; contratId?: number }[];
  opportunites: { id: number; organisationId: number; productId: number; gagneeLe: Date | null; perdueLe: Date | null }[] };
const base = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/pilot/lib/prisma", () => ({ prisma: { $transaction: base.transaction } }));

let etat: Etat;

/** Rejoue un `where` Prisma simple : égalité (dates comprises), `in`, `not`, `none` sur une relation. */
function correspond(ligne: object, where: object): boolean {
  return Object.entries(where).every(([cle, attendu]) => {
    const valeur = (ligne as Record<string, unknown>)[cle];
    if (attendu instanceof Date) return valeur instanceof Date && +valeur === +attendu;
    if (attendu !== null && typeof attendu === "object") {
      if ("in" in attendu) return (attendu.in as unknown[]).includes(valeur);
      if ("not" in attendu) return valeur !== attendu.not;
      if ("none" in attendu) return Array.isArray(valeur) && valeur.length === 0;
      throw new Error(`Filtre non rejoué par le faux : ${cle}`);
    }
    return valeur === attendu;
  });
}

function faussesTables(): Prisma.TransactionClient {
  const contrat = (id: number) => etat.contrats.find((c) => c.id === id)!;
  return {
    $queryRaw: async () => [{ id: 1 }],
    crmProposition: {
      findUnique: async () => structuredClone(etat.proposition),
      findUniqueOrThrow: async () => structuredClone(etat.proposition),
      findMany: async ({ where }: { where: object }) => [etat.proposition, ...(etat.autresVersions ?? [])].filter((p) => correspond(p, where)).map((p) => structuredClone(p)),
      updateMany: async ({ where, data }: { where: object; data: object }) => {
        if (!correspond(etat.proposition, where)) return { count: 0 };
        Object.assign(etat.proposition, data);
        return { count: 1 };
      },
    },
    crmContrat: {
      findMany: async ({ where }: { where: object }) => etat.contrats.filter((c) => correspond(c, where)).map((c) => structuredClone(c)),
      findFirst: async ({ where, orderBy }: { where: object; orderBy: { creeLe?: "desc"; id?: "desc" }[] }) => {
        expect(orderBy).toEqual([{ creeLe: "desc" }, { id: "desc" }]);
        const trouves = etat.contrats.filter((c) => correspond(c, where)).sort((a, b) => +b.creeLe - +a.creeLe || b.id - a.id);
        return trouves[0] ? structuredClone(trouves[0]) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => structuredClone(contrat(where.id)),
      updateMany: async ({ where, data }: { where: object; data: object }) => {
        const cibles = etat.contrats.filter((c) => correspond(c, where));
        cibles.forEach((c) => Object.assign(c, data));
        return { count: cibles.length };
      },
      create: async ({ data: { lignes, ...data } }: { data: Omit<Contrat, "id" | "majLe" | "creeLe" | "lignes"> & { lignes: { create: LigneContrat[] } } }) => {
        const cree = { ...data, id: 50 + etat.contrats.length, majLe: new Date(), creeLe: new Date(), lignes: lignes.create.map((l) => ({ ...l })) } as Contrat;
        etat.contrats.push(cree);
        return structuredClone(cree);
      },
    },
    crmLigneContrat: {
      createMany: async ({ data }: { data: (LigneContrat & { contratId: number })[] }) => {
        for (const { contratId, ...l } of data) contrat(contratId).lignes.push(l);
        return { count: data.length };
      },
    },
    crmOpportunite: {
      findMany: async ({ where }: { where: object }) => etat.opportunites.filter((o) => correspond(o, where)).map((o) => ({ id: o.id })),
      updateMany: async ({ where, data }: { where: object; data: object }) => {
        const cibles = etat.opportunites.filter((o) => correspond(o, where));
        cibles.forEach((o) => Object.assign(o, data));
        return { count: cibles.length };
      },
    },
    // Aucun centre : l'acceptation ne rattache rien (C-90, testé à part dans centres/rattacherDepuisContrat.test.ts).
    crmCentre: { findMany: async () => [] },
    crmCentreProduit: { findMany: async () => [] },
    product: { findMany: async () => [] },
    // Déjà signée : l'acceptation ne franchit aucune étape, la conversion est testée à part.
    crmOrganisation: { findUniqueOrThrow: async () => ({ id: 1, etape: "SIGNE" }) },
    crmEvenement: { create: async ({ data }: { data: { type: string; resume: string; contratId?: number } }) => {
      etat.evenements.push({ type: data.type, resume: data.resume, contratId: data.contratId });
    } },
  } as unknown as Prisma.TransactionClient;
}

const brouillon = (id: number, creeLe: string, lignes: LigneContrat[] = [], organisationId = 1): Contrat => ({
  id, organisationId, statut: "BROUILLON", majLe: new Date("2026-11-05"), creeLe: new Date(creeLe), signeLe: new Date("2026-11-05"),
  debuteLe: new Date("2026-12-01"), engagementMois: null, preavisMois: 3, propositionId: null, reference: null, lignes,
});

beforeEach(() => {
  etat = {
    proposition: { id: 7, organisationId: 1, version: 2, statut: "ENVOYEE", majLe: new Date("2026-11-10"), remisePourMille: 100,
      engagementMois: 24, preavisMois: null, repondueLe: null,
      lignes: [{ productId: 10, centreId: null, type: "ABONNEMENT", montantCentimes: 10005, unite: null, volumeInclus: null, libelle: null }] },
    contrats: [],
    evenements: [],
    opportunites: [{ id: 5, organisationId: 1, productId: 10, gagneeLe: null, perdueLe: null }],
  };
  base.transaction.mockImplementation(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    const sauvegarde = structuredClone(etat);
    try { return await fn(faussesTables()); } catch (erreur) { etat = sauvegarde; throw erreur; }
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const types = () => etat.evenements.map((e) => `${e.type} · ${e.resume}`);

describe("accepter : un brouillon sans ligne est repris (C-71)", () => {
  it("le brouillon reçoit les lignes au montant net, les dates, la proposition, et devient actif", async () => {
    etat.contrats = [brouillon(3, "2026-11-05")];
    const resultat = await accepter(7, {}, 2);
    expect(resultat.brouillonRepris).toBe(true);
    expect(resultat.contrat.id).toBe(3);
    expect(etat.contrats).toHaveLength(1);
    const repris = etat.contrats[0];
    expect(repris).toMatchObject({ statut: "ACTIF", propositionId: 7, reference: "Proposition v2", engagementMois: 24, preavisMois: 3,
      lignes: [{ productId: 10, type: "ABONNEMENT", montantCentimes: 9005 }] });
    // Signé à l'acceptation ; sans date de début saisie, celle du brouillon reste.
    expect(+repris.signeLe! > +new Date("2026-11-06")).toBe(true);
    expect(repris.debuteLe).toEqual(new Date("2026-12-01"));
    expect(types()).toContain("CONTRAT_MODIFIE · Contrat en brouillon activé depuis la version 2");
    expect(types().some((t) => t.startsWith("CONTRAT_CREE"))).toBe(false);
    expect(etat.opportunites[0].gagneeLe).not.toBeNull();
  });
  it("une date de début saisie l'emporte sur celle du brouillon", async () => {
    etat.contrats = [brouillon(3, "2026-11-05")];
    await accepter(7, { debuteLe: new Date("2027-01-01") }, 2);
    expect(etat.contrats[0].debuteLe).toEqual(new Date("2027-01-01"));
  });
  it("plusieurs brouillons sans ligne : le plus récent est repris, les autres restent", async () => {
    etat.contrats = [brouillon(3, "2026-11-01"), brouillon(4, "2026-11-08"), brouillon(5, "2026-11-03")];
    const { contrat } = await accepter(7, {}, 2);
    expect(contrat.id).toBe(4);
    expect(etat.contrats.map((c) => `${c.id}:${c.statut}`)).toEqual(["3:BROUILLON", "4:ACTIF", "5:BROUILLON"]);
  });
  it("un brouillon qui a des lignes n'est pas touché : un contrat est créé à côté", async () => {
    etat.contrats = [brouillon(3, "2026-11-05", [{ productId: 11, type: "ABONNEMENT", montantCentimes: 4000 }])];
    const resultat = await accepter(7, {}, 2);
    expect(resultat.brouillonRepris).toBe(false);
    expect(etat.contrats[0]).toMatchObject({ id: 3, statut: "BROUILLON", lignes: [{ productId: 11, montantCentimes: 4000 }] });
    expect(etat.contrats).toHaveLength(2);
    expect(etat.contrats[1]).toMatchObject({ statut: "ACTIF", propositionId: 7, lignes: [{ montantCentimes: 9005 }] });
    expect(types()).toContain("CONTRAT_CREE · Contrat créé depuis la version 2");
  });
  it("le brouillon vide d'une autre organisation n'est pas repris", async () => {
    etat.contrats = [brouillon(3, "2026-11-05", [], 2)];
    const resultat = await accepter(7, {}, 2);
    expect(resultat.brouillonRepris).toBe(false);
    expect(etat.contrats[0].statut).toBe("BROUILLON");
  });
  it("sans brouillon : un contrat actif est créé, comme avant", async () => {
    const resultat = await accepter(7, {}, 2);
    expect(resultat.brouillonRepris).toBe(false);
    expect(etat.contrats).toEqual([expect.objectContaining({ statut: "ACTIF", reference: "Proposition v2", engagementMois: 24, debuteLe: null })]);
  });
  it("un brouillon changé entre la lecture et l'écriture : 409, rien n'est écrit", async () => {
    etat.contrats = [brouillon(3, "2026-11-05")];
    const tables = faussesTables();
    const lire = tables.crmContrat.findFirst;
    tables.crmContrat.findFirst = (async (args: never) => {
      const lu = await (lire as (a: never) => Promise<Contrat | null>)(args);
      etat.contrats[0].majLe = new Date("2026-11-11");
      return lu;
    }) as typeof tables.crmContrat.findFirst;
    base.transaction.mockImplementationOnce(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      const sauvegarde = structuredClone(etat);
      try { return await fn(tables); } catch (erreur) { etat = sauvegarde; throw erreur; }
    });
    await expect(accepter(7, {}, 2)).rejects.toMatchObject({ statut: 409 });
    expect(etat.contrats[0]).toMatchObject({ statut: "BROUILLON", lignes: [] });
    expect(etat.proposition.statut).toBe("ENVOYEE");
    expect(etat.evenements).toEqual([]);
  });
});

describe("accepter : seule la version qui attend une réponse s'accepte", () => {
  it("une version plus récente envoyée puis refusée : l'ancienne, restée envoyée, ne s'accepte pas (409), rien n'est écrit", async () => {
    etat.proposition.version = 1;
    etat.autresVersions = [{ id: 8, organisationId: 1, version: 2, statut: "REFUSEE" }];
    await expect(accepter(7, {}, 2)).rejects.toMatchObject({ statut: 409, message: MESSAGE_VERSION_REMPLACEE_ACCEPTER });
    expect(etat.proposition.statut).toBe("ENVOYEE");
    expect(etat.contrats).toEqual([]);
    expect(etat.evenements).toEqual([]);
  });
  it("une version plus récente encore envoyée : l'ancienne ne s'accepte pas non plus", async () => {
    etat.proposition.version = 1;
    etat.autresVersions = [{ id: 8, organisationId: 1, version: 2, statut: "ENVOYEE" }];
    await expect(accepter(7, {}, 2)).rejects.toMatchObject({ statut: 409 });
  });
  it("un brouillon plus récent ne remplace rien : la dernière version envoyée s'accepte", async () => {
    etat.autresVersions = [{ id: 8, organisationId: 1, version: 3, statut: "BROUILLON" }, { id: 6, organisationId: 1, version: 1, statut: "REFUSEE" }];
    const { contrat } = await accepter(7, {}, 2);
    expect(contrat.statut).toBe("ACTIF");
  });
  it("les versions d'une autre organisation ne comptent pas", async () => {
    etat.autresVersions = [{ id: 9, organisationId: 2, version: 5, statut: "ENVOYEE" }];
    const { contrat } = await accepter(7, {}, 2);
    expect(contrat.statut).toBe("ACTIF");
  });
});
