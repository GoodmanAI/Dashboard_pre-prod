import { BlobServiceClient } from "@azure/storage-blob";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { PRODUITS } from "@/lib/produits";

/**
 * Référentiel d'examens NEURACORP — notre vocabulaire interne, commun à tous les
 * centres et indépendant de tout RIS.
 *
 * **IL VIT EN BASE DEPUIS LE 11/09/2026** (`ReferentielExamens`), plus dans un blob
 * Azure lu à chaque affichage d'écran. C'est une donnée de RÉFÉRENCE : elle change
 * quelques fois par an et ne dépend d'aucun client. La faire reposer sur une chaîne de
 * connexion présente dans l'environnement de chaque serveur, un container, un nom de
 * blob et la disponibilité d'Azure à l'instant T, c'était quatre points de rupture pour
 * une liste figée.
 *
 * Et ils ont rompu : la variable manque sur le VPS de production depuis au moins le
 * 03/09/2026 (Q35). Un nouveau client LyraeTalk arrivait donc sur un tableau vide.
 *
 * ORDRE D'AMORÇAGE, du plus spécifique au plus général :
 *
 * 1. le mapping **LyraeTalk du même client**, s'il existe — ses codes RIS sont déjà
 *    attribués, on ne les redemande pas ;
 * 2. la table `ReferentielExamens`, semée depuis un mapping de référence ;
 * 3. le blob Azure, en dernier recours et seulement s'il est configuré.
 *
 * LE BLOB N'A PAS DISPARU : il reste le moyen de RAFRAÎCHIR la table quand NEURACORP
 * publie une nomenclature. Ce qui a disparu, c'est sa présence sur le chemin critique
 * d'un écran client.
 *
 * ⚠️ **Aucune de ces sources ne remplit `codeExamenClient`**, sauf la première. Le code
 * RIS appartient au cabinet, il diffère par définition d'un centre à l'autre, et c'est
 * exactement ce que le client doit saisir. Le semer depuis un autre centre donnerait
 * des rendez-vous posés sur des codes qui n'existent pas chez lui.
 */

export type LigneReferentiel = {
  codeExamen: string;
  typeExamen: string | null;
  libelle: string | null;
  /** Colonnes du client, vides à l'amorçage : c'est lui qui les remplit. */
  codeExamenClient: string;
  codeExamenInjection: string;
  typeExamenClient: string;
  libelleClient: string;
  performed: boolean;
  reservableEnLigne: boolean;
  ordoOblig: boolean;
  examenInjecte: boolean;
  listeAttenteActive: boolean;
};

export type Referentiel = {
  lignes: LigneReferentiel[];
  /**
   * D'où viennent les lignes proposées :
   * - `talk`         : reprises du mapping LyraeTalk du même client, codes RIS compris ;
   * - `blob`         : référentiel NEURACORP, colonnes client vides ;
   * - `indisponible` : ni l'un ni l'autre.
   */
  /**
   * D'où vient la liste proposée. Affiché au client, donc jamais du jargon :
   * l'écran traduit. `referentiel` = la table semée, `talk` = son propre mapping
   * LyraeTalk, `blob` = Azure, `indisponible` = aucune source n'a répondu.
   */
  source: "talk" | "referentiel" | "blob" | "indisponible";
  /** Renseigné quand `source` vaut `indisponible` — affiché à l'utilisateur. */
  motif?: string;
};

