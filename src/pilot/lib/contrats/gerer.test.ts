import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmStatutContrat, CrmTypeLigne, Prisma } from "@prisma/client";
import { changerStatutContrat } from "./gerer";
import { ajouterLigne, modifierLigne } from "./lignes";
import { messageAChiffrer } from "@/pilot/lib/propositions/affichage";

/**
 * Un contrat actif qui porte un produit gagne les opportunités ouvertes de ce
 * produit, dans la même transaction (C-39, C-71) : à l'activation d'un
 * brouillon, et quand une ligne est posée ou changée sur un contrat déjà actif.
 * Une base en mémoire, juste assez pour un contrat, ses lignes, des
 * opportunités et le journal. Les faux évaluent le `where` reçu (`correspond`),
 * ils ne refont pas le filtre eux-mêmes ; un filtre qu'ils ne savent pas
 * rejouer fait échouer le test. `$transaction` restaure l'état si la fonction lève.
 */
type Ligne = { id: number; contratId: number; productId: number; centreId: number | null; type: CrmTypeLigne; montantCentimes: number;
  unite: null; volumeInclus: null; libelle: string | null; offerte?: boolean; majLe: Date };
type Opportunite = { id: number; organisationId: number; productId: number; gagneeLe: Date | null; perdueLe: Date | null;
  montantMensuelCentimes: number; product: { name: string } };
type Etat = {
  etape: "SIGNE" | "EN_POC";
  contrat: { id: number; organisationId: number; statut: CrmStatutContrat; majLe: Date; signeLe: Date | null; termineLe: Date | null; lignes: Ligne[] };
  opportunites: Opportunite[];
  evenements: { resume: string; opportuniteId?: number }[];
  ecrituresOpportunites: number;
};
const base = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/pilot/lib/prisma", () => ({ prisma: { $transaction: base.transaction } }));

let etat: Etat;
const PRODUITS: Record<number, string> = { 10: "LyraeTalk", 11: "Konnect", 12: "Desk" };

/** Rejoue un `where` Prisma simple : égalité (dates comprises), `in`, `none` sur une relation. */
function correspond(ligne: object, where: object): boolean {
  return Object.entries(where).every(([cle, attendu]) => {
    const valeur = (ligne as Record<string, unknown>)[cle];
    if (attendu instanceof Date) return valeur instanceof Date && +valeur === +attendu;
    if (attendu !== null && typeof attendu === "object") {
      if ("in" in attendu) return (attendu.in as unknown[]).includes(valeur);
      if ("none" in attendu) return Array.isArray(valeur) && valeur.length === 0;
      throw new Error(`Filtre non rejoué par le faux : ${cle}`);
    }
    return valeur === attendu;
  });
}
const projeter = (ligne: Record<string, unknown>, select?: Record<string, unknown>) =>
  select ? Object.fromEntries(Object.keys(select).map((cle) => [cle, ligne[cle]])) : ligne;
const appliquer = <T extends object>(ligne: T, data: object) => Object.assign(ligne, data);

function faussesTables(): Prisma.TransactionClient {
  return {
    $queryRaw: async () => [{ id: etat.contrat.organisationId }],
    product: { count: async ({ where }: { where: { id: { in: number[] } } }) => where.id.in.filter((id) => PRODUITS[id]).length, findMany: async () => [] },
    // Aucun centre : l'activation ne rattache rien (C-90, testé à part dans centres/rattacherDepuisContrat.test.ts).
    crmCentre: { count: async () => 0, findMany: async () => [] },
    crmCentreProduit: { findMany: async () => [] },
    crmOrganisation: { findUniqueOrThrow: async () => ({ etape: etat.etape }) },
    crmContrat: {
      findUnique: async () => structuredClone(etat.contrat),
      findUniqueOrThrow: async () => structuredClone(etat.contrat),
      updateMany: async ({ where, data }: { where: object; data: object }) => {
        if (!correspond(etat.contrat, where)) return { count: 0 };
        appliquer(etat.contrat, data);
        return { count: 1 };
      },
    },
    crmLigneContrat: {
      create: async ({ data }: { data: Omit<Ligne, "id" | "majLe"> }) => {
        const ligne: Ligne = { ...data, id: 100 + etat.contrat.lignes.length, majLe: new Date("2026-11-02") };
        etat.contrat.lignes.push(ligne);
        return structuredClone(ligne);
      },
      updateMany: async ({ where, data }: { where: object; data: object }) => {
        const lignes = etat.contrat.lignes.filter((l) => correspond(l, where));
        lignes.forEach((l) => appliquer(l, data));
        return { count: lignes.length };
      },
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => structuredClone(etat.contrat.lignes.find((l) => l.id === where.id)!),
    },
    crmOpportunite: {
      findMany: async ({ where, select }: { where: object; select?: Record<string, unknown> }) =>
        etat.opportunites.filter((o) => correspond(o, where)).map((o) => projeter(structuredClone(o), select)),
      updateMany: async ({ where, data }: { where: object; data: object }) => {
        etat.ecrituresOpportunites += 1;
        const cibles = etat.opportunites.filter((o) => correspond(o, where));
        cibles.forEach((o) => appliquer(o, data));
        return { count: cibles.length };
      },
    },
    crmEvenement: { create: async ({ data }: { data: { resume: string; opportuniteId?: number } }) => { etat.evenements.push({ resume: data.resume, opportuniteId: data.opportuniteId }); } },
  } as unknown as Prisma.TransactionClient;
}

