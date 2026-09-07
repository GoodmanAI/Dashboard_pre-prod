export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { evaluerCentre, type Manque } from "@/lib/completude";
import { lireCentresKonnect } from "@/lib/completude/lecture";
import type { StatutCentre } from "@/lib/centreStatut";

/**
 * Où en est l'installation de chaque centre LyraeKonnect (lot G6).
 *
 * Installer un cabinet demande cinq gestes, dans cet ordre, et chacun conditionne
 * le suivant. Ils se faisaient sur trois écrans différents, sans que personne ne
 * puisse dire d'un coup d'œil où en était un client donné. Cette route répond à
 * cette question, et à elle seule.
 *
 * **Le rattachement est obligatoire** (lot G, 28/08/2026). La console cabinet de
 * Konnect ne règle plus la configuration : un cabinet non rattaché n'a plus
 * aucune interface de paramétrage. Ce qui était une commodité est devenu un
 * prérequis, et c'est pour ça que cet écran existe.
 *
 * **Ces cinq gestes étaient écrits en SQL ici même**, au milieu d'une requête de
 * quarante lignes. Ce sont des exigences : elles sont désormais déclarées dans
 * `src/lib/completude/konnect.ts`, et cette route ne fait plus que les appliquer
 * (lot 3 du plan `2026-09-completude-config-centres.md`). La lecture est
 * partagée avec `/api/completude` et la page d'installation LyraeTalk.
 *
 * **La forme de la réponse est inchangée**, `manques` et `statut` en plus.
 *
 * GET /api/konnect-installation → session authentifiée.
 *
 * Ce qu'on ne fait PAS ici : lire quoi que ce soit chez Konnect. Le Dashboard ne
 * peut pas l'appeler (il est derrière un VPN), et n'a pas à le faire. Tout se lit
 * dans ses propres tables, dont il est propriétaire.
 */

type LigneInstallation = {
  userProductId: number;
  userId: number;
  clientNom: string | null;
  clientEmail: string | null;
  tenantId: string | null;
  aDesParametres: boolean;
  examensAttribues: number;
  examensTotal: number;
  sites: number;
  telephoneSecretariat: string | null;
  /** Rattachement au logiciel du centre, domaine `konnect.ris-identite`. */
  risBaseUrl: string | null;
  risCodeSite: string | null;
  /** Ajout du lot 3 : le verdict du registre, pour les blocs de la page. */
  statut: StatutCentre;
  manques: Manque[];
};

export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const centres = await lireCentresKonnect();

  const lignes: LigneInstallation[] = centres.map((c) => ({
    userProductId: c.userProductId,
    userId: c.userId,
    clientNom: c.clientNom,
    clientEmail: c.clientEmail,
    tenantId: c.config.tenantId,
    aDesParametres: c.config.aDesParametres,
    examensAttribues: c.config.examensAvecCode,
    examensTotal: c.examensTotal,
    sites: c.config.sitesCodesPostaux.length,
    telephoneSecretariat: c.config.telephoneSecretariat,
    risBaseUrl: c.config.risBaseUrl,
    risCodeSite: c.config.risCodeSite,
    statut: c.statut,
    manques: evaluerCentre(
      { produit: "konnect", config: c.config },
      { userId: c.userId }
    ).manques,
  }));

  return NextResponse.json(
    { count: lignes.length, centres: lignes },
    { headers: { "Cache-Control": "no-cache" } }
  );
}