async function streamToBuffer(
  stream?: NodeJS.ReadableStream | null,
): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function texte(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

export async function referentielNeuracorp(): Promise<Referentiel> {
  const connectionString =
    process.env.AZURE_STORAGE_CONNECTION_STRING_NEURACORP_EXAMS;
  const containerName = process.env.NEURACORP_EXAMS_CONTAINER;
  const blobName = process.env.NEURACORP_EXAMS_BLOB;

  if (!connectionString || !containerName || !blobName) {
    return {
      lignes: [],
      source: "indisponible",
      motif:
        "Le référentiel d'examens NEURACORP n'est pas accessible : la configuration " +
        "du stockage Azure est incomplète sur ce serveur.",
    };
  }

  try {
    const blob = BlobServiceClient.fromConnectionString(connectionString)
      .getContainerClient(containerName)
      .getBlobClient(blobName);
    const buffer = await streamToBuffer(
      (await blob.download()).readableStreamBody,
    );

    const classeur = XLSX.read(buffer, { type: "buffer" });
    const feuille = classeur.Sheets[classeur.SheetNames[0]];
    const brut: any[] = XLSX.utils.sheet_to_json(feuille);

    const lignes = brut
      .map((item) => ({
        codeExamen: texte(item.codeExamen),
        typeExamen: texte(item.typeExamen) || null,
        libelle: texte(item.libelle) || null,
        codeExamenClient: "",
        codeExamenInjection: "",
        typeExamenClient: "",
        libelleClient: "",
        // Tout est proposé par défaut : le client décoche ce qu'il ne pratique pas,
        // ce qui est plus rapide que de tout cocher. Même choix que LyraeTalk.
        performed: true,
        // Réservable de bout en bout par défaut. Le client décoche les examens
        // qu'il veut traiter par rappel, ce qui est le cas le moins fréquent.
        reservableEnLigne: true,
        ordoOblig: false,
        examenInjecte: false,
        listeAttenteActive: false,
      }))
      // Une ligne sans code interne ne désigne rien : le classeur contient des
      // lignes de séparation et des en-têtes intermédiaires.
      .filter((l) => l.codeExamen);

    return { lignes, source: "blob" };
  } catch (err) {
    console.error("Référentiel NEURACORP illisible :", err);
    return {
      lignes: [],
      source: "indisponible",
      motif: "Le référentiel d'examens NEURACORP n'a pas pu être lu.",
    };
  }
}

/**
 * Mapping d'examens de **LyraeTalk** pour le même client, s'il en a un.
 *
 * C'est la meilleure amorce possible pour Konnect, et de loin : un client qui a les
 * deux produits a **le même RIS, donc les mêmes codes**. Le travail d'attribution est
 * déjà fait — il ne reste qu'à cocher les trois réglages propres au parcours web
 * (ordonnance, injection, liste d'attente).
 *
 * `TalkSettings.exams` est un JSON dont la forme a varié (tableau, ou objet indexé par
 * code) ; les deux sont acceptées, comme le fait `/api/configuration/get/mapping`.
 *
 * Rien n'est copié définitivement : ces lignes sont **proposées** à l'écran, et rien
 * n'est enregistré tant que le client n'a pas validé. Les deux mappings restent
 * ensuite indépendants — modifier celui de Talk ne touchera plus celui de Konnect.
 */
export async function mappingDepuisTalk(
  userProductIdKonnect: number,
): Promise<LigneReferentiel[]> {
  const res = await db.query<{ exams: unknown }>(
    `SELECT ts."exams"
       FROM "UserProduct" konnect
       JOIN "UserProduct" talk ON talk."userId" = konnect."userId"
                              AND talk."removedAt" IS NULL
       JOIN "Product" p ON p."id" = talk."productId"
       JOIN "TalkSettings" ts ON ts."userProductId" = talk."id"
      WHERE konnect."id" = $1
        AND lower(p."name") = lower($2)
      LIMIT 1`,
    [userProductIdKonnect, PRODUITS.talk.nom],
  );

  if (!res.rowCount) return [];

  const brut = res.rows[0].exams;
  const parsed = typeof brut === "string" ? safeParse(brut) : brut;
  if (!parsed || typeof parsed !== "object") return [];

  const entrees: any[] = Array.isArray(parsed)
    ? parsed
    : Object.entries(parsed as Record<string, any>).map(([code, v]) => ({
        codeExamen: code,
        ...(v ?? {}),
      }));

  return entrees
    .map((e) => ({
      codeExamen: texte(e?.codeExamen),
      typeExamen: texte(e?.typeExamen) || null,
      libelle: texte(e?.libelle) || null,
      // Le travail déjà fait pour Talk : on le reprend tel quel.
      codeExamenClient: texte(e?.codeExamenClient),
      // LyraeTalk porte deja ce champ : on le reprend au lieu de le redemander.
      codeExamenInjection: texte(e?.codeExamenClientInject),
      typeExamenClient: texte(e?.typeExamenClient),
      libelleClient: texte(e?.libelleClient),
      performed: e?.performed !== false,
      // Propres à Konnect : jamais devinés depuis Talk, qui ne les connaît pas.
      reservableEnLigne: true,
      ordoOblig: false,
      examenInjecte: false,
      listeAttenteActive: false,
    }))
    .filter((l) => l.codeExamen);
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Le référentiel tel qu'il est stocké en base, sans aucun code client.
 *
 * C'est la source d'amorçage normale depuis le 11/09/2026. Vide tant que le semis n'a
 * pas eu lieu (`scripts/data-provisioning/2026_09_11_semer_referentiel_examens.sql`),
 * ce qui fait retomber l'appelant sur le blob : la bascule est donc sans risque même
 * si le déploiement du code précède celui de la donnée.
 */
export async function referentielEnBase(): Promise<LigneReferentiel[]> {
  const res = await db.query<{
    codeExamen: string;
    typeExamen: string | null;
    libelle: string | null;
  }>(
    `SELECT "codeExamen", "typeExamen", "libelle"
       FROM "ReferentielExamens"
      ORDER BY "typeExamen" NULLS LAST, "libelle" ASC`,
  );

  return res.rows.map((r) => ({
    codeExamen: r.codeExamen,
    typeExamen: r.typeExamen,
    libelle: r.libelle,
    // Vides, et ce n'est pas un oubli : le code RIS appartient au cabinet.
    codeExamenClient: "",
    codeExamenInjection: "",
    typeExamenClient: "",
    libelleClient: "",
    // Tout est proposé par défaut : le client décoche ce qu'il ne pratique pas, ce qui
    // est plus rapide que de tout cocher. Même choix que LyraeTalk et que le blob.
    performed: true,
    reservableEnLigne: true,
    ordoOblig: false,
    examenInjecte: false,
    listeAttenteActive: false,
  }));
}

/**
 * Amorce du mapping d'un centre jamais configuré, Konnect comme LyraeTalk.
 *
 * Trois sources, du plus spécifique au plus général : le mapping LyraeTalk du **même**
 * client (ses codes RIS sont déjà attribués), puis le référentiel en base, puis le blob
 * Azure. Les trois échouent → liste vide avec un motif explicite, pour que l'écran dise
 * ce qui se passe au lieu d'afficher un tableau muet.
 *
 * `userProductId` omis (ou sans jumeau LyraeTalk) → on saute la première source. C'est
 * le cas d'un tout nouveau client, celui que Q35 laissait sans rien.
 */
export async function amorcerMapping(
  userProductIdKonnect?: number,
): Promise<Referentiel> {
  if (userProductIdKonnect !== undefined) {
    const depuisTalk = await mappingDepuisTalk(userProductIdKonnect);
    if (depuisTalk.length > 0) {
      return { lignes: depuisTalk, source: "talk" };
    }
  }

  const enBase = await referentielEnBase();
  if (enBase.length > 0) {
    return { lignes: enBase, source: "referentiel" };
  }

  return referentielNeuracorp();
}
