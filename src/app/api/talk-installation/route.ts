export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { evaluerCentre, type Manque } from "@/lib/completude";
import { lireCentresTalk } from "@/lib/completude/lecture";
import type { StatutCentre } from "@/lib/centreStatut";

/**
 * Où en est l'installation de chaque centre LyraeTalk.
 *
 * Cette route portait ses propres règles, écrites en SQL au milieu des
 * jointures. Elles vivent maintenant dans le registre
 * `src/lib/completude/talk.ts`, et la lecture en base dans
 * `src/lib/completude/lecture.ts`, partagée avec `/api/completude` et la page
 * d'installation Konnect (lot 3 du plan `2026-09-completude-config-centres.md`).
 *
 * **La forme de la réponse est inchangée** : les mêmes clés, les mêmes types.
 * `manques` et `statut` s'y ajoutent, et rien n'en disparaît — la page
 * d'installation continue de fonctionner sans être modifiée, et un diff des deux
 * réponses avant et après ce changement doit être vide sur les champs communs.
 *
 * GET /api/talk-installation → session authentifiée.
 *
 * Ce qu'on ne fait PAS ici : lire quoi que ce soit chez LyraeTalk. Le robot n'a
 * aucune base et ne s'interroge pas ; tout ce qui suit se lit dans les tables du
 * Dashboard, parce que c'est lui qui en est propriétaire.
 */

type LigneInstallation = {
  userProductId: number;
  userId: number;
  clientNom: string | null;
  clientEmail: string | null;
  codesCentres: string[];
  numeros: string[];
  aDesReglages: boolean;
  botName: string | null;
  examensAttribues: number;
  aSmsConfirmation: boolean;
  aDepotOrdonnances: boolean;
  faq: number;
  /** Ajout du lot 3 : le verdict du registre, pour les blocs de la page. */
  statut: StatutCentre;
  manques: Manque[];
};

export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const centres = await lireCentresTalk();

  const lignes: LigneInstallation[] = centres.map((c) => ({
    userProductId: c.userProductId,
    userId: c.userId,
    clientNom: c.clientNom,
    clientEmail: c.clientEmail,
    codesCentres: c.config.codesCentres,
    numeros: c.config.numeros,
    aDesReglages: c.aDesReglages,
    botName: c.botName,
    // Le mapping d'examens vit dans un JSON, pas dans une table : ce compteur
    // est le nombre d'entrées portant un code client, seules à rendre un examen
    // proposable. Nom conservé pour ne pas casser la page.
    examensAttribues: c.config.examensAvecCode,
    aSmsConfirmation: c.aSmsConfirmation,
    aDepotOrdonnances: c.aDepotOrdonnances,
    faq: c.config.faq,
    statut: c.statut,
    manques: evaluerCentre(
      { produit: "talk", config: c.config },
      { userId: c.userId }
    ).manques,
  }));

  return NextResponse.json(
    { count: lignes.length, centres: lignes },
    { headers: { "Cache-Control": "no-cache" } }
  );
}
