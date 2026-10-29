export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";

/**
 * Dictée de la recherche centrale (plan workspace `plans/2026-10-recherche-llm-et-voix.md`, § 2).
 *
 * GET  /api/recherche/voix  → { disponible } : le bouton micro ne s'affiche que si oui.
 * POST /api/recherche/voix  (corps : l'extrait audio du navigateur, webm/opus ou mp4)
 *                           → { texte }
 *
 * Relais vers Deepgram (`/v1/listen`, `nova-3`, français), le même compte que LyraeTalk :
 * la clé reste sur le serveur, jamais dans le navigateur. Session obligatoire, comme toute
 * route `/api`. **Rien n'est gardé** : ni l'audio, ni le texte, ni dans le journal (la
 * phrase peut porter un nom de patient). Le texte revient dans la barre, où la secrétaire
 * le relit et le corrige ; la recherche suit le même chemin qu'au clavier.
 *
 * Variables : `DEEPGRAM_API_KEY` (vide = pas de micro), `DEEPGRAM_MODEL` (défaut `nova-3`).
 */

const OCTETS_MAX = 1_000_000; // environ 60 s d'opus : la barre coupe à 20 s
const DELAI_MS = 10_000;
const TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a)\b/;

// Le vocabulaire du centre, que Deepgram doit préférer à un mot proche (« mammo » et non
// « mamo », « Konnect » et non « connecte »). Même principe que `sttKeyterms.js` de LyraeTalk.
const MOTS_DU_METIER = [
  "mammographie", "échographie", "IRM", "scanner", "radiographie", "doppler", "Konnect",
  "Xplore", "ordonnance", "questionnaire", "transcription", "rendez-vous", "secrétariat",
  "créneau", "relance", "Paramétrage",
];

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  return NextResponse.json({ disponible: Boolean(process.env.DEEPGRAM_API_KEY) });
}

export async function POST(req: NextRequest) {
  const debut = Date.now();
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const cle = process.env.DEEPGRAM_API_KEY;
  if (!cle) {
    return NextResponse.json({ error: "La dictée n'est pas activée. Tapez votre recherche." }, { status: 503 });
  }
  const type = req.headers.get("content-type") ?? "";
  if (!TYPES.test(type)) {
    return NextResponse.json({ error: "Format audio non reconnu. Tapez votre recherche." }, { status: 415 });
  }
  const audio = await req.arrayBuffer();
  if (!audio.byteLength) {
    return NextResponse.json({ error: "Aucun son reçu. Réessayez en parlant près du micro." }, { status: 400 });
  }
  if (audio.byteLength > OCTETS_MAX) {
    return NextResponse.json({ error: "L'enregistrement est trop long. Dites votre recherche en une phrase." }, { status: 413 });
  }

  const params = new URLSearchParams({
    model: process.env.DEEPGRAM_MODEL || "nova-3",
    language: "fr",
    smart_format: "true",
  });
  for (const mot of MOTS_DU_METIER) params.append("keyterm", mot);

  let texte = "";
  try {
    const r = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: { Authorization: `Token ${cle}`, "Content-Type": type.split(";")[0] },
      body: audio,
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (!r.ok) {
      console.error(`[recherche] voix : Deepgram a répondu ${r.status}`);
      return NextResponse.json({ error: "La dictée ne répond pas pour le moment. Tapez votre recherche." }, { status: 502 });
    }
    const corps = await r.json();
    texte = String(corps?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
  } catch (e) {
    console.error(`[recherche] voix indisponible : ${(e as Error).name}`);
    return NextResponse.json({ error: "La dictée ne répond pas pour le moment. Tapez votre recherche." }, { status: 502 });
  }

  // Le compte, jamais le texte.
  console.log(
    JSON.stringify({
      recherche_voix: true,
      actorId: auth.session.user.id,
      octets: audio.byteLength,
      compris: Boolean(texte),
      dureeMs: Date.now() - debut,
    })
  );
  return NextResponse.json({ texte: texte.slice(0, 300) }, { headers: { "Cache-Control": "no-store" } });
}
