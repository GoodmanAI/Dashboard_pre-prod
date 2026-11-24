import { describe, expect, it } from "vitest";
import { CONTRAT_A_SAISIR, estimeSansContrat, LIBELLE_ESTIME_CLIENT, montantDuDossier, brouillonSansContratActif, CONTRAT_EN_BROUILLON, CONTRAT_EN_BROUILLON_COURT, CONTRAT_EN_BROUILLON_SANS_DROIT, montantAffiche, recurrentSigne, type ContratPourMontant, type OpportunitePourMontant, type PropositionPourMontant } from "./montantAffiche";
import { totauxProposition } from "@/pilot/lib/propositions/regles";

const ligne = (montantCentimes: number, type: "ABONNEMENT" | "MISE_EN_SERVICE" | "PART_VARIABLE" | "PRESTATION" = "ABONNEMENT") =>
  ({ type, montantCentimes, unite: type === "PART_VARIABLE" ? "APPEL_TRAITE" as const : null });
const proposition = (version: number, statut: PropositionPourMontant["statut"], montants: number[], remisePourMille = 0): PropositionPourMontant =>
  ({ version, statut, remisePourMille, lignes: montants.map((m) => ligne(m)) });
const opportunite = (montantMensuelCentimes: number, conclue?: "gagnee" | "perdue"): OpportunitePourMontant =>
  ({ montantMensuelCentimes, gagneeLe: conclue === "gagnee" ? "2026-11-01T00:00:00.000Z" : null, perdueLe: conclue === "perdue" ? new Date("2026-11-01") : null });

