import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma'
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { versionMapping } from "@/lib/versionMapping";

/**
 * Mapping d'examens LyraeTalk d'un centre.
 *
 *   POST /api/configuration/mapping   body : { userProductId, data: [...], version }
 *        `version` : l'empreinte lue au chargement, 409 si le mapping a changé depuis
 *        (voir `src/lib/versionMapping.ts`)
 *   GET  /api/configuration/mapping?userProductId=NN
 *
 * Consommateur unique, et session uniquement : l'écran
 * `client/c/[userId]/talk/parametrage/mapping_exam`. Le robot lit son mapping par
 * `/api/configuration/get/mapping`, jamais par ici. Aucune clé d'API n'entre.
 *
 * LES VALIDATIONS, ET POURQUOI ELLES ARRIVENT SI TARD (14/09/2026).
 * Cette route n'en avait aucune : elle acceptait n'importe quel tableau et l'écrivait
 * tel quel, là où le `PUT` de `/api/konnect-examens` refusait les configurations
 * contradictoires depuis le premier jour. L'uniformisation des deux écrans de mapping
 * (11/09/2026) a rendu l'asymétrie intenable : même composant d'import, même filtrage,
 * mêmes gestes, et deux niveaux de sévérité selon le produit. Le vocabulaire des
 * messages est donc repris mot pour mot de la route Konnect.
 *
 * MAIS UNE SEULE DES DEUX RÈGLES DE KONNECT S'APPLIQUE ICI, et c'est la leçon du lot.
 * Les deux avaient été reprises ; l'audit de production a montré que la seconde
 * (« un code RIS ne sert qu'à un examen ») interdisait la configuration normale de
 * dix centres en service. Voir l'encadré dans `contradictions()`.
 *
 * CE QUI BLOQUE, ET CE QUI SE CONTENTE DE PRÉVENIR. La distinction n'est pas de
 * confort, elle vient de l'état d'un centre neuf :
 *
 * - **Bloquant** : deux lignes sur le même code NEURACORP. C'est la clé du mapping,
 *   deux lignes sur la même clé sont contradictoires et le robot n'a aucune façon
 *   raisonnable de choisir. Plus une ligne sans code NEURACORP du tout.
 * - **Non bloquant** : un examen attribué à Lyrae sans code RIS. C'est l'état
 *   dangereux (le robot ANNONCE l'examen au patient et ne sait pas le réserver), mais
 *   c'est aussi l'état de départ de tout centre vierge, dont les 287 lignes arrivent
 *   à `performed: true` sans code. Le refuser interdirait le premier enregistrement.
 *   La route le compte, le renvoie, et l'écran le dit.
 * - **Pas une règle du tout** : plusieurs examens sur un même code RIS. Le modèle du
 *   RIS l'exige (`MAIN` sert à cinq examens chez Pontivy).
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
 * La seule configuration contradictoire que cette route refuse.
 *
 * Elle nomme **tous** les codes fautifs, pas seulement le premier : devant 287 lignes,
 * un message qui n'en désigne qu'un fait recommencer autant de fois qu'il y a de
 * doublons.
 *
 * Lire l'encadré plus bas avant d'en ajouter une seconde par symétrie avec Konnect.
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

  /**
   * ⚠️ IL N'Y A PAS DE SECONDE RÈGLE, ET C'EST LE POINT À NE PAS « CORRIGER ».
   *
   * `PUT /api/konnect-examens` refuse qu'un même code RIS soit attribué à deux
   * examens. Cette route l'a refusé aussi pendant une heure, le 14/09/2026, par
   * symétrie. **C'était faux, et l'audit de production l'a montré avant la mise en
   * service** : 223 groupes de lignes partagent un code RIS chez les centres en
   * service. Ce n'est pas de la donnée sale, c'est le modèle du RIS. Pontivy attribue
   * `MAIN` à cinq examens (main droite, main gauche, les deux…), `PIED` à cinq,
   * `AVTBRAS` à deux : le code RIS désigne l'examen générique, la latéralité vit
   * ailleurs.
   *
   * POURQUOI LA RÈGLE EST JUSTE CHEZ KONNECT ET FAUSSE ICI. Ce n'est pas une question
   * de rigueur, c'est le SENS DE LA LECTURE :
   *
   * - LyraeTalk lit `codeExamen` → `codeExamenClient` (`getExamCodes.js` :
   *   `data[rdv.internal_code]`). La clé est le code NEURACORP, l'entrée est unique,
   *   et le partage d'un code RIS ne crée aucune ambiguïté.
   * - Konnect lit dans l'autre sens : `versCatalogueKonnect` émet le code RIS comme
   *   `examen_code`, c'est-à-dire comme l'IDENTITÉ de l'examen réservable. Deux lignes
   *   sur le même code y produisent deux entrées de catalogue indistinguables, et le
   *   portail demande le côté séparément.
   *
   * Deux produits, deux façons de porter la latéralité, donc une règle qui ne se
   * partage pas. La seule lecture inverse côté Talk est
   * `POST /api/configuration/get/mapping/getLibelle` (code RIS → libellé, premier
   * trouvé), et son ambiguïté est inhérente : le RIS ne rend que `MAIN`, aucune
   * configuration ne peut lui faire rendre « main droite ».
   */

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const droitEcritureErr = await requirePagePermission(PAGES.MAPPING_EXAM, "write");
    if (droitEcritureErr) return droitEcritureErr;

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

    /**
     * UN ONGLET PÉRIMÉ N'ÉCRASE PLUS LE TRAVAIL D'UN COLLÈGUE (25/09/2026).
     *
     * L'appelant renvoie l'empreinte du mapping qu'il a chargé. Si la base a changé
     * depuis, on refuse : l'écran envoie les 287 lignes, et les écrire remettrait
     * chaque ligne modifiée entre-temps à l'état de son chargement. C'est ce qui a
     * effacé 21 lignes chez GH Pontivy (voir `versionMapping.ts`).
     *
     * Une empreinte ABSENTE est refusée aussi, et c'est voulu : c'est ce qu'envoie un
     * onglet ouvert avant ce déploiement, soit exactement l'onglet dangereux.
     *
     * La lecture, la comparaison et l'écriture se font dans une transaction qui
     * verrouille la ligne : sans verrou, deux enregistrements simultanés liraient la
     * même empreinte et passeraient tous les deux.
     */
    const versionAttendue = typeof body.version === "string" ? body.version : null;
    const upId = Number(userProductId);

    const resultat = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TalkSettings" WHERE "userProductId" = ${upId} FOR UPDATE`;
      const existing = await tx.talkSettings.findUnique({ where: { userProductId: upId } });

      if (versionAttendue !== versionMapping(existing?.exams ?? null)) {
        return { conflit: true as const };
      }

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

      // 🔹 Upsert
      const settings = await tx.talkSettings.upsert({
        where: { userProductId: upId },
        update: { exams: merged },
        create: { userProductId: upId, exams: merged },
      });
      return { conflit: false as const, settings };
    });

    if (resultat.conflit) {
      auditLog("data", "talk-mapping-update", {
        actor: {
          id: session.user.id,
          email: session.user.email ?? null,
          role: session.user.role,
          ip: extractIpFromRequest(req),
          userAgent: extractUserAgent(req),
        },
        target: { type: "userProduct", id: upId },
        success: false,
        errorReason: versionAttendue ? "mapping-modifie-entre-temps" : "version-absente",
      });
      return NextResponse.json(
        {
          error: versionAttendue
            ? "Quelqu'un a enregistré ce mapping depuis que vous avez ouvert la page. Rien n'a été écrit. Rechargez la page pour voir ses changements, puis refaites les vôtres."
            : "Cette page a été ouverte avant une mise à jour du Dashboard. Rien n'a été écrit. Rechargez la page, puis refaites vos changements.",
        },
        { status: 409 }
      );
    }
    const { settings } = resultat;

    const attribues = lignes.filter((l) => l.performed && l.codeExamenClient).length;
    const attribuesSansCode = lignes.filter(
      (l) => l.performed && !l.codeExamenClient
    ).length;

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
      // La nouvelle empreinte, calculée sur ce que la base a rendu : l'écran la garde
      // pour son prochain enregistrement sans avoir à recharger.
      version: versionMapping(settings.exams),
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

    const droitErr = await requirePagePermission(PAGES.MAPPING_EXAM, "read");
    if (droitErr) return droitErr;

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
