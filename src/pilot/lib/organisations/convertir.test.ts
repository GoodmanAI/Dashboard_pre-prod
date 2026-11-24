import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmEtapeCommerciale, CrmStatutProposition, Prisma } from "@prisma/client";
import { transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { convertirAvecContrat, convertirEnClient, PROPOSITION_EN_ATTENTE, refusConversion } from "./convertir";
import { changerEtape } from "./changerEtape";

/**
 * Une base en mémoire, juste assez pour la conversion : une organisation, ses
 * versions de proposition, ses écritures conditionnelles et le journal. Le faux
 * des propositions évalue le `where` reçu et ne rend que les champs demandés :
 * la garde voit ce que la base lui donnerait. `$transaction` rejoue ce que fait
 * PostgreSQL : l'état est restauré si la fonction lève.
 */
type Opportunite = { id: number; gagneeLe: Date | null; perdueLe: Date | null };
type Version = { organisationId: number; version: number; statut: CrmStatutProposition; remisePourMille: number };
type Etat = {
  etape: CrmEtapeCommerciale; evenements: { resume: string; apres: Record<string, unknown> }[];
  propositions: Version[]; lecturesPropositions: number; opportunites: Opportunite[]; contrats: { signeLe: Date; lignes: unknown[] }[];
};
const base = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/pilot/lib/prisma", () => ({ prisma: { $transaction: base.transaction } }));
// Le contrat en brouillon relève de la logique des contrats, testée à part : ici on constate seulement qu'il est demandé.
vi.mock("@/pilot/lib/contrats/gerer", () => ({
  creerContratDansTransaction: async (_tx: unknown, champs: { signeLe: Date; lignes: unknown[] }) => {
    etat.contrats.push({ signeLe: champs.signeLe, lignes: champs.lignes });
    return { id: 9, statut: "BROUILLON", ...champs };
  },
}));

let etat: Etat;
let ecrituresAvantPanne: number;
let ecritures: number;

function faussesTables(): Prisma.TransactionClient {
  const organisation = () => ({ id: 1, etape: etat.etape, raisonSortie: null, raisonSortieCode: null, reveilLe: null });
  return {
    $queryRaw: async () => [{ id: 1 }],
    crmOrganisation: {
      findUnique: async () => organisation(),
      findUniqueOrThrow: async () => organisation(),
      updateMany: async ({ where, data }: { where: { etape: CrmEtapeCommerciale }; data: { etape?: CrmEtapeCommerciale } }) => {
        ecritures += 1;
        // Une panne au milieu : l'écriture conditionnelle ne trouve plus la ligne, comme après un changement concurrent.
        if (ecritures > ecrituresAvantPanne || where.etape !== etat.etape) return { count: 0 };
        if (data.etape) etat.etape = data.etape;
        return { count: 1 };
      },
    },
    crmProposition: {
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, true> }) => {
        etat.lecturesPropositions += 1;
        return etat.propositions.filter((v) => Object.entries(where).every(([cle, attendu]) => {
          if (attendu !== null && typeof attendu === "object") throw new Error(`Filtre non rejoué par le faux : ${cle}`);
          return v[cle as keyof Version] === attendu;
        })).map((v) => select ? Object.fromEntries(Object.keys(select).map((cle) => [cle, v[cle as keyof Version]])) : v);
      },
    },
    // Seul le recalcul des probabilités au changement d'étape écrit ici ; il ne compte pas pour ces tests. Aucune lecture des
    // opportunités n'est simulée : une conversion qui tenterait d'en gagner échouerait.
    crmOpportunite: { updateMany: async ({ data }: { data: Record<string, unknown> }) => {
      if (Object.keys(data).join() !== "probabilite") throw new Error("La conversion ne touche qu'à la probabilité des opportunités.");
      return { count: 0 };
    } },
    crmEvenement: { create: async ({ data }: { data: { resume: string; apres: Record<string, unknown> } }) => { etat.evenements.push({ resume: data.resume, apres: data.apres }); } },
  } as unknown as Prisma.TransactionClient;
}