describe("montantAffiche (C-70)", () => {
  it("aucune donnée : rien", () => {
    expect(montantAffiche([], [])).toBeNull();
  });
  it("une proposition en attente de réponse l'emporte sur les opportunités, avec son numéro de version", () => {
    for (const statut of ["ENVOYEE", "EN_DISCUSSION"] as const) {
      expect(montantAffiche([proposition(2, statut, [100000])], [opportunite(50000)])).toEqual({
        centimes: 100000, source: "PROPOSITION", version: 2, libelle: "proposition v2" });
    }
  });
  it("prend le total net mensuel : remise par ligne, frais d'installation et part à l'usage exclus", () => {
    const p: PropositionPourMontant = { version: 1, statut: "ENVOYEE", remisePourMille: 100,
      lignes: [ligne(10005), ligne(20001), ligne(99999, "MISE_EN_SERVICE"), ligne(5, "PART_VARIABLE")] };
    // Le même calcul que la fiche et le contrat : somme des lignes nettes, chacune arrondie.
    expect(montantAffiche([p], [])?.centimes).toBe(totauxProposition(p.lignes, 100).abonnementMensuelCentimes);
    expect(montantAffiche([p], [])?.centimes).toBe(9005 + 18001);
  });
  it("une ligne offerte et une prestation (lot S) ne comptent pas dans le montant mensuel", () => {
    const p: PropositionPourMontant = { version: 1, statut: "ENVOYEE", remisePourMille: 100,
      lignes: [ligne(10005), { ...ligne(4062), offerte: true }, ligne(150000, "PRESTATION"), { ...ligne(62500, "MISE_EN_SERVICE"), offerte: true }] };
    expect(montantAffiche([p], [])?.centimes).toBe(9005);
    // Seulement offert : pas de montant mensuel, l'estimé reste visible.
    const offert: PropositionPourMontant = { ...p, lignes: [{ ...ligne(4062), offerte: true }] };
    expect(montantAffiche([offert], [opportunite(30000)])).toMatchObject({ source: "ESTIME", centimes: 30000 });
  });
  it("une proposition refusée ou expirée ne compte plus : retour à l'estimé", () => {
    for (const statut of ["REFUSEE", "EXPIREE"] as const) {
      expect(montantAffiche([proposition(1, statut, [100000])], [opportunite(30000)])).toEqual({
        centimes: 30000, source: "ESTIME", version: null, libelle: "estimé" });
      expect(montantAffiche([proposition(1, statut, [100000])], [])).toBeNull();
    }
  });
  it("plusieurs versions : la plus récente décide, dans n'importe quel ordre", () => {
    const v1 = proposition(1, "EN_DISCUSSION", [100000]), v2 = proposition(2, "ENVOYEE", [90000]);
    expect(montantAffiche([v1, v2], [])).toMatchObject({ centimes: 90000, version: 2, libelle: "proposition v2" });
    expect(montantAffiche([v2, v1], [])).toMatchObject({ centimes: 90000, version: 2 });
  });
  it("une version récente expirée ou acceptée n'est pas remplacée par une ancienne encore envoyée", () => {
    for (const statut of ["EXPIREE", "ACCEPTEE"] as const) {
      expect(montantAffiche([proposition(1, "ENVOYEE", [100000]), proposition(2, statut, [90000])], [opportunite(40000)])).toMatchObject({ source: "ESTIME", centimes: 40000 });
    }
  });
  it("une version récente refusée n'est pas remplacée par une ancienne encore ouverte", () => {
    const v1 = proposition(1, "EN_DISCUSSION", [100000]), v2 = proposition(2, "REFUSEE", [90000]);
    expect(montantAffiche([v1, v2], [opportunite(40000)])).toMatchObject({ source: "ESTIME", centimes: 40000 });
  });
  it("une version envoyée sans abonnement n'écrase pas l'estimé : il n'y a rien à montrer encore", () => {
    expect(montantAffiche([proposition(1, "ENVOYEE", [])], [opportunite(40000)])).toMatchObject({ source: "ESTIME", centimes: 40000 });
    expect(montantAffiche([proposition(1, "ENVOYEE", [])], [])).toBeNull();
  });
  it("un brouillon est ignoré : le client ne l'a jamais vu", () => {
    expect(montantAffiche([proposition(1, "BROUILLON", [100000])], [opportunite(40000)])).toMatchObject({ source: "ESTIME", centimes: 40000 });
    expect(montantAffiche([proposition(1, "BROUILLON", [100000])], [])).toBeNull();
  });
  it("un brouillon v3 ne remplace pas la v2 envoyée", () => {
    const v2 = proposition(2, "ENVOYEE", [90000]), v3 = proposition(3, "BROUILLON", [50000]);
    expect(montantAffiche([v3, v2], [opportunite(40000)])).toEqual({ centimes: 90000, source: "PROPOSITION", version: 2, libelle: "proposition v2" });
  });
  it("une version acceptée est ignorée : son contenu est dans le contrat", () => {
    expect(montantAffiche([proposition(2, "ACCEPTEE", [100000])], [opportunite(40000)])).toMatchObject({ source: "ESTIME", centimes: 40000 });
    expect(montantAffiche([proposition(2, "ACCEPTEE", [100000])], [])).toBeNull();
    // Une ancienne version restée ouverte ne repasse pas devant l'acceptée.
    expect(montantAffiche([proposition(1, "EN_DISCUSSION", [80000]), proposition(2, "ACCEPTEE", [100000])], [])).toBeNull();
  });
  it("le récurrent signé l'emporte sur une proposition en cours et sur l'estimé", () => {
    // Un avenant à 200 € envoyé à un client qui paie 1 200 € : la carte dit 1 200 €, signé.
    expect(montantAffiche([proposition(3, "ENVOYEE", [20000])], [opportunite(40000)], 120000)).toEqual({
      centimes: 120000, source: "CONTRAT", version: null, libelle: "signé" });
  });
  it("un récurrent signé nul laisse la place à la proposition, puis à l'estimé", () => {
    expect(montantAffiche([proposition(1, "ENVOYEE", [20000])], [], 0)).toMatchObject({ source: "PROPOSITION", centimes: 20000 });
    expect(montantAffiche([], [opportunite(40000)], 0)).toMatchObject({ source: "ESTIME", centimes: 40000 });
  });
  it("sans proposition, additionne les opportunités ouvertes", () => {
    expect(montantAffiche([], [opportunite(30000), opportunite(12345)])).toEqual({
      centimes: 42345, source: "ESTIME", version: null, libelle: "estimé" });
  });
  it("ignore les opportunités gagnées ou perdues", () => {
    expect(montantAffiche([], [opportunite(30000, "gagnee"), opportunite(20000, "perdue")])).toBeNull();
    expect(montantAffiche([], [opportunite(30000, "gagnee"), opportunite(20000)])?.centimes).toBe(20000);
  });
  it("une opportunité ouverte à zéro n'est pas un montant", () => {
    expect(montantAffiche([], [opportunite(0)])).toBeNull();
  });
});

