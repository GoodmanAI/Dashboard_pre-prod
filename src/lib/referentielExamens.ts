import { BlobServiceClient } from "@azure/storage-blob";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { PRODUITS } from "@/lib/produits";

/**
 * Référentiel d'examens NEURACORP — notre vocabulaire interne, commun à tous les
 * centres et indépendant de tout RIS.
 *
 * Il vit dans un blob Azure (un classeur Excel), déjà utilisé par
 * `/api/data/exams` et `/api/configuration/get/mapping` pour LyraeTalk. Ce module
 * existe pour deux raisons :
 *
 * 1. **`/api/data/exams` renvoie du CSV**, pas du JSON — pratique pour un export,
 *    inutilisable pour amorcer un écran. (L'écran de mapping de LyraeTalk appelle
 *    pourtant `.json()` dessus en repli : ce chemin échouerait s'il était emprunté.
 *    Il ne l'est jamais en pratique, `TalkSettings` existant toujours.)
 * 2. **L'amorçage doit dégrader proprement.** Si la variable de connexion manque,
 *    on renvoie une liste vide et une `source` explicite, pour que l'écran dise ce
 *    qui se passe au lieu d'afficher un tableau vide sans explication.
 *
 * Le blob est lu à chaque appel : il ne change qu'à la main, et l'amorçage n'a lieu
 * qu'à l'ouverture d'un centre jamais configuré.
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
  source: "talk" | "blob" | "indisponible";
  /** Renseigné quand `source` vaut `indisponible` — affiché à l'utilisateur. */
  motif?: string;
};

async function streamToBuffer(stream?: NodeJS.ReadableStream | null): Promise<Buffer> {
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
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING_NEURACORP_EXAMS;
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
    const buffer = await streamToBuffer((await blob.download()).readableStreamBody);

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
  userProductIdKonnect: number
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
    [userProductIdKonnect, PRODUITS.talk.nom]
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
 * Amorce du mapping d'un centre Konnect jamais configuré.
 *
 * Ordre de préférence : le mapping LyraeTalk du même client d'abord (codes RIS déjà
 * attribués), le référentiel NEURACORP ensuite. Un client qui n'a que Konnect et un
 * serveur sans configuration Azure aboutit à une liste vide — dite explicitement,
 * plutôt qu'un tableau muet.
 */
export async function amorcerMapping(userProductIdKonnect: number): Promise<Referentiel> {
  const depuisTalk = await mappingDepuisTalk(userProductIdKonnect);
  if (depuisTalk.length > 0) {
    return { lignes: depuisTalk, source: "talk" };
  }
  return referentielNeuracorp();
}
