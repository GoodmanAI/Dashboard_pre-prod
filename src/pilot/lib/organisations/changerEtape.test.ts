import { describe, expect, it } from "vitest";
import { CrmEtapeCommerciale, CrmRaisonSortie } from "@prisma/client";
import { GAGNANT_SANS_MOTIF } from "@/pilot/lib/validation/organisation";
import { forcageLibere, gagnantRetenu, messageConflitEtape, PROPOSITION_EN_ATTENTE, resumeChangementEtape, verifierChangementEtape, verifierGagnant } from "./changerEtape";

const maintenant = new Date("2026-10-26T12:00:00Z");
const demain = new Date("2026-10-27");
const garde = (depuis: CrmEtapeCommerciale, vers: CrmEtapeCommerciale, raison?: string, code?: CrmRaisonSortie, reveil?: Date | null) =>
  verifierChangementEtape(depuis, vers, raison, code, reveil, maintenant);
describe("verifierChangementEtape", () => {
  it("refuse production vers prospect", () => expect(garde("EN_PRODUCTION", "PROSPECT")).toMatchObject({ statut: 409, message: "Ce client ne peut pas passer de « En service » à « Prospect »." }));
  it.each(["PERDU", "EN_SOMMEIL"] as const)("exige raison et code en %s", (sortie) => {
    for (const raison of [undefined, "", "   "]) expect(garde("PROSPECT", sortie, raison, "TIMING", demain)).toMatchObject({ statut: 400, message: "Une sortie demande une raison." });
    expect(garde("PROSPECT", sortie, "Projet reporté", undefined, demain)).toMatchObject({ statut: 400, message: "Une sortie demande une raison et son motif." });
    expect(garde("PROSPECT", sortie, "Projet reporté", "TIMING", demain)).toBeNull();
  });
  it.each([undefined, null, new Date("2026-10-25"), new Date("2026-10-26T23:59:59Z")])("refuse le réveil absent, passé ou aujourd'hui", (reveil) =>
    expect(garde("PROSPECT", "EN_SOMMEIL", "Projet reporté", "TIMING", reveil)).toMatchObject({ statut: 400, message: "Une mise en pause demande une date de reprise." }));
  it("ignore la date de réveil de Perdu", () => expect(garde("PROSPECT", "PERDU", "Refus", "PRIX", new Date("2020-01-01"))).toBeNull());
  it.each(["PERDU", "EN_SOMMEIL", "ARRETE"] as const)("permet la reconquête depuis %s", (depuis) => expect(garde(depuis, "PROSPECT")).toBeNull());
  it.each(["PROSPECT", "PERDU", "EN_SOMMEIL"] as const)("permet une même étape sans modification (%s)", (etape) => expect(garde(etape, etape)).toBeNull());
  it("valide aussi les corrections d'une sortie", () => expect(garde("EN_SOMMEIL", "EN_SOMMEIL", "Correction", "TIMING")).toMatchObject({ statut: 400 }));
});

describe("resumeChangementEtape", () => {
  it("sans mention, le résumé ne change pas", () => expect(resumeChangementEtape("PROSPECT", "POURPARLERS")).toBe("Étape : Prospect vers Premiers échanges"));
  it("à la conversion, il le dit, sans tiret cadratin", () => {
    const resume = resumeChangementEtape("PROSPECT", "POURPARLERS", "conversion");
    expect(resume).toBe("Étape : Prospect vers Premiers échanges, à la conversion");
    expect(resume).not.toContain("—");
  });
});

describe("verifierGagnant (lot R)", () => {
  it("sans gagnant, ou en l'effaçant, rien à vérifier, quelle que soit la sortie", () => {
    expect(verifierGagnant("PROSPECT", undefined, undefined)).toBeNull();
    expect(verifierGagnant("PROSPECT", undefined, null)).toBeNull();
    expect(verifierGagnant("PERDU", "PRIX", null)).toBeNull();
  });
  it("accepte le gagnant d'une affaire perdue avec le motif Concurrent", () => expect(verifierGagnant("PERDU", "CONCURRENT", 4)).toBeNull());
  it.each(["PRIX", "PAS_DE_BUDGET", "RIS_INCOMPATIBLE", "TIMING", "SANS_REPONSE", "AUTRE", undefined] as const)("refuse le gagnant avec le motif %s", (code) =>
    expect(verifierGagnant("PERDU", code, 4)).toMatchObject({ statut: 400 }));
  it.each(["PROSPECT", "EN_SOMMEIL", "SIGNE", "ARRETE"] as const)("refuse le gagnant hors de Perdu (%s), même avec le motif Concurrent", (vers) =>
    expect(verifierGagnant(vers, "CONCURRENT", 4)).toMatchObject({ statut: 400, message: expect.not.stringContaining("—") }));
});

