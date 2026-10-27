export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth-helpers";
import {
  auditLog,
  extractIpFromRequest,
  extractUserAgent,
} from "@/lib/auditLog";
import { GESTES_KONNECT } from "@/lib/konnectFileAttente";
import {
  GESTE_RDV_LIBERE,
  appliquerGeste,
  estCentreKonnect,
  lireUserProductId,
  type Geste,
} from "@/lib/konnectFileAttenteServeur";

/**
 * Un geste du moteur de Konnect sur une inscription de la file d'attente (27/10/2026).
 *
 *  POST /api/konnect-file-attente/transition?userProductId=NN   (KONNECT_API_KEY)
 *  body : { id, version, geste, creneau?, reponseAvant?, rdvIdAttente?, rdvId? }
 *  → 200 { id, etat, version } | 409 { error, etat, version } | 400 | 404
 *
 * Konnect demande AVANT d'agir (K11) : il obtient `proposer` puis crée le RDV
 * d'attente et envoie le SMS ; il obtient `commencer_confirmation` puis valide dans
 * Xplore. Un 409 veut dire que la ligne a bougé (la secrétaire l'a traitée, ou une
 * autre passe du moteur) : Konnect abandonne ce geste et relit la file.
 *
 * Gestes : ceux de `GESTES_KONNECT` (`src/lib/konnectFileAttente.ts`) et
 * `rdv_attente_libere`. Les gestes de la secrétaire passent par l'écran, en session.
 */

const GESTES_PERMIS = new Set<string>([
  ...Object.keys(GESTES_KONNECT),
  GESTE_RDV_LIBERE,
]);

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;
  if (!auth.bot) {
    return NextResponse.json(
      {
        error:
          "Les gestes de la secrétaire passent par /api/konnect-file-attente/ecran.",
      },
      { status: 403 },
    );
  }

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json(
      { error: "Missing or invalid userProductId" },
      { status: 400 },
    );
  }
  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = Number(body?.id);
  const version = Number(body?.version);
  const geste = typeof body?.geste === "string" ? body.geste : "";
  if (!id || !Number.isInteger(version) || version < 1) {
    return NextResponse.json(
      { error: "`id` et `version` sont requis." },
      { status: 400 },
    );
  }
  if (!GESTES_PERMIS.has(geste)) {
    return NextResponse.json(
      { error: `Le geste « ${geste} » n'existe pas pour Konnect.` },
      { status: 400 },
    );
  }

  const res = await appliquerGeste(userProductId, id, geste as Geste, {
    version,
    donnees: {
      creneau: body?.creneau,
      reponseAvant: body?.reponseAvant,
      rdvIdAttente: body?.rdvIdAttente,
      rdvId: body?.rdvId,
    },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: res.erreur, etat: res.etat, version: res.version },
      { status: res.statut },
    );
  }

  // Le geste et l'état seulement : ni nom, ni créneau, ni numéro de RDV.
  auditLog("data", "konnect-file-attente-geste", {
    actor: {
      id: null,
      email: null,
      role: "konnect",
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: { geste, etat: res.etat },
  });

  return NextResponse.json({
    id: res.id,
    etat: res.etat,
    version: res.version,
  });
}
