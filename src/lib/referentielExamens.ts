import { BlobServiceClient } from "@azure/storage-blob";
import * as XLSX from "xlsx";

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
  typeExamenClient: string;
  libelleClient: string;
  performed: boolean;
  ordoOblig: boolean;
  examenInjecte: boolean;
  listeAttenteActive: boolean;
};

export type Referentiel = {
  lignes: LigneReferentiel[];
  /** `blob` si le référentiel a été lu, `indisponible` sinon. */
  source: "blob" | "indisponible";
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