describe("montantAffiche, contrat en brouillon (C-71)", () => {
  const brouillon = { centimes: null, source: "BROUILLON", version: null, libelle: CONTRAT_EN_BROUILLON };
  it("seule source : l'écran dit de compléter et d'activer le contrat, pas d'estimer", () => {
    expect(montantAffiche([], [], 0, true)).toEqual(brouillon);
    expect(CONTRAT_EN_BROUILLON).toBe("Contrat en brouillon. Complétez ses lignes et activez-le dans l'onglet Argent.");
  });
  it("sans le droit de modifier les montants : la carte dit seulement le brouillon, la fiche dit qui peut agir", () => {
    expect(CONTRAT_EN_BROUILLON_COURT).toBe("Contrat en brouillon.");
    expect(CONTRAT_EN_BROUILLON_SANS_DROIT).toBe("Contrat en brouillon. Un compte qui modifie les montants peut le compléter et l'activer.");
  });
  it("des opportunités ouvertes restent l'estimé tant que le contrat n'est pas actif", () => {
    expect(montantAffiche([], [opportunite(124200)], 0, true)).toEqual({ centimes: 124200, source: "ESTIME", version: null, libelle: "estimé" });
  });
  it("les opportunités gagnées ne comptent plus : retour au brouillon", () => {
    expect(montantAffiche([], [opportunite(124200, "gagnee")], 0, true)).toEqual(brouillon);
  });
  it("une proposition en attente et le récurrent signé passent devant", () => {
    expect(montantAffiche([proposition(1, "ENVOYEE", [20000])], [], 0, true)).toMatchObject({ source: "PROPOSITION" });
    expect(montantAffiche([], [], 120000, true)).toMatchObject({ source: "CONTRAT", centimes: 120000 });
  });
  it("sans brouillon, rien ne change", () => expect(montantAffiche([], [], 0, false)).toBeNull());
});

describe("brouillonSansContratActif", () => {
  it("un brouillon et aucun contrat actif", () => {
    expect(brouillonSansContratActif([{ statut: "BROUILLON" }])).toBe(true);
    expect(brouillonSansContratActif([{ statut: "BROUILLON" }, { statut: "TERMINE" }])).toBe(true);
  });
  it("un contrat actif l'emporte, et sans brouillon il n'y a rien à dire", () => {
    expect(brouillonSansContratActif([{ statut: "BROUILLON" }, { statut: "ACTIF" }])).toBe(false);
    expect(brouillonSansContratActif([{ statut: "TERMINE" }])).toBe(false);
    expect(brouillonSansContratActif([])).toBe(false);
  });
});

describe("recurrentSigne", () => {
  const contrat = (statut: ContratPourMontant["statut"], lignes: ContratPourMontant["lignes"]): ContratPourMontant => ({ statut, lignes });
  it("additionne les abonnements des contrats actifs seulement", () => {
    expect(recurrentSigne([
      contrat("ACTIF", [{ type: "ABONNEMENT", montantCentimes: 100000 }, { type: "MISE_EN_SERVICE", montantCentimes: 50000 }, { type: "PART_VARIABLE", montantCentimes: 12 }]),
      contrat("ACTIF", [{ type: "ABONNEMENT", montantCentimes: 20000 }]),
      contrat("BROUILLON", [{ type: "ABONNEMENT", montantCentimes: 99999 }]),
      contrat("TERMINE", [{ type: "ABONNEMENT", montantCentimes: 88888 }]),
    ])).toBe(120000);
  });
  it("aucun contrat actif : zéro", () => {
    expect(recurrentSigne([])).toBe(0);
    expect(recurrentSigne([contrat("BROUILLON", [{ type: "ABONNEMENT", montantCentimes: 100 }])])).toBe(0);
  });
});

