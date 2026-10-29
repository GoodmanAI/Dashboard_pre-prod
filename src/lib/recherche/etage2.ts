/**
 * Recherche centrale, étage 2 : la fonction Azure `recherche_dashboard` (R2).
 * -----------------------------------------------------------------------------
 * Plan workspace `plans/2026-10-recherche-llm-et-voix.md`. Appelée par la route
 * `/api/recherche` quand l'étage 1 n'a rien trouvé, ou n'est pas sûr de lui (`SEUIL_SUR`).
 *
 * Ce que la fonction reçoit : la phrase, les produits du centre, le catalogue **complet**
 * et les valeurs permises des filtres. Le catalogue complet, et non celui du compte : il
 * forme avec les consignes un préfixe identique d'un appel à l'autre, que le cache d'Azure
 * OpenAI sert au tarif réduit. Aucune ligne de la base, aucune transcription, aucun
 * identifiant de centre (plan du lot 0, § 4).
 *
 * Ce qu'elle rend : une destination et des filtres, que `valider` revalide ici contre les
 * fiches que CE compte lit. Une destination hors de ses droits est jetée, jamais corrigée.
 *
 * Panne, délai dépassé ou variable absente : `null`, et la barre garde la réponse de
 * l'étage 1, ou dit qu'elle n'a que le catalogue (R6).
 *
 * Variables : `RECHERCHE_FONCTION_URL` (vide = étage 2 coupé), `RECHERCHE_FONCTION_CLE`
 * (clé de la fonction, en `x-functions-key` ; inutile pour `func start` en local). Le
 * modèle se choisit dans la fonction (`RECHERCHE_LLM_DEPLOYMENT` du Function App).
 */
import { CATALOGUE } from "./catalogue";
import {
  VALEURS_ETAT,
  VALEURS_ISSUE,
  VALEURS_PERIODE,
  VALEURS_TYPE,
  type CleFiltre,
  type Fiche,
  type Filtres,
  type Produit,
} from "./moteur";

// La fonction coupe à 2,5 s et relance une fois : au-delà, l'étage 1 garde la main.
const DELAI_MS = 6000;

export type Jetons = { entree: number; cache: number; sortie: number };
export type SortieEtage2 = { cle: string | null; filtres: Filtres; jetons?: Jetons };

export function etage2Disponible(): boolean {
  return Boolean(process.env.RECHERCHE_FONCTION_URL);
}

const ENUMS: Partial<Record<CleFiltre, string[]>> = {
  periode: VALEURS_PERIODE,
  issue: VALEURS_ISSUE,
  etat: VALEURS_ETAT,
  type: VALEURS_TYPE,
};

// Calculé une fois : le même texte à chaque appel, donc le même préfixe pour le cache.
const CATALOGUE_ENVOYE = CATALOGUE.map(({ cle, produit, genre, libelle, filtres, termes }) => ({
  cle,
  produit,
  genre,
  libelle,
  filtres: filtres ?? [],
  termes,
}));

/** Appelle la fonction ; `null` si l'étage 2 est coupé, en panne ou que la réponse ne tient pas. */
export async function chercherEtage2(
  phrase: string,
  fiches: Fiche[],
  produits: Produit[]
): Promise<SortieEtage2 | null> {
  if (!etage2Disponible() || !fiches.length) return null;
  const cle = process.env.RECHERCHE_FONCTION_CLE;
  try {
    const r = await fetch(process.env.RECHERCHE_FONCTION_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cle ? { "x-functions-key": cle } : {}) },
      signal: AbortSignal.timeout(DELAI_MS),
      body: JSON.stringify({ phrase, produits, catalogue: CATALOGUE_ENVOYE, valeurs: ENUMS }),
    });
    if (!r.ok) {
      console.error(`[recherche] étage 2 : la fonction a répondu ${r.status}`);
      return null;
    }
    const corps = await r.json();
    const sortie = valider(corps, fiches);
    return sortie && { ...sortie, jetons: corps?.jetons };
  } catch (e) {
    console.error(`[recherche] étage 2 indisponible : ${(e as Error).name}`);
    return null;
  }
}

/** Revalide la sortie : une fiche que le compte ne lit pas, ou une valeur hors énumération, est jetée. */
export function valider(brut: unknown, fiches: Fiche[]): SortieEtage2 | null {
  if (!brut || typeof brut !== "object") return null;
  const { cle, filtres } = brut as { cle?: unknown; filtres?: unknown };
  const fiche = typeof cle === "string" ? fiches.find((f) => f.cle === cle) : undefined;
  if (cle !== null && !fiche) return { cle: null, filtres: {} };
  const propres: Filtres = {};
  if (fiche && filtres && typeof filtres === "object") {
    const accepte = new Set(fiche.filtres ?? []);
    for (const [k, v] of Object.entries(filtres as Record<string, unknown>)) {
      const cleF = k as CleFiltre;
      if (!accepte.has(cleF) || typeof v !== "string" || !v.trim()) continue;
      if (ENUMS[cleF] && !ENUMS[cleF]!.includes(v)) continue;
      if (cleF === "telephone" && !/^0[1-9]\d{8}$/.test(v)) continue;
      propres[cleF] = v.trim().slice(0, 80);
    }
  }
  return { cle: fiche?.cle ?? null, filtres: propres };
}
