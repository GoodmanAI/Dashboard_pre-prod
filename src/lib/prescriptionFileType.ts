/**
 * Detection du type de fichier ordonnance par magic bytes (independant de
 * l'extension ou du Content-Type client, qui sont manipulables).
 *
 * Formats acceptes (compatibles Xplore RIS/PACS cote AI2Xplore) :
 *   - PDF : header %PDF- + trailer %%EOF dans les 1024 derniers bytes
 *   - JPEG : magic FF D8 FF
 *   - PNG : magic 89 50 4E 47 0D 0A 1A 0A
 *
 * Formats explicitement rejetes avec message dedie (photo smartphone typique
 * qu'on veut aider le patient a corriger sans le laisser dans le flou) :
 *   - HEIC : format par defaut iPhone iOS 11+, non supporte par la plupart
 *     des RIS. Message d'aide : basculer Reglages iOS > Formats > Le plus
 *     compatible.
 *   - WebP : format Android moderne, meme probleme.
 *
 * Tout autre format : rejet generique.
 */

export type SupportedFileType = "pdf" | "jpeg" | "png";

export type FileValidation =
  | {
      ok: true;
      type: SupportedFileType;
      extension: string;
      mimeType: string;
    }
  | {
      ok: false;
      reason: string;
      rejectedFormat?: string;
    };

/** Taille min plausible d'un fichier "utile" (metadonnees + un peu de contenu) */
const MIN_FILE_SIZE_BYTES = 100;

export function detectFileType(buffer: Buffer): FileValidation {
  if (buffer.length < MIN_FILE_SIZE_BYTES) {
    return { ok: false, reason: "Fichier trop petit pour etre une ordonnance." };
  }

  // ---- PDF ----
  // Header: %PDF- (5 bytes)
  // Trailer: %%EOF quelque part dans les 1024 derniers bytes
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    const tail = buffer.subarray(-1024).toString("binary");
    if (!tail.includes("%%EOF")) {
      return {
        ok: false,
        reason: "PDF invalide (marqueur %%EOF manquant).",
      };
    }
    return {
      ok: true,
      type: "pdf",
      extension: "pdf",
      mimeType: "application/pdf",
    };
  }

  // ---- JPEG ----
  // Magic: FF D8 FF (Start of Image + APP0/APP1 marker)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      ok: true,
      type: "jpeg",
      extension: "jpg",
      mimeType: "image/jpeg",
    };
  }

  // ---- PNG ----
  // Magic: 89 50 4E 47 0D 0A 1A 0A (fixe, 8 bytes)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      ok: true,
      type: "png",
      extension: "png",
      mimeType: "image/png",
    };
  }

  // ---- HEIC (iPhone) ----
  // Structure ISOBMFF : bytes 4-7 = "ftyp", bytes 8-11 = brand code
  // Brands HEIC connues : heic, heix, heim, heis, mif1, msf1
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp"
  ) {
    const brand = buffer.subarray(8, 12).toString("ascii");
    const HEIC_BRANDS = ["heic", "heix", "heim", "heis", "mif1", "msf1"];
    if (HEIC_BRANDS.includes(brand)) {
      return {
        ok: false,
        rejectedFormat: "HEIC",
        reason:
          "Format HEIC iPhone non supporte. Depuis votre iPhone : Reglages > Appareil photo > Formats > Le plus compatible, puis reprenez la photo. Ou envoyez un PDF de votre ordonnance.",
      };
    }
  }

  // ---- WebP ----
  // Container: "RIFF" (4 bytes) + size (4 bytes) + "WEBP" (4 bytes)
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return {
      ok: false,
      rejectedFormat: "WebP",
      reason:
        "Format WebP non supporte. Convertissez votre image en JPG ou PNG avant de la deposer.",
    };
  }

  return {
    ok: false,
    reason:
      "Format non reconnu. Formats acceptes : PDF, JPG, PNG.",
  };
}

/**
 * Deduit le Content-Type MIME a partir de l'extension du fichier stocke.
 * Utilise cote endpoint /download pour renvoyer le bon header aux clients
 * (AI2Xplore, browser preview eventuel).
 */
export function mimeTypeFromStoragePath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  // Fallback : octet-stream force le download cote client sans presumer du type
  return "application/octet-stream";
}
