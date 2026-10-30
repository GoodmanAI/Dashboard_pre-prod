export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthOrApiKey, assertUserProductOwnership } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { PRODUITS } from "@/lib/produits";
import { amorcerMapping } from "@/lib/referentielExamens";
import { requirePagePermission, requireAnyPagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import {
  DOMAINE_SALLES_KONNECT,
  lireSallesKonnect,
  normaliserPostesExamen,
  postesPourKonnect,
  sallesOuvertesParType,
  typesSansSalleOuverte,
  typeSallesExamen,
  type SallesKonnect,
} from "@/lib/konnectSalles";

/**
 * Mapping d'examens LyraeKonnect d'un centre (lot C).
 *
 * **Même modèle que LyraeTalk** : le référentiel NEURACORP est pré-rempli, le client
 * ne remplit que les colonnes de SON RIS en face. Un nouveau centre arrive donc avec
 * toutes les lignes déjà là, à compléter — jamais sur une page blanche.
 *
 * Les deux mappings restent **séparés**, un par produit : même RIS et mêmes codes,
 * mais Konnect porte quatre réglages que le robot vocal ignore (réservable en ligne,
 * ordonnance obligatoire, injection, file d'attente), et chaque produit a son écran.
 *
 * `reservableEnLigne` est le seul endroit où se décide le chemin d'une demande
 * depuis la fin des modes de traitement (chantier `2026-09-konnect-deux-chemins`) :
 * coché, le patient réserve seul ; décoché, aucun créneau ne lui est proposé et on
 * lui offre d'être rappelé. La case ne se confond pas avec `performed`, qui dit si
 * le centre pratique l'examen : un examen non pratiqué n'est même pas reconnu.
 *
 *  GET /api/konnect-examens?userProductId=NN
 *      · session → le **mapping complet** (référentiel + saisie), pour l'écran.
 *        Jamais enregistré : si rien n'est stocké, on renvoie le référentiel avec les
 *        colonnes client vides.
 *      · clé API → le **catalogue effectif** en snake_case, pour Konnect : seulement
 *        les lignes pratiquées ET dont le code RIS est renseigné. Konnect n'a que
 *        faire des lignes non attribuées.
 *      → ETag dans les deux cas
 *  PUT /api/konnect-examens?userProductId=NN   (session uniquement)
 *      body : { examens: [...] } — remplace l'ensemble du mapping
 *
 * Cette double forme suit `/api/configuration/get/mapping` de LyraeTalk, qui sert lui
 * aussi l'écran et le robot depuis une seule route.
 */

type LigneMapping = {
  codeExamen: string;
  typeExamen: string | null;
  libelle: string | null;
  codeExamenClient: string;
  codeExamenInjection: string;
  typeExamenClient: string;
  libelleClient: string;
  performed: boolean;
  reservableEnLigne: boolean;
  ordoOblig: boolean;
  examenInjecte: boolean;
  /**
   * Salles choisies par le centre pour cet examen (26/10/2026), parmi celles que
   * l'équipe a ouvertes au portail. Vide = toutes les salles ouvertes du type.
   */
  postes: string[];
  /**
   * Case « File d'attente » (27/10/2026, plan `2026-10-file-attente-konnect`) : sans
   * créneau, le patient s'inscrit en file au lieu de demander un rappel. Sans effet,
   * et ramenée à `false` à l'écriture, si l'examen n'est pas réservable en ligne.
   */
  fileAttente: boolean;
};

const COLONNES = `"codeExamen", "typeExamen", "libelle", "codeExamenClient",
                  "codeExamenInjection", "typeExamenClient", "libelleClient",
                  "performed", "reservableEnLigne", "ordoOblig", "examenInjecte",
                  "postes", "fileAttente"`;

/** Les salles du portail (`konnect.salles`) et la version du domaine, 0 si absent. */
async function sallesDuPortail(
  userProductId: number
): Promise<{ config: SallesKonnect; version: number }> {
  const res = await db.query<{ valeur: unknown; version: number }>(
    `SELECT "valeur", "version" FROM "ProductConfig"
      WHERE "userProductId" = $1 AND "domaine" = $2 LIMIT 1`,
    [userProductId, DOMAINE_SALLES_KONNECT]
  );
  return {
    config: lireSallesKonnect(res.rows[0]?.valeur ?? null),
    version: res.rows[0]?.version ?? 0,
  };
}

async function estCentreKonnect(userProductId: number): Promise<boolean> {
  const res = await db.query<{ id: number }>(
    `SELECT up."id"
       FROM "UserProduct" up
       JOIN "Product" p ON p."id" = up."productId"
      WHERE up."id" = $1
        AND up."removedAt" IS NULL
        AND lower(p."name") = lower($2)
      LIMIT 1`,
    [userProductId, PRODUITS.konnect.nom]
  );
  return (res.rowCount ?? 0) > 0;
}

function lireUserProductId(req: NextRequest): number | null {
  const brut = Number(new URL(req.url).searchParams.get("userProductId"));
  return !brut || Number.isNaN(brut) ? null : brut;
}

/**
 * `count` + le plus récent `updatedAt` : couvre ajout, modification et suppression.
 *
 * Plus la version de `konnect.salles` (26/10/2026) : ouvrir ou fermer une salle
 * change les `postes` du catalogue sans toucher une ligne de `KonnectExamens`. Sans
 * elle, Konnect recevrait un 304 et garderait l'ancien filtre.
 */
async function signature(userProductId: number, versionSalles: number): Promise<string> {
  const res = await db.query<{ n: string; dernier: Date | null }>(
    `SELECT COUNT(*)::text AS n, MAX("updatedAt") AS dernier
       FROM "KonnectExamens" WHERE "userProductId" = $1`,
    [userProductId]
  );
  const { n, dernier } = res.rows[0];
  return `W/"${n}-${dernier ? dernier.getTime() : 0}-s${versionSalles}"`;
}

/**
 * Ce que Konnect consomme : le catalogue **effectif**, dans son vocabulaire.
 *
 * Une ligne non pratiquée, ou sans code RIS, n'est pas un examen réservable — la
 * transmettre encombrerait le portail de lignes inutilisables. Le libellé client
 * prime, avec repli sur le libellé NEURACORP : un centre qui n'a pas renommé
 * l'examen affiche notre libellé plutôt qu'un vide.
 */
function versCatalogueKonnect(lignes: LigneMapping[], salles: SallesKonnect) {
  return lignes
    .filter((l) => l.performed && l.codeExamenClient.trim())
    .map((l) => {
      // Les salles où chercher (plan `2026-10-salles-ouvertes-konnect`) : `[]` =
      // aucun filtre, `null` = aucune salle ouverte, l'examen passe au rappel.
      const postes = postesPourKonnect(
        salles,
        typeSallesExamen(l.typeExamen, l.typeExamenClient),
        l.postes
      );
      return {
      examen_code: l.codeExamenClient.trim(),
      // Le code de NOTRE referentiel. Konnect s'en sert pour retrouver l'examen
      // pivot correspondant : `referentiel_pivot_examens.code_pivot` EST ce code
      // (le pivot est genere depuis le meme classeur NEURACORP). C'est ce qui lui
      // permet d'alimenter son mapping d'entonnoir sans que le Dashboard ait a
      // connaitre ses UUID.
      code_pivot: l.codeExamen,
      code_ris_injection: l.codeExamenInjection.trim() || null,
      type_code: l.typeExamenClient.trim() || l.typeExamen || null,
      libelle: l.libelleClient.trim() || l.libelle || l.codeExamenClient.trim(),
      ordo_oblig: l.ordoOblig,
      examen_injecte: l.examenInjecte,
      // `performed` a déjà filtré : tout ce qui sort d'ici est actif.
      actif: true,
      // Le chemin de la demande. `false` → Konnect ne propose aucun créneau et
      // offre le rappel. C'est la seule chose qui distingue les deux parcours
      // depuis la fin des modes de traitement.
      reservable_en_ligne: l.reservableEnLigne && postes !== null,
      // Sans créneau, Konnect propose la file d'attente au lieu du rappel. Seulement
      // pour un examen réservable : un examen à rappel n'a pas de file (K1).
      file_attente: l.fileAttente && l.reservableEnLigne && postes !== null,
      // Les numéros de poste où Konnect cherche les créneaux et accepte une
      // réservation. `[]` = toutes les salles.
      postes: postes ?? [],
      source: "manuel",
      };
    });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }

  if (!auth.bot) {
    const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
    if (ownershipErr) return ownershipErr;

    // Cinq ecrans lisent le catalogue : le mapping, l'ordre de l'entonnoir, les
    // paires, les regles de fusion et celles de coexistence. Exiger la seule page
    // « Mapping » couperait un sous-compte qui n'a legitimement que l'une des
    // quatre autres.
    const droitErr = await requireAnyPagePermission(
      [
        PAGES.KONNECT_EXAMENS,
        PAGES.KONNECT_ENTONNOIR,
        PAGES.KONNECT_PAIRES,
        PAGES.KONNECT_REGLES_FUSION,
        PAGES.KONNECT_REGLES_COEXISTENCE,
        // « Mots du cabinet » (17/09/2026) choisit la cible d'un mot dans ce catalogue,
        // parmi les seuls examens qui ont un code. Sans cette page ici, un sous-compte
        // qui n'a que cet écran recevrait un 403 et verrait une liste vide : le défaut
        // même que la revue du 16/09 a trouvé sur six routes.
        PAGES.KONNECT_MOTS,
      ],
      "read"
    );
    if (droitErr) return droitErr;
  }

  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 }
    );
  }

  const salles = await sallesDuPortail(userProductId);
  const etag = await signature(userProductId, salles.version);
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const res = await db.query<LigneMapping>(
    `SELECT ${COLONNES} FROM "KonnectExamens"
      WHERE "userProductId" = $1
      ORDER BY "typeExamen" NULLS LAST, "libelle" ASC`,
    [userProductId]
  );

  // --- Voie de Konnect : le catalogue effectif ---
  if (auth.bot) {
    const catalogue = versCatalogueKonnect(res.rows, salles.config);
    return NextResponse.json(
      { userProductId, count: catalogue.length, examens: catalogue },
      { headers: { ETag: etag, "Cache-Control": "no-cache" } }
    );
  }

  // --- Voie de l'écran : le mapping complet ---
  // Rien d'enregistré → on amorce. D'abord sur le mapping LyraeTalk du même client
  // (même RIS, mêmes codes : le travail d'attribution est déjà fait), sinon sur le
  // référentiel NEURACORP. C'est ce qui évite la page blanche à l'ouverture d'un
  // nouveau centre — et, quand le client a déjà Talk, lui évite de tout ressaisir.
  if ((res.rowCount ?? 0) === 0) {
    const amorce = await amorcerMapping(userProductId);
    return NextResponse.json(
      {
        userProductId,
        amorce: true,
        source: amorce.source,
        motif: amorce.motif,
        examens: amorce.lignes.map((l) => ({ ...l, postes: [], fileAttente: false })),
        sallesOuvertes: sallesOuvertesParType(salles.config),
        typesFermes: typesSansSalleOuverte(salles.config),
      },
      { headers: { ETag: etag } }
    );
  }

  return NextResponse.json(
    {
      userProductId,
      amorce: false,
      source: "enregistre",
      examens: res.rows,
      // Les salles que l'équipe a ouvertes, par type, en lecture seule : le centre
      // choisit parmi elles. Le domaine `konnect.salles` lui est fermé.
      sallesOuvertes: sallesOuvertesParType(salles.config),
      // Types dont aucune salle n'est ouverte : leurs examens passent au rappel.
      typesFermes: typesSansSalleOuverte(salles.config),
    },
    { headers: { ETag: etag, "Cache-Control": "no-cache" } }
  );
}

