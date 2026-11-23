import { Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { lireEtEvaluer, type CentreEvalue } from "@/lib/completude/lecture";
import type { Manque } from "@/lib/completude";
import type { StatutCentre } from "@/lib/centreStatut";
import { SQL_PATIENT_A_PARLE } from "@/lib/appelsSansParole";

/**
 * Le registre de complétude, vu par Pilot.
 *
 * Pilot ne recalcule rien : il lit `lireEtEvaluer` du Dashboard (registre de
 * `src/lib/completude`, criticités bloquant / degrade / confort) et le projette
 * sur les cases automatiques de sa check-list. Une seule vérité pour le parc.
 *
 * Correspondance retenue à l'intégration (plan 2026-11-pilot-dans-le-dashboard) :
 * - JETON_XPLORE et CODE_CENTRE : le rattachement au RIS (`talk.codes-centres`,
 *   `konnect.rattachement`, `konnect.ris-identite`). Le jeton lui-même vit dans
 *   AI2Xplore, que le Dashboard ne sonde pas : le code centre en est la trace.
 * - MAPPING_EXAMENS : `talk.examens-acceptes`, `talk.codes-examens`, `konnect.examens`.
 * - REGLAGES_ROBOT : aucun bloquant au registre.
 * - INTERFACAGE_TELEPHONIQUE : `talk.numero-entrant` (Konnect n'a pas de numéro).
 * - PREMIER_APPEL_REEL : une `CallConversation` où le patient a parlé et où un RDV est pris.
 */

export type EtatComplétude = {
  jetonXploreValide: boolean;
  codeCentreRattache: boolean;
  mappingExamensTermine: boolean;
  reglagesRobotValides: boolean;
  numeroPose: boolean;
  premierAppelReel: boolean;
  dernierAppelLe: Date | null;
  /** Statut du centre côté Dashboard, au vocabulaire de Pilot : EN_INTEGRATION, EN_PRODUCTION, ARRETE. */
  statutCentre: string;
  motifs: Partial<Record<keyof Omit<EtatComplétude, "motifs">, string>>;
};

const STATUT_PILOT: Record<StatutCentre, string> = {
  integration: "EN_INTEGRATION",
  production: "EN_PRODUCTION",
  arrete: "ARRETE",
};

export async function evaluerCentreProduit(userProductId: number | null): Promise<EtatComplétude | null> {
  if (userProductId === null) return null;
  return (await evaluerPlusieurs([userProductId])).get(userProductId) ?? null;
}

/** Ce qui manque parmi `cles`, en un seul texte (le premier manque suffit à dire pourquoi). */
function manqueParmi(manques: Manque[], cles: string[]): string | undefined {
  return manques.find((m) => cles.includes(m.cle))?.manque;
}

function projeter(c: CentreEvalue, appels: { dernier: Date | null; rdv: boolean }): EtatComplétude {
  const m = c.completude.manques;
  const talk = c.produit === "talk";
  const rattachement = talk ? manqueParmi(m, ["talk.codes-centres"]) : manqueParmi(m, ["konnect.rattachement", "konnect.ris-identite"]);
  const mapping = talk ? manqueParmi(m, ["talk.examens-acceptes", "talk.codes-examens"]) : manqueParmi(m, ["konnect.examens"]);
  const premierBloquant = m.find((x) => x.criticite === "bloquant")?.manque;
  const numero = talk ? manqueParmi(m, ["talk.numero-entrant"]) : undefined;
  const premierAppel = !talk
    ? "Konnect ne passe pas d'appel : la case se coche à la main."
    : appels.rdv ? undefined : appels.dernier ? "Des appels ont eu lieu, aucun RDV pris pour l'instant" : "Aucun appel reçu";
  return {
    jetonXploreValide: !rattachement,
    codeCentreRattache: !rattachement,
    mappingExamensTermine: !mapping,
    reglagesRobotValides: c.completude.bloquants === 0,
    numeroPose: !numero,
    premierAppelReel: talk && appels.rdv,
    dernierAppelLe: appels.dernier,
    statutCentre: STATUT_PILOT[c.statut] ?? "EN_INTEGRATION",
    motifs: {
      jetonXploreValide: rattachement, codeCentreRattache: rattachement, mappingExamensTermine: mapping,
      reglagesRobotValides: premierBloquant, numeroPose: numero, premierAppelReel: premierAppel,
    },
  };
}

/**
 * Le registre pour plusieurs centres à la fois. Le Dashboard lit son parc en deux
 * requêtes (une par produit), puis les appels en une : le coût ne dépend pas du
 * nombre de centres demandés. Un identifiant absent de la carte n'a pas de
 * `UserProduct` Talk ou Konnect au Dashboard.
 */
export async function evaluerPlusieurs(userProductIds: number[]): Promise<Map<number, EtatComplétude>> {
  const ids = [...new Set(userProductIds)];
  const etats = new Map<number, EtatComplétude>();
  if (ids.length === 0) return etats;
  const voulus = new Set(ids);
  const [centres, appels] = await Promise.all([
    ids.length === 1 ? lireEtEvaluer(ids[0]) : lireEtEvaluer(),
    // Compteurs seulement, aucune donnée d'appel ne sort d'ici.
    prisma.$queryRaw<Array<{ userProductId: number; dernier: Date | null; rdv: boolean }>>`
      SELECT "userProductId", max("createdAt") AS dernier,
             bool_or(COALESCE("stats"->>'rdv_booked', '0') NOT IN ('0', '', 'false', 'null')) AS rdv
      FROM "CallConversation"
      WHERE "userProductId" IN (${Prisma.join(ids)}) AND ${SQL_PATIENT_A_PARLE}
      GROUP BY "userProductId"`,
  ]);
  const appelsDe = new Map(appels.map((a) => [a.userProductId, a]));
  for (const c of centres) {
    if (!voulus.has(c.userProductId)) continue;
    const a = appelsDe.get(c.userProductId);
    etats.set(c.userProductId, projeter(c, { dernier: a?.dernier ?? null, rdv: Boolean(a?.rdv) }));
  }
  return etats;
}