describe("un client sans contrat actif : estimé, contrat à saisir (D-4, C-92)", () => {
  const contrat = (statut: ContratPourMontant["statut"], montants: number[]): ContratPourMontant =>
    ({ statut, lignes: montants.map((m) => ({ type: "ABONNEMENT" as const, montantCentimes: m })) });
  const dossier = (d: Partial<Parameters<typeof estimeSansContrat>[0]>) =>
    ({ client: true, contrats: [], propositions: [], opportunites: [], ...d });
  it("un prospect, ou un client avec un contrat actif, n'a pas d'estimé", () => {
    expect(estimeSansContrat(dossier({ client: false, opportunites: [opportunite(30000)] }))).toBeNull();
    expect(estimeSansContrat(dossier({ contrats: [contrat("ACTIF", [0])], opportunites: [opportunite(30000)] }))).toBeNull();
  });
  it("l'ordre : brouillon rempli, proposition acceptée, dernière proposition, opportunités", () => {
    const toutes = { contrats: [contrat("BROUILLON", [40000, 5000])], propositions: [proposition(1, "ACCEPTEE", [20000]), proposition(2, "REFUSEE", [25000])],
      opportunites: [opportunite(30000)] };
    expect(estimeSansContrat(dossier(toutes))).toMatchObject({ centimes: 45000, source: "BROUILLON", origine: "d'après le contrat en brouillon" });
    expect(estimeSansContrat(dossier({ ...toutes, contrats: [contrat("BROUILLON", [])] })))
      .toMatchObject({ centimes: 20000, source: "PROPOSITION_ACCEPTEE", version: 1, origine: "d'après la proposition v1 acceptée" });
    expect(estimeSansContrat(dossier({ ...toutes, contrats: [], propositions: [proposition(1, "EXPIREE", [20000]), proposition(2, "BROUILLON", [99999])] })))
      .toMatchObject({ centimes: 20000, source: "PROPOSITION", version: 1 });
    expect(estimeSansContrat(dossier({ opportunites: [opportunite(30000), opportunite(10000), opportunite(5000, "perdue")] })))
      .toMatchObject({ centimes: 40000, source: "OPPORTUNITES" });
  });
  it("un contrat terminé ne compte pas comme actif", () => {
    expect(estimeSansContrat(dossier({ contrats: [contrat("TERMINE", [10000])], opportunites: [opportunite(30000)] }))?.centimes).toBe(30000);
  });
  it("rien pour estimer : zéro, et l'écran dit de saisir le contrat", () => {
    expect(estimeSansContrat(dossier({}))).toMatchObject({ centimes: 0, source: "AUCUNE" });
    expect(montantDuDossier(dossier({}))).toEqual({ centimes: null, source: "BROUILLON", version: null, libelle: CONTRAT_A_SAISIR });
  });
  it("montantDuDossier : l'estimé d'un client, sinon la règle de C-70", () => {
    expect(montantDuDossier(dossier({ opportunites: [opportunite(30000)] })))
      .toEqual({ centimes: 30000, source: "ESTIME", version: null, libelle: LIBELLE_ESTIME_CLIENT });
    expect(montantDuDossier(dossier({ contrats: [contrat("ACTIF", [12000])] }))).toMatchObject({ centimes: 12000, source: "CONTRAT", libelle: "signé" });
    expect(montantDuDossier(dossier({ client: false, propositions: [proposition(2, "ENVOYEE", [100000])] }))).toMatchObject({ source: "PROPOSITION", version: 2 });
  });
});
