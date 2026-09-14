import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma'
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { rejectIfSecretary } from "@/lib/authGuards";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";

/**
 * Mapping d'examens LyraeTalk d'un centre.
 *
 *   POST /api/configuration/mapping   body : { userProductId, data: [...] }
 *   GET  /api/configuration/mapping?userProductId=NN
 *
 * Consommateur unique, et session uniquement : l'écran
 * `client/c/[userId]/talk/parametrage/mapping_exam`. Le robot lit son mapping par
 * `/api/configuration/get/mapping`, jamais par ici. Aucune clé d'API n'entre.
 *
 * LES VALIDATIONS, ET POURQUOI ELLES ARRIVENT SI TARD (14/09/2026).
 * Cette route n'en avait aucune : elle acceptait n'importe quel tableau et l'écrivait
 * tel quel. Le `PUT` de `/api/konnect-examens` validait les mêmes règles depuis le
 * premier jour. L'uniformisation des deux écrans de mapping (11/09/2026) a rendu
 * l'asymétrie intenable : même composant d'import, même filtrage, mêmes gestes, et
 * deux niveaux de sévérité selon le produit. Le vocabulaire des messages est donc
 * repris mot pour mot de la route Konnect.
 *
 * CE QUI BLOQUE, ET CE QUI SE CONTENTE DE PRÉVENIR. La distinction n'est pas de
 * confort, elle vient de l'état d'un centre neuf :
 *
 * - **Bloquant** : deux lignes sur le même code NEURACORP, ou deux examens attribués
 *   au même code RIS. Dans les deux cas la configuration est contradictoire et le
 *   robot n'a aucune façon raisonnable de choisir.
 * - **Non bloquant** : un examen attribué à Lyrae sans code RIS. C'est l'état
 *   dangereux (le robot ANNONCE l'examen au patient et ne sait pas le réserver), mais
 *   c'est aussi l'état de départ de tout centre vierge, dont les 287 lignes arrivent
 *   à `performed: true` sans code. Le refuser interdirait le premier enregistrement.
 *   La route le compte, le renvoie, et l'écran le dit.
 */

/** Ce que l'écran envoie. Les autres champs sont conservés sans être relus. */
type LigneEnvoyee = {
  codeExamen: string;
  codeExamenClient: string;
  performed: boolean;
  [k: string]: any;
};

