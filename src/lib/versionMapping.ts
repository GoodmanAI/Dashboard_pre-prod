import { createHash } from "crypto";

/**
 * Empreinte du mapping d'examens LyraeTalk d'un centre (`TalkSettings.exams`).
 * -----------------------------------------------------------------------------
 * **Pourquoi elle existe** (25/09/2026, GH Pontivy, userProductId 22). L'écran de
 * mapping renvoie les 287 lignes à chaque enregistrement, et la route les écrivait
 * sans regarder si la base avait bougé depuis le chargement. Une secrétaire a ouvert
 * l'écran vers 18 h, l'a laissé ouvert la nuit, et a enregistré à 8 h 11 : les
 * 21 lignes qu'une collègue avait corrigées entre 18 h 08 et 18 h 54 sont revenues à
 * leur ancienne valeur, sans erreur nulle part. Le dernier qui enregistre gagnait,
 * quel que soit l'âge de son onglet.
 *
 * L'écran lit cette empreinte au chargement (en-tête `X-Mapping-Version` de
 * `GET /api/configuration/get/mapping`), le pack d'installation la lit dans
 * `GET /api/admin/pack`, et tous deux la renvoient au `POST /api/configuration/mapping`,
 * qui répond 409 si elle ne correspond plus.
 *
 * POURQUOI UNE EMPREINTE DU CONTENU ET PAS `TalkSettings.updatedAt`. Toutes les routes
 * de configuration LyraeTalk écrivent la même ligne `TalkSettings` : un `updatedAt`
 * bougerait dès qu'un collègue enregistre les horaires ou l'écran Paramétrage, et
 * refuserait un mapping que personne n'a touché. L'empreinte ne change que si `exams`
 * change.
 *
 * ⚠️ Toujours la calculer sur la valeur **relue en base**, jamais sur l'objet qu'on
 * vient d'écrire : PostgreSQL range les clés d'un `jsonb` dans son propre ordre, et
 * `JSON.stringify` de l'objet envoyé ne donnerait pas la même chaîne.
 */
export function versionMapping(exams: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(exams ?? null))
    .digest("hex")
    .slice(0, 16);
}

export const EN_TETE_VERSION_MAPPING = "X-Mapping-Version";