describe("verifierGagnant : toutes les étapes et tous les motifs", () => {
  const motifs: (CrmRaisonSortie | undefined)[] = [undefined, ...Object.values(CrmRaisonSortie)];
  const cas = Object.values(CrmEtapeCommerciale).flatMap((vers) => motifs.map((code) => [vers, code] as const));
  it.each(cas)("vers %s, motif %s, gagnant 4 : permis seulement en Perdu pour Concurrent", (vers, code) => {
    const erreur = verifierGagnant(vers, code, 4);
    if (vers === "PERDU" && code === "CONCURRENT") return expect(erreur).toBeNull();
    expect(erreur).toMatchObject({ statut: 400, message: GAGNANT_SANS_MOTIF });
  });
  it.each(cas)("vers %s, motif %s, sans gagnant ou gagnant effacé : jamais de refus", (vers, code) => {
    expect(verifierGagnant(vers, code, undefined)).toBeNull();
    expect(verifierGagnant(vers, code, null)).toBeNull();
  });
  it("le refus dit la règle, sans tiret cadratin ni demi-cadratin", () => {
    expect(GAGNANT_SANS_MOTIF).toBe("Le concurrent gagnant ne se renseigne que pour une affaire perdue avec le motif « Concurrent ».");
    for (const message of [GAGNANT_SANS_MOTIF, PROPOSITION_EN_ATTENTE]) expect(message).not.toMatch(/[\u2014\u2013]/);
  });
});

describe("gagnantRetenu", () => {
  it("en Perdu pour Concurrent, la valeur demandée est retenue", () => expect(gagnantRetenu("PERDU", "CONCURRENT", 7, 4)).toBe(7));
  it("en Perdu pour Concurrent, null efface l'enregistré", () => expect(gagnantRetenu("PERDU", "CONCURRENT", null, 4)).toBeNull());
  it("en Perdu pour Concurrent, absent (undefined) conserve l'enregistré : correction partielle", () => {
    expect(gagnantRetenu("PERDU", "CONCURRENT", undefined, 4)).toBe(4);
    expect(gagnantRetenu("PERDU", "CONCURRENT", undefined, null)).toBeNull();
  });
  it("distingue undefined de null : l'un conserve, l'autre efface", () => {
    expect(gagnantRetenu("PERDU", "CONCURRENT", undefined, 4)).not.toBe(gagnantRetenu("PERDU", "CONCURRENT", null, 4));
  });
  it.each(["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION"] as const)("la reconquête vers %s efface le gagnant, quoi qu'on demande", (vers) => {
    for (const demande of [undefined, null, 7]) expect(gagnantRetenu(vers, undefined, demande, 4)).toBeNull();
    expect(gagnantRetenu(vers, "CONCURRENT", undefined, 4)).toBeNull();
  });
  it("la mise en pause efface le gagnant, même avec le motif Concurrent", () => {
    for (const demande of [undefined, null, 7]) {
      expect(gagnantRetenu("EN_SOMMEIL", "CONCURRENT", demande, 4)).toBeNull();
      expect(gagnantRetenu("EN_SOMMEIL", "TIMING", demande, 4)).toBeNull();
    }
  });
  it.each(["PRIX", "PAS_DE_BUDGET", "RIS_INCOMPATIBLE", "TIMING", "SANS_REPONSE", "AUTRE", undefined] as const)("en Perdu avec le motif %s, le gagnant est effacé", (code) => {
    for (const demande of [undefined, null, 7]) expect(gagnantRetenu("PERDU", code, demande, 4)).toBeNull();
  });
  it.each(["SIGNE", "EN_INTEGRATION", "EN_PRODUCTION", "ARRETE"] as const)("après la signature (%s), aucun gagnant", (vers) => {
    expect(gagnantRetenu(vers, "CONCURRENT", 7, 4)).toBeNull();
  });
  it("ne retient jamais ce que verifierGagnant refuserait : les deux règles disent la même chose", () => {
    for (const vers of Object.values(CrmEtapeCommerciale)) {
      for (const code of [undefined, ...Object.values(CrmRaisonSortie)]) {
        const retenu = gagnantRetenu(vers, code, 7, 4);
        expect(retenu !== null).toBe(verifierGagnant(vers, code, 7) === null);
      }
    }
  });
});

describe("forcageLibere", () => {
  it.each(["SIGNE", "EN_INTEGRATION", "EN_PRODUCTION", "ARRETE", "PERDU", "EN_SOMMEIL"] as const)("un forçage s'efface en arrivant en %s", (vers) =>
    expect(forcageLibere(vers, "CHAUD")).toBe(true));
  it.each(["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION"] as const)("un forçage reste en %s", (vers) =>
    expect(forcageLibere(vers, "FROID")).toBe(false));
  it("sans forçage, rien à libérer, à toute étape", () => {
    for (const vers of Object.values(CrmEtapeCommerciale)) expect(forcageLibere(vers, null)).toBe(false);
  });
});

describe("messageConflitEtape", () => {
  it.each(["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION"] as const)("vers %s, seule l'étape est en cause", (vers) =>
    expect(messageConflitEtape(vers)).toBe("L'étape vient de changer. Rechargez la page."));
  it.each(["SIGNE", "EN_INTEGRATION", "EN_PRODUCTION", "ARRETE", "PERDU", "EN_SOMMEIL"] as const)("vers %s, le forçage compte aussi : le dossier a changé", (vers) =>
    expect(messageConflitEtape(vers)).toBe("Le dossier vient de changer. Rechargez la page."));
});