function texte(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Normalise une ligne du formulaire. Lève si elle est inexploitable.
 *
 * Seuls les trois champs que les validations regardent sont normalisés. Le reste de
 * la ligne passe inchangé : `horaire`, les synonymes, l'interrogatoire et le
 * commentaire appartiennent à l'écran, et cette route n'a pas à connaître leur forme.
 */
function normaliser(brut: any, index: number): LigneEnvoyee {
  const code = texte(brut?.codeExamen);
  if (!code) {
    // Le code NEURACORP est la clé du mapping : sans lui la ligne ne désigne rien,
    // et la fusion avec l'existant n'a plus de point d'ancrage.
    throw new Error(`Ligne ${index + 1} : code NEURACORP manquant.`);
  }
  return {
    ...brut,
    codeExamen: code,
    codeExamenClient: texte(brut?.codeExamenClient),
    // Défaut `true`, comme `/api/configuration/get/mapping` : une ligne sans réglage
    // explicite reste confiée au robot.
    performed: brut?.performed !== false,
  };
}

/**
 * Les deux règles contradictoires, dans l'ordre où elles se lisent.
 *
 * Chaque règle nomme **toutes** les valeurs fautives, pas seulement la première :
 * devant 287 lignes, un message qui n'en désigne qu'une fait recommencer autant de
 * fois qu'il y a de doublons.
 */
function contradictions(lignes: LigneEnvoyee[]): string | null {
  const vus = new Set<string>();
  const codesEnDouble = new Set<string>();
  for (const l of lignes) {
    if (vus.has(l.codeExamen)) codesEnDouble.add(l.codeExamen);
    vus.add(l.codeExamen);
  }
  if (codesEnDouble.size > 0) {
    const liste = Array.from(codesEnDouble).sort().join(", ");
    return codesEnDouble.size === 1
      ? `Le code NEURACORP « ${liste} » apparaît plusieurs fois.`
      : `Ces codes NEURACORP apparaissent plusieurs fois : ${liste}.`;
  }

  // Deux lignes ne peuvent pas viser le même code RIS : le robot ne saurait pas
  // laquelle appliquer, et la réservation deviendrait imprévisible. On ne regarde
  // que les lignes attribuées : une ligne non confiée au robot ne réserve rien, et
  // deux centres d'un même groupe peuvent légitimement réutiliser un code ailleurs.
  const codesRis = new Set<string>();
  const risEnDouble = new Set<string>();
  for (const l of lignes) {
    if (!l.codeExamenClient || !l.performed) continue;
    if (codesRis.has(l.codeExamenClient)) risEnDouble.add(l.codeExamenClient);
    codesRis.add(l.codeExamenClient);
  }
  if (risEnDouble.size > 0) {
    const liste = Array.from(risEnDouble).sort().join(", ");
    return risEnDouble.size === 1
      ? `Le code RIS « ${liste} » est attribué à deux examens différents.`
      : `Ces codes RIS sont attribués à deux examens différents : ${liste}.`;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const secretaryErr = await rejectIfSecretary();
    if (secretaryErr) return secretaryErr;

    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    const body = await req.json();
    const { userProductId, data } = body;

    if (!userProductId || !Array.isArray(data)) {
      return NextResponse.json({ error: "userProductId and data are required" }, { status: 400 });
    }

    const ownershipErr = await assertUserProductOwnership(session, Number(userProductId));
    if (ownershipErr) return ownershipErr;

    let lignes: LigneEnvoyee[];
    try {
      lignes = data.map(normaliser);
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message ?? "Ligne invalide" },
        { status: 400 }
      );
    }

    const contradiction = contradictions(lignes);
    if (contradiction) {
      return NextResponse.json({ error: contradiction }, { status: 400 });
    }

    const existing = await prisma.talkSettings.findUnique({
      where: { userProductId: Number(userProductId) },
    });

    const existingExams = Array.isArray(existing?.exams)
      ? (existing.exams as Record<string, any>[])
      : [];

    /**
     * LA FUSION SE FAIT PAR CODE NEURACORP, PLUS PAR POSITION.
     *
     * Elle lisait `existingExams[index]`, ce qui suppose que l'écran renvoie les
     * lignes dans l'ordre exact où elles ont été stockées. C'est vrai aujourd'hui,
     * l'écran envoyant toujours `data` en entier, et c'était un piège : le jour où
     * quelqu'un enverrait les lignes filtrées ou triées, chaque ligne aurait hérité
     * des champs invisibles (`horaire`, synonymes, interrogatoire) d'un AUTRE examen,
     * sans erreur nulle part. Les filtres posés le 11/09/2026 rendent ce geste
     * naturel. Le code NEURACORP est la clé du mapping, c'est donc lui qui apparie.
     */
    const parCode = new Map<string, Record<string, any>>();
    for (const ancienne of existingExams) {
      const code = texte(ancienne?.codeExamen);
      // Première occurrence gagnante : un doublon déjà stocké ne se départage pas,
      // et il ne peut plus s'en créer depuis que la validation les refuse.
      if (code && !parCode.has(code)) parCode.set(code, ancienne);
    }

    const merged = lignes.map((row) => ({
      ...(parCode.get(row.codeExamen) ?? {}),
      ...row,
    }));

    const attribues = lignes.filter((l) => l.performed && l.codeExamenClient).length;
    const attribuesSansCode = lignes.filter(
      (l) => l.performed && !l.codeExamenClient
    ).length;

    // 🔹 Upsert
    const settings = await prisma.talkSettings.upsert({
      where: { userProductId: Number(userProductId) },
      update: { exams: merged },
      create: { userProductId: Number(userProductId), exams: merged },
    });

    auditLog("data", "talk-mapping-update", {
      actor: {
        id: session.user.id,
        email: session.user.email ?? null,
        role: session.user.role,
        ip: extractIpFromRequest(req),
        userAgent: extractUserAgent(req),
      },
      target: { type: "userProduct", id: Number(userProductId) },
      metadata: { lignes: lignes.length, attribues, attribuesSansCode },
    });

    return NextResponse.json({
      success: true,
      settings,
      lignes: lignes.length,
      attribues,
      // L'écran s'en sert pour dire, après un enregistrement réussi, que le robot va
      // annoncer des examens qu'il ne sait pas réserver.
      attribuesSansCode,
    });

  } catch (error) {
    console.error("Failed to save mapping:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const userProductId = searchParams.get("userProductId");

    if (!userProductId) {
      return NextResponse.json(
        { error: "Missing userProductId parameter." },
        { status: 400 }
      );
    }

    const ownershipErr = await assertUserProductOwnership(session, Number(userProductId));
    if (ownershipErr) return ownershipErr;

    const settings = await prisma.talkSettings.findUnique({
      where: { userProductId: Number(userProductId) },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "No data found for this userProductId." },
        { status: 404 }
      );
    }

    return NextResponse.json(settings.exams, { status: 200 });
  } catch (error: any) {
    console.error("❌ Error retrieving TalkSettings:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
