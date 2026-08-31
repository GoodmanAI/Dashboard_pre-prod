/**
 * Configuration LyraeKonnect d'un centre — défauts, normalisation, et
 * traduction vers le vocabulaire de Konnect.
 *
 * Seul endroit qui connaît la forme de `KonnectSettings`. Trois responsabilités
 * qu'il vaut mieux ne pas disperser :
 *
 * 1. **Les défauts.** Ils ne sont pas neutres : ce sont ceux de
 *    `cabinet_parametres` côté Konnect, délibérément *fail-closed*. Un centre
 *    jamais configuré ne doit déclencher aucun traitement sensible — pas d'OCR
 *    cloud, pas de questionnaire clinique, pas de choix de radiologue. Seul
 *    `ocrActif` vaut `true` : côté Konnect, `false` est le chemin PLUS contrôlé
 *    (saisie guidée, zéro langage libre), le défaut `true` préserve simplement
 *    le parcours livré.
 *
 * 2. **La normalisation.** Les valeurs arrivent d'un formulaire ou d'un JSON
 *    libre. Un booléen peut être une chaîne, un entier une chaîne vide.
 *
 * 3. **La traduction.** Le Dashboard stocke en camelCase, sa convention. Konnect
 *    lit en snake_case, la sienne (`ParametresOut`, `backend/app/cabinet/api.py`).
 *    La frontière est ici, et nulle part ailleurs.
 */

export type ModeSaisieExamen = "traditionnel" | "anatomique";

/**
 * Mode du SMS de rappel de secours, miroir de `cabinet_parametres` côté Konnect.
 * `conditionnel` n'envoie que si le patient n'a ni confirmé ni annulé ;
 * `opt_out_si_ics` se tait dès que le calendrier a été téléchargé ; `toujours`
 * est le comportement historique.
 */
export type SmsRappelMode = "conditionnel" | "opt_out_si_ics" | "toujours";

export type ConfigKonnect = {
  // Identité du centre
  logoUrl: string | null;
  depassementHonoraires: boolean;
  consignesGenerales: string | null;
  telephoneSecretariat: string | null;
  // Notifications
  envoiEmail: boolean;
  envoiSms: boolean;
  // Parcours patient
  ocrActif: boolean;
  modeSaisieExamen: ModeSaisieExamen;
  choixRadiologueActif: boolean;
  multiExamenActif: boolean;
  // Sécurité clinique
  cliniqueActif: boolean;
  poidsMaxIrmKg: number | null;
  poidsMaxScannerKg: number | null;
  // Interne technique
  cloudOcrActif: boolean;
  // Confirmation de rendez-vous (lot G4). Ces trois-là vivaient dans la console
  // cabinet de Konnect, seule interface à les porter : ils passent ici avant que
  // cette console ne ferme, sans quoi ils deviendraient inaccessibles.
  annulationDirecte: boolean;
  smsRappelMode: SmsRappelMode;
  codeCaracteristiqueConfirmationXplore: string | null;
};

/** Défauts *fail-closed*, alignés sur `cabinet_parametres` de Konnect. */
export const KONNECT_DEFAUTS: ConfigKonnect = {
  logoUrl: null,
  depassementHonoraires: false,
  consignesGenerales: null,
  telephoneSecretariat: null,
  envoiEmail: true,
  envoiSms: true,
  ocrActif: true,
  modeSaisieExamen: "traditionnel",
  choixRadiologueActif: false,
  multiExamenActif: false,
  cliniqueActif: false,
  poidsMaxIrmKg: null,
  poidsMaxScannerKg: null,
  cloudOcrActif: false,
  // Fail-closed (AB-12) : un « non » du patient ne supprime rien dans le logiciel
  // du centre tant que le cabinet ne l'a pas explicitement voulu. L'inverser par
  // défaut ferait supprimer de vrais rendez-vous chez un cabinet non paramétré.
  annulationDirecte: false,
  smsRappelMode: "conditionnel",
  codeCaracteristiqueConfirmationXplore: null,
};

/** Colonnes de `KonnectSettings`, dans l'ordre. Sert à bâtir les requêtes SQL. */
export const COLONNES_KONNECT = [
  "logoUrl",
  "depassementHonoraires",
  "consignesGenerales",
  "telephoneSecretariat",
  "envoiEmail",
  "envoiSms",
  "ocrActif",
  "modeSaisieExamen",
  "choixRadiologueActif",
  "multiExamenActif",
  "cliniqueActif",
  "poidsMaxIrmKg",
  "poidsMaxScannerKg",
  "cloudOcrActif",
  "annulationDirecte",
  "smsRappelMode",
  "codeCaracteristiqueConfirmationXplore",
] as const;

const MODES_SAISIE: ModeSaisieExamen[] = ["traditionnel", "anatomique"];
const MODES_SMS_RAPPEL: SmsRappelMode[] = ["conditionnel", "opt_out_si_ics", "toujours"];

function versBooleen(valeur: unknown, defaut: boolean): boolean {
  if (typeof valeur === "boolean") return valeur;
  if (valeur === "true") return true;
  if (valeur === "false") return false;
  return defaut;
}

