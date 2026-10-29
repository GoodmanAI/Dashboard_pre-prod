/**
 * Recherche centrale, étage 2 : Azure OpenAI quand le catalogue ne suffit pas (R2).
 * -----------------------------------------------------------------------------
 * Ce que le modèle reçoit : la phrase, et la liste des destinations que CE compte a le
 * droit de lire (clé, libellé, genre, filtres acceptés). Rien d'autre : ni ligne de la
 * base, ni transcription, ni identifiant de centre (plan, § 4).
 *
 * Ce qu'il rend : une destination de cette liste et des filtres, par une sortie
 * contrainte (`response_format: json_schema`, `strict`). La réponse est revalidée ici :
 * une destination hors liste ou une valeur hors énumération est jetée, jamais corrigée.
 *
 * Panne, délai dépassé ou variable absente : `null`, et la barre continue sur le seul
 * catalogue en le disant (R6).
 *
 * Variables : `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_API_VERSION`
 * (défaut `2024-12-01-preview`), `RECHERCHE_LLM_DEPLOYMENT` (sans défaut : le choix du
 * modèle est à faire, voir le plan § 6 et la mémoire « Retrait des modèles Azure »).
 */
import {
  VALEURS_ETAT,
  VALEURS_ISSUE,
  VALEURS_PERIODE,
  VALEURS_TYPE,
  type CleFiltre,
  type Fiche,
  type Filtres,
} from "./moteur";

const DELAI_MS = 4000;

export type SortieEtage2 = { cle: string | null; filtres: Filtres };

export function etage2Disponible(): boolean {
  return Boolean(
    process.env.AZURE_OPENAI_ENDPOINT &&
      process.env.AZURE_OPENAI_API_KEY &&
      process.env.RECHERCHE_LLM_DEPLOYMENT
  );
}

const ENUMS: Partial<Record<CleFiltre, string[]>> = {
  periode: VALEURS_PERIODE,
  issue: VALEURS_ISSUE,
  etat: VALEURS_ETAT,
  type: VALEURS_TYPE,
};
const CLES_FILTRE: CleFiltre[] = ["periode", "examen", "type", "issue", "nom", "telephone", "texte", "etat"];

function schema(fiches: Fiche[]) {
  const filtres: Record<string, unknown> = {};
  for (const k of CLES_FILTRE) {
    filtres[k] = ENUMS[k]
      ? { type: ["string", "null"], enum: [...ENUMS[k]!, null] }
      : { type: ["string", "null"] };
  }
  return {
    name: "destination",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["cle", "filtres"],
      properties: {
        cle: { type: ["string", "null"], enum: [...fiches.map((f) => f.cle), null] },
        filtres: { type: "object", additionalProperties: false, required: CLES_FILTRE, properties: filtres },
      },
    },
  };
}

const CONSIGNE = `Tu orientes une secrétaire de centre d'imagerie médicale dans son espace client.
Elle a écrit ou dicté une phrase. Choisis la destination de la liste qui répond le mieux,
ou null si aucune ne convient. Tu ne réponds jamais à la question toi-même et tu ne calcules
aucun chiffre : tu désignes l'écran.
Remplis seulement les filtres que la destination accepte et que la phrase dit, null sinon.
periode : hier, aujourd_hui, ce_matin, cette_semaine, semaine_derniere, ce_mois, dernier_mois,
un jour de la semaine, ou une date jj/mm. type : US échographie, MG mammographie, RX radio,
MR IRM, CT scanner. examen : le nom de l'examen tel qu'il est dit. nom : le nom de famille du
patient, seulement s'il est dit. telephone : 10 chiffres commençant par 0.
Une demande d'action (annuler, supprimer, envoyer, réserver) : cle null.`;

/** Appelle le modèle ; `null` si l'étage 2 est indisponible ou que la réponse ne tient pas. */
export async function chercherEtage2(phrase: string, fiches: Fiche[]): Promise<SortieEtage2 | null> {
  if (!etage2Disponible() || !fiches.length) return null;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/+$/, "");
  const version = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
  const deploiement = process.env.RECHERCHE_LLM_DEPLOYMENT!;
  const url = `${endpoint}/openai/deployments/${encodeURIComponent(deploiement)}/chat/completions?api-version=${version}`;

  const destinations = fiches.map((f) => ({
    cle: f.cle,
    libelle: f.libelle,
    genre: f.genre,
    produit: f.produit === "talk" ? "Robot téléphonique" : "Portail patient",
    filtres: f.filtres ?? [],
  }));

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": process.env.AZURE_OPENAI_API_KEY! },
      signal: AbortSignal.timeout(DELAI_MS),
      body: JSON.stringify({
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_schema", json_schema: schema(fiches) },
        messages: [
          { role: "system", content: CONSIGNE },
          { role: "user", content: `Destinations :\n${JSON.stringify(destinations)}\n\nPhrase : ${phrase}` },
        ],
      }),
    });
    if (!r.ok) {
      console.error(`[recherche] étage 2 : Azure a répondu ${r.status}`);
      return null;
    }
    const corps = await r.json();
    const brut = JSON.parse(corps?.choices?.[0]?.message?.content ?? "null");
    return valider(brut, fiches);
  } catch (e) {
    console.error(`[recherche] étage 2 indisponible : ${(e as Error).name}`);
    return null;
  }
}

/** Revalide la sortie du modèle : tout ce qui sort de la liste ou des énumérations est jeté. */
export function valider(brut: unknown, fiches: Fiche[]): SortieEtage2 | null {
  if (!brut || typeof brut !== "object") return null;
  const { cle, filtres } = brut as { cle?: unknown; filtres?: unknown };
  const fiche = typeof cle === "string" ? fiches.find((f) => f.cle === cle) : undefined;
  if (cle !== null && !fiche) return null;
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