const opportunite = (id: number, productId: number, organisationId = 1, perdueLe: Date | null = null, montantMensuelCentimes = 1000): Opportunite =>
  ({ id, organisationId, productId, gagneeLe: null, perdueLe, montantMensuelCentimes, product: { name: PRODUITS[productId] } });
const ligne = (id: number, productId: number): Ligne =>
  ({ id, contratId: 3, productId, centreId: null, type: "ABONNEMENT", montantCentimes: 5000, unite: null, volumeInclus: null, libelle: null, majLe: new Date("2026-11-01") });

beforeEach(() => {
  etat = {
    etape: "SIGNE",
    contrat: { id: 3, organisationId: 1, statut: "BROUILLON", majLe: new Date("2026-11-01"), signeLe: new Date("2026-11-10"), termineLe: null,
      lignes: [ligne(1, 10), ligne(2, 10), ligne(3, 11)] },
    opportunites: [opportunite(5, 10), opportunite(6, 12, 1, null, 7000), opportunite(7, 11, 1, new Date("2026-10-01")), opportunite(8, 10, 2)],
    evenements: [],
    ecrituresOpportunites: 0,
  };
  base.transaction.mockImplementation(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    const sauvegarde = structuredClone(etat);
    try { return await fn(faussesTables()); } catch (erreur) { etat = sauvegarde; throw erreur; }
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const gagnees = () => etat.opportunites.filter((o) => o.gagneeLe).map((o) => o.id);
const resumes = () => etat.evenements.map((e) => e.resume);

describe("changerStatutContrat : l'activation gagne les opportunités (C-71)", () => {
  it("refuse l'activation pendant le POC sans écriture ni opportunité gagnée", async () => {
    etat.etape = "EN_POC";
    const avant = structuredClone(etat);
    await expect(changerStatutContrat(3, { vers: "ACTIF" }, 2)).rejects.toThrow("Validez d'abord le POC");
    expect(etat).toEqual(avant);
  });
  it("brouillon vers actif : seules les opportunités ouvertes des produits des lignes, de cette organisation", async () => {
    await changerStatutContrat(3, { vers: "ACTIF" }, 2);
    expect(etat.contrat.statut).toBe("ACTIF");
    // 6 : un autre produit ; 7 : déjà perdue ; 8 : une autre organisation.
    expect(gagnees()).toEqual([5]);
    expect(resumes()).toEqual(["Contrat : Brouillon vers Actif", "Opportunité gagnée"]);
    expect(etat.evenements[1].opportuniteId).toBe(5);
  });
  it("rend le bilan : le nombre gagné et les opportunités qui restent ouvertes, produit et montant", async () => {
    const { contrat, bilan } = await changerStatutContrat(3, { vers: "ACTIF" }, 2);
    expect(contrat.statut).toBe("ACTIF");
    expect(bilan).toEqual({ gagnees: 1, ouvertes: [{ produit: "Desk", montantMensuelCentimes: 7000 }] });
  });
  it("plusieurs opportunités du même produit : une seule écriture groupée, un événement par opportunité", async () => {
    etat.opportunites.push(opportunite(9, 10), opportunite(10, 11));
    const { bilan } = await changerStatutContrat(3, { vers: "ACTIF" }, 2);
    expect(gagnees()).toEqual([5, 9, 10]);
    expect(etat.ecrituresOpportunites).toBe(1);
    expect(etat.evenements.filter((e) => e.resume === "Opportunité gagnée").map((e) => e.opportuniteId)).toEqual([5, 9, 10]);
    expect(bilan?.gagnees).toBe(3);
  });
  it("une activation refusée (sans ligne) ne gagne rien", async () => {
    etat.contrat.lignes = [];
    await expect(changerStatutContrat(3, { vers: "ACTIF" }, 2)).rejects.toMatchObject({ statut: 400 });
    expect(gagnees()).toEqual([]);
    expect(etat.evenements).toEqual([]);
  });
  it("terminer un contrat actif ne touche pas aux opportunités, sans bilan", async () => {
    etat.contrat.statut = "ACTIF";
    const { bilan } = await changerStatutContrat(3, { vers: "TERMINE", le: new Date() }, 2);
    expect(etat.contrat.statut).toBe("TERMINE");
    expect(gagnees()).toEqual([]);
    expect(bilan).toBeNull();
  });
});

describe("lignes d'un contrat actif : elles gagnent les opportunités de leur produit (C-71)", () => {
  it("une ligne ajoutée à un contrat actif gagne les opportunités ouvertes de son produit, dans la même transaction", async () => {
    etat.contrat.statut = "ACTIF";
    const { ligne: creee, bilan } = await ajouterLigne(3, { productId: 12, centreId: null, type: "ABONNEMENT", montantCentimes: 7000, unite: null, volumeInclus: null, libelle: null }, 2);
    expect(creee.productId).toBe(12);
    expect(gagnees()).toEqual([6]);
    expect(resumes()).toEqual(["Ligne ajoutée", "Opportunité gagnée"]);
    // L'opportunité Talk 5 reste ouverte : la ligne ajoutée porte Desk.
    expect(bilan).toEqual({ gagnees: 1, ouvertes: [{ produit: "LyraeTalk", montantMensuelCentimes: 1000 }] });
  });
  it("une ligne ajoutée à un brouillon ne gagne rien : l'activation s'en chargera", async () => {
    const { bilan } = await ajouterLigne(3, { productId: 12, centreId: null, type: "ABONNEMENT", montantCentimes: 7000, unite: null, volumeInclus: null, libelle: null }, 2);
    expect(gagnees()).toEqual([]);
    expect(bilan).toBeNull();
  });
  it("aucune opportunité du produit : pas de bilan, rien à dire", async () => {
    etat.contrat.statut = "ACTIF";
    const { bilan } = await ajouterLigne(3, { productId: 11, centreId: null, type: "ABONNEMENT", montantCentimes: 100, unite: null, volumeInclus: null, libelle: null }, 2);
    expect(gagnees()).toEqual([]);
    expect(bilan).toBeNull();
    expect(resumes()).toEqual(["Ligne ajoutée"]);
  });
  it("une ligne dont le produit change sur un contrat actif gagne les opportunités du produit final", async () => {
    etat.contrat.statut = "ACTIF";
    const { ligne: modifiee, bilan } = await modifierLigne(3, 3, { productId: 12 }, 2);
    expect(modifiee.productId).toBe(12);
    expect(gagnees()).toEqual([6]);
    expect(resumes()).toEqual(["Ligne modifiée", "Opportunité gagnée"]);
    expect(bilan?.gagnees).toBe(1);
  });
  it("une ligne inchangée n'écrit rien et ne gagne rien", async () => {
    etat.contrat.statut = "ACTIF";
    const { bilan } = await modifierLigne(3, 3, { productId: 11 }, 2);
    expect(gagnees()).toEqual([]);
    expect(bilan).toBeNull();
    expect(etat.evenements).toEqual([]);
  });
  it("une ligne modifiée sur un brouillon ne gagne rien", async () => {
    await modifierLigne(3, 3, { productId: 12 }, 2);
    expect(gagnees()).toEqual([]);
  });
  it("si l'écriture groupée ne trouve pas toutes les opportunités lues, tout est annulé : 409, ni ligne ni journal", async () => {
    etat.contrat.statut = "ACTIF";
    etat.opportunites.push(opportunite(9, 12));
    const tables = faussesTables();
    // Une opportunité conclue entre la lecture et l'écriture, ce que le verrou interdit : on refuse plutôt que de journaliser à l'aveugle.
    const lire = tables.crmOpportunite.findMany;
    tables.crmOpportunite.findMany = (async (args: never) => {
      const lues = await (lire as (a: never) => Promise<unknown[]>)(args);
      etat.opportunites.find((o) => o.id === 9)!.perdueLe = new Date();
      return lues;
    }) as typeof tables.crmOpportunite.findMany;
    base.transaction.mockImplementationOnce(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      const sauvegarde = structuredClone(etat);
      try { return await fn(tables); } catch (erreur) { etat = sauvegarde; throw erreur; }
    });
    await expect(ajouterLigne(3, { productId: 12, centreId: null, type: "ABONNEMENT", montantCentimes: 7000, unite: null, volumeInclus: null, libelle: null }, 2))
      .rejects.toMatchObject({ statut: 409 });
    expect(etat.contrat.lignes).toHaveLength(3);
    expect(gagnees()).toEqual([]);
    expect(etat.evenements).toEqual([]);
  });
});

describe("un contrat actif ne porte pas de ligne à chiffrer (estAChiffrer, la règle de l'envoi)", () => {
  const nouvelle = (plus: object = {}) => ({ productId: 12, centreId: null, type: "ABONNEMENT" as const, montantCentimes: 0, unite: null, volumeInclus: null, libelle: null, ...plus });
  it("activation refusée avec une ligne à 0 non offerte : 400, le message de l'envoi, rien n'est écrit ni gagné", async () => {
    etat.contrat.lignes[1].montantCentimes = 0;
    await expect(changerStatutContrat(3, { vers: "ACTIF" }, 2)).rejects.toMatchObject({ statut: 400, message: messageAChiffrer(1, "contrat") });
    expect(etat.contrat.statut).toBe("BROUILLON");
    expect(gagnees()).toEqual([]);
    expect(etat.evenements).toEqual([]);
  });
  it("activation acceptée si la ligne à 0 est cochée Offert", async () => {
    Object.assign(etat.contrat.lignes[1], { montantCentimes: 0, offerte: true });
    await changerStatutContrat(3, { vers: "ACTIF" }, 2);
    expect(etat.contrat.statut).toBe("ACTIF");
  });
  it("la part à l'usage à 0 ne bloque pas l'activation", async () => {
    Object.assign(etat.contrat.lignes[1], { montantCentimes: 0, type: "PART_VARIABLE" });
    await changerStatutContrat(3, { vers: "ACTIF" }, 2);
    expect(etat.contrat.statut).toBe("ACTIF");
  });
  it("une ligne à 0 non offerte ajoutée à un contrat actif : 400, rien n'est écrit", async () => {
    etat.contrat.statut = "ACTIF";
    await expect(ajouterLigne(3, nouvelle(), 2)).rejects.toMatchObject({ statut: 400, message: messageAChiffrer(1, "contrat") });
    expect(etat.contrat.lignes).toHaveLength(3);
    expect(gagnees()).toEqual([]);
  });
  it("offerte, la même ligne s'ajoute au contrat actif", async () => {
    etat.contrat.statut = "ACTIF";
    await ajouterLigne(3, nouvelle({ offerte: true }), 2);
    expect(etat.contrat.lignes).toHaveLength(4);
  });
  it("sur un brouillon, une ligne à 0 attend son prix : elle s'ajoute", async () => {
    await ajouterLigne(3, nouvelle(), 2);
    expect(etat.contrat.lignes).toHaveLength(4);
  });
  it("une ligne d'un contrat actif modifiée à 0 sans être offerte : 400, la ligne garde son montant", async () => {
    etat.contrat.statut = "ACTIF";
    await expect(modifierLigne(3, 1, { montantCentimes: 0 }, 2)).rejects.toMatchObject({ statut: 400 });
    expect(etat.contrat.lignes[0].montantCentimes).toBe(5000);
  });
});

describe("une ligne modifiée ne gagne que si son produit change (C-71)", () => {
  it("corriger le montant d'une ligne Talk d'un contrat actif ne gagne pas l'opportunité Talk ouverte", async () => {
    etat.contrat.statut = "ACTIF";
    const { bilan } = await modifierLigne(3, 1, { montantCentimes: 6000 }, 2);
    expect(etat.contrat.lignes[0].montantCentimes).toBe(6000);
    expect(gagnees()).toEqual([]);
    expect(bilan).toBeNull();
    expect(resumes()).toEqual(["Ligne modifiée"]);
  });
  it("corriger le libellé non plus", async () => {
    etat.contrat.statut = "ACTIF";
    await modifierLigne(3, 1, { libelle: "Salle de radiologie" }, 2);
    expect(gagnees()).toEqual([]);
  });
});