function versTexte(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const propre = valeur.trim();
  return propre === "" ? null : propre;
}

/**
 * Un seuil de poids : entier ≥ 1, ou `null` si la question ne se pose pas.
 * En mode strict, une saisie invalide lève plutôt que de retomber
 * silencieusement sur `null` — un seuil qu'on croit posé et qui ne l'est pas
 * laisserait passer des RDV que le cabinet voulait bloquer.
 */
function versSeuil(valeur: unknown, champ: string, strict: boolean): number | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const n = typeof valeur === "number" ? valeur : Number(valeur);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    if (strict) {
      throw new Error(`${champ} doit être un entier supérieur ou égal à 1, ou vide.`);
    }
    return null;
  }
  return n;
}

/**
 * Ramène un objet quelconque à une configuration valide.
 *
 * `strict` (écriture) refuse les valeurs aberrantes ; sans lui (lecture d'une
 * ligne existante) on retombe sur les défauts, pour qu'une donnée héritée ne
 * rende jamais l'écran inaccessible.
 */
export function normaliserConfigKonnect(
  brut: Record<string, unknown>,
  options: { strict?: boolean } = {}
): ConfigKonnect {
  const strict = options.strict ?? false;

  const mode = brut.modeSaisieExamen;
  let modeSaisieExamen: ModeSaisieExamen = KONNECT_DEFAUTS.modeSaisieExamen;
  if (typeof mode === "string" && MODES_SAISIE.includes(mode as ModeSaisieExamen)) {
    modeSaisieExamen = mode as ModeSaisieExamen;
  } else if (mode !== undefined && mode !== null && strict) {
    throw new Error(`modeSaisieExamen doit valoir ${MODES_SAISIE.join(" ou ")}.`);
  }

  return {
    logoUrl: versTexte(brut.logoUrl),
    depassementHonoraires: versBooleen(
      brut.depassementHonoraires,
      KONNECT_DEFAUTS.depassementHonoraires
    ),
    consignesGenerales: versTexte(brut.consignesGenerales),
    telephoneSecretariat: versTexte(brut.telephoneSecretariat),
    envoiEmail: versBooleen(brut.envoiEmail, KONNECT_DEFAUTS.envoiEmail),
    envoiSms: versBooleen(brut.envoiSms, KONNECT_DEFAUTS.envoiSms),
    ocrActif: versBooleen(brut.ocrActif, KONNECT_DEFAUTS.ocrActif),
    modeSaisieExamen,
    choixRadiologueActif: versBooleen(
      brut.choixRadiologueActif,
      KONNECT_DEFAUTS.choixRadiologueActif
    ),
    multiExamenActif: versBooleen(brut.multiExamenActif, KONNECT_DEFAUTS.multiExamenActif),
    cliniqueActif: versBooleen(brut.cliniqueActif, KONNECT_DEFAUTS.cliniqueActif),
    poidsMaxIrmKg: versSeuil(brut.poidsMaxIrmKg, "poidsMaxIrmKg", strict),
    poidsMaxScannerKg: versSeuil(brut.poidsMaxScannerKg, "poidsMaxScannerKg", strict),
    cloudOcrActif: versBooleen(brut.cloudOcrActif, KONNECT_DEFAUTS.cloudOcrActif),
    annulationDirecte: versBooleen(brut.annulationDirecte, KONNECT_DEFAUTS.annulationDirecte),
    // Une valeur inconnue retombe sur `conditionnel`, le mode le plus prudent :
    // il n'envoie que si le patient n'a pas déjà répondu.
    smsRappelMode: MODES_SMS_RAPPEL.includes(brut.smsRappelMode as SmsRappelMode)
      ? (brut.smsRappelMode as SmsRappelMode)
      : KONNECT_DEFAUTS.smsRappelMode,
    codeCaracteristiqueConfirmationXplore: versTexte(brut.codeCaracteristiqueConfirmationXplore),
  };
}

/**
 * Traduit vers le vocabulaire de Konnect (snake_case), pour que le portail
 * patient consomme la réponse sans couche de conversion. Les noms sont ceux de
 * `ParametresOut` : les changer ici casse Konnect en silence.
 */
export function versPayloadKonnect(config: ConfigKonnect) {
  return {
    logo_url: config.logoUrl,
    depassement_honoraires: config.depassementHonoraires,
    consignes_generales: config.consignesGenerales,
    telephone_secretariat: config.telephoneSecretariat,
    envoi_email: config.envoiEmail,
    envoi_sms: config.envoiSms,
    ocr_actif: config.ocrActif,
    mode_saisie_examen: config.modeSaisieExamen,
    choix_radiologue_actif: config.choixRadiologueActif,
    multi_examen_actif: config.multiExamenActif,
    clinique_actif: config.cliniqueActif,
    poids_max_irm_kg: config.poidsMaxIrmKg,
    poids_max_scanner_kg: config.poidsMaxScannerKg,
    cloud_ocr_actif: config.cloudOcrActif,
    annulation_directe: config.annulationDirecte,
    sms_rappel_mode: config.smsRappelMode,
    code_caracteristique_confirmation_xplore: config.codeCaracteristiqueConfirmationXplore,
  };
}