/**
 * Normalise une ligne du formulaire. Lève si elle est inexploitable.
 *
 * `postes` et `fileAttente` absents restent `undefined` : un import de pack ou un
 * ancien écran ne les porte pas, et le PUT garde alors ceux déjà enregistrés au lieu
 * de les effacer.
 */
function normaliser(
  brut: any,
  index: number
): Omit<LigneMapping, "postes" | "fileAttente"> & {
  postes: string[] | undefined;
  fileAttente: boolean | undefined;
} {
  const code = typeof brut?.codeExamen === "string" ? brut.codeExamen.trim() : "";
  if (!code) {
    // Le code NEURACORP est la clé du mapping : sans lui la ligne ne désigne rien.
    throw new Error(`Ligne ${index + 1} : code NEURACORP manquant.`);
  }
  const texte = (v: any) => (typeof v === "string" ? v.trim() : "");
  return {
    codeExamen: code,
    typeExamen: texte(brut?.typeExamen) || null,
    libelle: texte(brut?.libelle) || null,
    codeExamenClient: texte(brut?.codeExamenClient),
    codeExamenInjection: texte(brut?.codeExamenInjection),
    typeExamenClient: texte(brut?.typeExamenClient),
    libelleClient: texte(brut?.libelleClient),
    performed: brut?.performed !== false,
    // Défaut `true`, comme la colonne : une ligne sans réglage explicite reste
    // réservable. L'inverse fermerait un catalogue entier en silence.
    reservableEnLigne: brut?.reservableEnLigne !== false,
    ordoOblig: brut?.ordoOblig === true,
    examenInjecte: brut?.examenInjecte === true,
    postes: brut?.postes === undefined ? undefined : normaliserPostesExamen(brut.postes),
    fileAttente: brut?.fileAttente === undefined ? undefined : brut.fileAttente === true,
  };
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "KONNECT_API_KEY");
  if (auth.error) return auth.error;

  if (auth.bot) {
    return NextResponse.json(
      { error: "Lecture seule pour un appel par clé API." },
      { status: 403 }
    );
  }

  const userProductId = lireUserProductId(req);
  if (userProductId === null) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }

  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return ownershipErr;

  // L'ecriture, elle, nomme une seule page : un droit accorde pour l'ordre de
  // l'entonnoir n'a pas a ouvrir le mapping.
  const droitErr = await requirePagePermission(PAGES.KONNECT_EXAMENS, "write");
  if (droitErr) return droitErr;

  if (!(await estCentreKonnect(userProductId))) {
    return NextResponse.json(
      { error: "Aucun centre LyraeKonnect pour cet identifiant" },
      { status: 404 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body?.examens)) {
    return NextResponse.json({ error: "`examens` doit être un tableau." }, { status: 400 });
  }

  let lues: ReturnType<typeof normaliser>[];
  try {
    lues = body.examens.map(normaliser);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ligne invalide" }, { status: 400 });
  }
  const anciens = await db.query<{ codeExamen: string; postes: string[] | null; fileAttente: boolean }>(
    `SELECT "codeExamen", "postes", "fileAttente" FROM "KonnectExamens" WHERE "userProductId" = $1`,
    [userProductId]
  );
  const postesAnciens = new Map(anciens.rows.map((r) => [r.codeExamen, r.postes ?? []]));
  const fileAnciens = new Map(anciens.rows.map((r) => [r.codeExamen, r.fileAttente === true]));
  const lignes: LigneMapping[] = lues.map((l) => ({
    ...l,
    postes: l.postes ?? postesAnciens.get(l.codeExamen) ?? [],
    // Un examen à rappel n'a pas de file : la case retombe, plutôt que de rester
    // cochée sans effet et de surprendre le jour où l'examen redevient réservable.
    fileAttente: l.reservableEnLigne && (l.fileAttente ?? fileAnciens.get(l.codeExamen) ?? false),
  }));

  const vus = new Set<string>();
  for (const l of lignes) {
    if (vus.has(l.codeExamen)) {
      return NextResponse.json(
        { error: `Le code NEURACORP « ${l.codeExamen} » apparaît plusieurs fois.` },
        { status: 400 }
      );
    }
    vus.add(l.codeExamen);
  }

  // Plusieurs examens peuvent partager un code RIS (30/10/2026) : le centre range
  // genou, genou droit et genou gauche sous `MRGEN-`. Konnect regroupe son catalogue
  // par code depuis C-CAT.1 (26/10) et garde le rattachement fin de chaque examen.
  // L'écran signale seulement un désaccord sur « Réservable en ligne », que Konnect
  // tranche vers le rappel.

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM "KonnectExamens" WHERE "userProductId" = $1`, [
      userProductId,
    ]);
    for (const l of lignes) {
      await client.query(
        `INSERT INTO "KonnectExamens"
           ("userProductId", "codeExamen", "typeExamen", "libelle", "codeExamenClient",
            "codeExamenInjection", "typeExamenClient", "libelleClient", "performed",
            "reservableEnLigne", "ordoOblig", "examenInjecte", "postes", "fileAttente")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          userProductId,
          l.codeExamen,
          l.typeExamen,
          l.libelle,
          l.codeExamenClient,
          l.codeExamenInjection,
          l.typeExamenClient,
          l.libelleClient,
          l.performed,
          l.reservableEnLigne,
          l.ordoOblig,
          l.examenInjecte,
          l.postes,
          l.fileAttente,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  auditLog("data", "konnect-examens-update", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: {
      lignes: lignes.length,
      attribues: lignes.filter((l) => l.performed && l.codeExamenClient.trim()).length,
      surRappel: lignes.filter(
        (l) => l.performed && l.codeExamenClient.trim() && !l.reservableEnLigne
      ).length,
    },
  });

  return NextResponse.json(
    {
      userProductId,
      lignes: lignes.length,
      attribues: lignes.filter((l) => l.performed && l.codeExamenClient.trim()).length,
      surRappel: lignes.filter(
        (l) => l.performed && l.codeExamenClient.trim() && !l.reservableEnLigne
      ).length,
    },
    {
      headers: {
        ETag: await signature(userProductId, (await sallesDuPortail(userProductId)).version),
      },
    }
  );
}
