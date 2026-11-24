import { describe, expect, it } from "vitest";
import { PAUSE_APRES_DEBIT_MS, PAUSE_DEBIT_MAX_MS } from "./geocoder";
import { creerFile, ECHECS_SERVICE_MAX, TAILLE_MAX_FILE, type IssueTraitement } from "./file";

/**
 * La file des géocodages, jouée avec un service simulé : `traiter` rend ce que
 * le service aurait rendu, `dormir` note les pauses sans attendre. Aucun appel
 * réseau, aucune base.
 */
function banc(reponses: (id: number) => IssueTraitement | Promise<IssueTraitement>, options: { max?: number } = {}) {
  const traites: number[] = [], pauses: number[] = [], signaux: { message: string; nombre?: number; centreId?: number }[] = [];
  const file = creerFile({
    traiter: async (id) => { traites.push(id); return reponses(id); },
    dormir: async (ms) => { pauses.push(ms); },
    signaler: (e) => signaux.push(e),
    intervalleMs: 100,
    ...options,
  });
  return { file, traites, pauses, signaux };
}
const reussi: IssueTraitement = { appel: true, echec: null };

describe("file des géocodages", () => {
  it("traite dans l'ordre, une seule fois chaque centre, en espaçant les appels", async () => {
    const { file, traites, pauses } = banc(() => reussi);
    expect(file.ajouter([1, 2, 2, 3])).toBe(3);
    expect(file.ajouter([3])).toBe(0);
    await file.attendre();
    expect(traites).toEqual([1, 2, 3]);
    expect(pauses).toEqual([100, 100, 100]);
  });
  it("sans appel au service (adresse incomplète, centre déjà traité), pas de pause", async () => {
    const { file, pauses } = banc(() => ({ appel: false }));
    file.ajouter([1, 2]);
    await file.attendre();
    expect(pauses).toEqual([]);
  });
  it("bornée : au-delà de la limite, rien n'est ajouté, et c'est signalé sans adresse", async () => {
    let liberer: () => void = () => undefined;
    const bloque = new Promise<void>((r) => { liberer = r; });
    const { file, traites, signaux } = banc(async (id) => { if (id === 0) await bloque; return reussi; }, { max: 3 });
    file.ajouter([0]); // pris en cours, il ne compte plus dans l'attente
    await Promise.resolve();
    expect(file.ajouter([1, 2, 3, 4, 5])).toBe(3);
    expect(file.enAttente()).toBe(3);
    expect(signaux).toEqual([{ message: "Géocodage : file pleine, centres laissés au rattrapage", nombre: 2 }]);
    liberer();
    await file.attendre();
    expect(traites).toEqual([0, 1, 2, 3]);
  });
  it("la borne par défaut est de 500 centres en attente", async () => {
    expect(TAILLE_MAX_FILE).toBe(500);
    let liberer: () => void = () => undefined;
    const bloque = new Promise<void>((r) => { liberer = r; });
    const { file } = banc(async (id) => { if (id === 0) await bloque; return reussi; });
    file.ajouter([0]);
    await Promise.resolve();
    expect(file.ajouter(Array.from({ length: 600 }, (_, i) => i + 1))).toBe(500);
    liberer();
    await file.attendre();
  });
  it("après un 429, la pause demandée, bornée ; sans indication, 5 secondes", async () => {
    const issues: IssueTraitement[] = [
      { appel: true, echec: "debit", pauseMs: 2_000 },
      { appel: true, echec: "debit" },
      { appel: true, echec: "debit", pauseMs: 10 * 60_000 },
      reussi,
    ];
    const { file, pauses } = banc(() => issues.shift()!);
    file.ajouter([1, 2, 3, 4]);
    await file.attendre();
    expect(pauses).toEqual([2_000, PAUSE_APRES_DEBIT_MS, PAUSE_DEBIT_MAX_MS, 100]);
  });
  it("après 5 échecs du service d'affilée, la file se vide : les centres restent à faire", async () => {
    expect(ECHECS_SERVICE_MAX).toBe(5);
    const { file, traites, signaux } = banc(() => ({ appel: true, echec: "reseau" }));
    file.ajouter([1, 2, 3, 4, 5, 6, 7, 8]);
    await file.attendre();
    expect(traites).toEqual([1, 2, 3, 4, 5]);
    expect(file.enAttente()).toBe(0);
    expect(signaux.at(-1)).toEqual({ message: "Géocodage suspendu : service injoignable", nombre: 3 });
    // La file repart pour les écritures suivantes, compteur remis à zéro.
    file.ajouter([9]);
    await file.attendre();
    expect(traites.at(-1)).toBe(9);
  });
  it("un succès, ou une réponse illisible, remet le compte des échecs à zéro", async () => {
    const issues: IssueTraitement[] = [
      ...Array.from({ length: 4 }, (): IssueTraitement => ({ appel: true, echec: "reseau" })),
      { appel: true, echec: "illisible" },
      ...Array.from({ length: 4 }, (): IssueTraitement => ({ appel: true, echec: "http" })),
      reussi,
    ];
    const { file, traites } = banc(() => issues.shift()!);
    file.ajouter(Array.from({ length: 10 }, (_, i) => i + 1));
    await file.attendre();
    expect(traites).toHaveLength(10);
  });
  it("une panne de la base pour un centre ne bloque pas les suivants", async () => {
    const { file, traites, signaux } = banc((id) => { if (id === 1) throw new TypeError("base"); return reussi; });
    file.ajouter([1, 2]);
    await file.attendre();
    expect(traites).toEqual([1, 2]);
    expect(signaux).toEqual([{ message: "Géocodage échoué", centreId: 1, cause: "TypeError" }]);
  });
  it("un centre ajouté pendant le traitement est pris à la suite", async () => {
    const { file, traites } = banc((id) => { if (id === 1) file.ajouter([2]); return reussi; });
    file.ajouter([1]);
    await file.attendre();
    expect(traites).toEqual([1, 2]);
  });
});