beforeEach(() => {
  etat = { etape: "PROSPECT", evenements: [], propositions: [], lecturesPropositions: 0, opportunites: [], contrats: [] };
  ecritures = 0;
  ecrituresAvantPanne = Infinity;
  base.transaction.mockImplementation(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    const sauvegarde = structuredClone(etat);
    try { return await fn(faussesTables()); } catch (erreur) { etat = sauvegarde; throw erreur; }
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const version = (numero: number, statut: CrmStatutProposition, organisationId = 1): Version => ({ organisationId, version: numero, statut, remisePourMille: 0 });
/** Une version envoyée qui attend la réponse du client. */
const enAttente = () => { etat.propositions = [version(1, "ENVOYEE")]; };

const convertir = (etapeLue?: CrmEtapeCommerciale) =>
  transactionJournalisee((tx) => convertirEnClient(tx, { organisationId: 1, auteurId: 2, etapeLue }));

describe("convertirEnClient", () => {
  it("depuis Prospect : quatre passages, chacun journalisé à la conversion", async () => {
    const { organisation, etapesFranchies } = await convertir("PROSPECT");
    expect(organisation.etape).toBe("SIGNE");
    expect(etapesFranchies).toEqual(["POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION", "SIGNE"]);
    expect(etat.evenements.map((e) => e.resume)).toEqual([
      "Étape : Prospect vers Premiers échanges, à la conversion",
      "Étape : Premiers échanges vers Étude technique, à la conversion",
      "Étape : Étude technique vers Devis envoyé, à la conversion",
      "Étape : Devis envoyé vers Signé, à la conversion",
    ]);
    expect(etat.evenements.every((e) => e.apres.conversion === true)).toBe(true);
  });
  it("depuis Devis envoyé : un seul passage", async () => {
    etat.etape = "PROPOSITION";
    await convertir();
    expect(etat.etape).toBe("SIGNE");
    expect(etat.evenements).toHaveLength(1);
  });
  it("une étape lue périmée : 409, rien d'écrit", async () => {
    etat.etape = "POURPARLERS";
    await expect(convertir("PROSPECT")).rejects.toMatchObject({ statut: 409, message: "L'étape vient de changer. Rechargez la page." });
    expect(ecritures).toBe(0);
    expect(etat.evenements).toHaveLength(0);
  });
  it.each(["SIGNE", "EN_PRODUCTION", "PERDU", "EN_SOMMEIL", "ARRETE"] as const)("refusée depuis %s : 409, rien d'écrit", async (depuis) => {
    etat.etape = depuis;
    await expect(convertir(depuis)).rejects.toMatchObject({ statut: 409 });
    expect(ecritures).toBe(0);
  });
  it("une erreur au troisième pas annule tout : étape d'origine, aucun journal, aucune ligne d'audit", async () => {
    ecrituresAvantPanne = 2;
    await expect(convertir("PROSPECT")).rejects.toMatchObject({ statut: 409 });
    expect(ecritures).toBe(3);
    expect(etat).toMatchObject({ etape: "PROSPECT", evenements: [] });
    expect(console.log).not.toHaveBeenCalled();
  });
});

describe("convertirAvecContrat", () => {
  const signeLe = new Date("2026-11-10");
  const convertirSansProposition = (etapeLue: CrmEtapeCommerciale = "PROSPECT") => convertirAvecContrat(1, { etapeLue, signeLe, debuteLe: null }, 2);
  const ouverte = (id: number): Opportunite => ({ id, gagneeLe: null, perdueLe: null });

  it("une proposition envoyée ou en discussion bloque : 409, rien d'écrit", async () => {
    enAttente();
    etat.opportunites = [ouverte(5)];
    await expect(convertirSansProposition()).rejects.toMatchObject({ statut: 409, message: PROPOSITION_EN_ATTENTE });
    expect(ecritures).toBe(0);
    expect(etat).toMatchObject({ etape: "PROSPECT", evenements: [], contrats: [], opportunites: [ouverte(5)] });
  });
  it("sans proposition : Signé et un contrat sans ligne ; les opportunités restent ouvertes jusqu'à son activation", async () => {
    const perdue = { id: 7, gagneeLe: null, perdueLe: new Date("2026-10-01") };
    etat.opportunites = [ouverte(5), ouverte(6), perdue];
    const resultat = await convertirSansProposition();
    expect(resultat.etapesFranchies.at(-1)).toBe("SIGNE");
    expect(resultat).not.toHaveProperty("opportunitesGagnees");
    expect(etat.opportunites).toEqual([ouverte(5), ouverte(6), perdue]);
    expect(etat.evenements.some((e) => e.resume === "Opportunité gagnée")).toBe(false);
    expect(etat.contrats).toEqual([{ signeLe, lignes: [] }]);
  });
  it("un client déjà signé reçoit « déjà client », même avec une proposition en attente", async () => {
    etat.etape = "SIGNE";
    enAttente();
    await expect(convertirSansProposition("SIGNE")).rejects.toMatchObject({ statut: 409, message: refusConversion("SIGNE") });
    expect(etat).toMatchObject({ etape: "SIGNE", evenements: [], contrats: [] });
  });
  it("une seule lecture des versions, sous le verrou, statut et numéro seulement", async () => {
    await convertirSansProposition();
    expect(etat.lecturesPropositions).toBe(1);
  });
  it("dernière version refusée, une ancienne restée envoyée : rien n'attend, la conversion se fait", async () => {
    etat.propositions = [version(1, "ENVOYEE"), version(2, "REFUSEE")];
    const resultat = await convertirSansProposition();
    expect(resultat.etapesFranchies.at(-1)).toBe("SIGNE");
    expect(etat.contrats).toHaveLength(1);
  });
  it("les versions d'une autre organisation ne comptent pas", async () => {
    etat.propositions = [version(1, "ENVOYEE", 2)];
    expect((await convertirSansProposition()).etapesFranchies.at(-1)).toBe("SIGNE");
  });
  it("une version en discussion plus récente qu'une refusée bloque", async () => {
    etat.propositions = [version(1, "REFUSEE"), version(2, "EN_DISCUSSION"), version(3, "BROUILLON")];
    await expect(convertirSansProposition()).rejects.toMatchObject({ statut: 409, message: PROPOSITION_EN_ATTENTE });
    expect(etat).toMatchObject({ etape: "PROSPECT", contrats: [] });
  });
  it("une étape lue périmée annule tout : opportunités encore ouvertes, aucun contrat", async () => {
    etat.etape = "POURPARLERS";
    etat.opportunites = [ouverte(5)];
    await expect(convertirSansProposition("PROSPECT")).rejects.toMatchObject({ statut: 409 });
    expect(etat).toMatchObject({ etape: "POURPARLERS", evenements: [], contrats: [], opportunites: [ouverte(5)] });
  });
});

describe("changerEtape vers Signé, à la main (I-3)", () => {
  const passer = (vers: CrmEtapeCommerciale = "SIGNE") => changerEtape({ organisationId: 1, vers, auteurId: 2 });

  it("une proposition envoyée ou en discussion bloque : 409, rien d'écrit", async () => {
    etat.etape = "PROPOSITION";
    enAttente();
    await expect(passer()).rejects.toMatchObject({ statut: 409, message: PROPOSITION_EN_ATTENTE });
    expect(ecritures).toBe(0);
    expect(etat).toMatchObject({ etape: "PROPOSITION", evenements: [] });
  });
  it("dernière version refusée, une ancienne restée envoyée : passage en Signé accepté", async () => {
    etat.etape = "PROPOSITION";
    etat.propositions = [version(2, "REFUSEE"), version(1, "ENVOYEE")];
    expect((await passer()).etape).toBe("SIGNE");
    expect(etat.lecturesPropositions).toBe(1);
  });
  it("dernière version expirée ou acceptée : passage en Signé accepté", async () => {
    for (const statut of ["EXPIREE", "ACCEPTEE"] as const) {
      etat.etape = "PROPOSITION";
      etat.propositions = [version(1, "EN_DISCUSSION"), version(2, statut)];
      expect((await passer()).etape).toBe("SIGNE");
    }
  });
  it("seulement un brouillon : passage en Signé accepté", async () => {
    etat.etape = "PROPOSITION";
    etat.propositions = [version(1, "BROUILLON")];
    expect((await passer()).etape).toBe("SIGNE");
  });
  it("sans proposition en attente : le passage se fait, journalisé sans mention", async () => {
    etat.etape = "PROPOSITION";
    const organisation = await passer();
    expect(organisation.etape).toBe("SIGNE");
    expect(etat.evenements.map((e) => e.resume)).toEqual(["Étape : Devis envoyé vers Signé"]);
  });
  it("un client qui revient d'un cran n'est pas une signature : un avenant en attente ne bloque pas", async () => {
    etat.etape = "EN_INTEGRATION";
    enAttente();
    expect((await passer()).etape).toBe("SIGNE");
  });
  it("les autres étapes ne regardent pas les propositions", async () => {
    enAttente();
    expect((await passer("POURPARLERS")).etape).toBe("POURPARLERS");
  });
});

describe("refusConversion", () => {
  it.each(["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION"] as const)("%s se convertit", (etape) => expect(refusConversion(etape)).toBeNull());
  it("un client signé n'a rien à convertir", () => expect(refusConversion("SIGNE")).toBe("Ce client est déjà en « Signé » : rien à convertir."));
  it("une sortie repasse d'abord en Prospect", () => expect(refusConversion("PERDU")).toBe("Ce client est en « Perdu ». Repassez-le en Prospect avant de le convertir."));
  it("un contrat terminé aussi", () => expect(refusConversion("ARRETE")).toBe("Ce client est en « Contrat terminé ». Repassez-le en Prospect avant de le convertir."));
});
