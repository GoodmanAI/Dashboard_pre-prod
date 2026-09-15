/**
 * La forme du pack de configuration d'un centre (lot 4D).
 *
 * ## Ce que le pack porte, et ce qu'il ne portera jamais
 *
 * Il porte **ce qui se duplique** : les réglages qu'un centre modèle peut prêter à un
 * centre neuf. Il ne porte pas ce qui **identifie** un centre, parce que copier une
 * identité, c'est créer deux centres qui se croient le même.
 *
 * Exclus par construction, et la liste est courte exprès :
 *
 * | Exclu | Pourquoi |
 * |---|---|
 * | Tout secret, clé ou jeton | Un tableur circule par mail |
 * | `cloudOcrActif` | C'est un consentement du cabinet à ce qu'une ordonnance sorte vers un prestataire. Il se donne, il ne se recopie pas. |
 * | L'identifiant de cabinet du portail | Il désigne un cabinet et un seul |
 * | Le rattachement au logiciel du centre | Adresse et code site identifient une installation |
 * | Les codes du centre, le numéro entrant | Même raison |
 * | `reconnaissance`, `serviceEnabled` | Interrupteurs d'exploitation, pas d'installation |
 * | Le statut du centre | Il dit où en est CE centre |
 * | Toute donnée patient | Elle n'a rien à faire dans un fichier de configuration |
 *
 * ## Pourquoi un type partagé
 *
 * La route d'agrégation le produit, l'écran le consomme, et l'import s'en sert comme
 * état de référence pour décider ce qui change. Trois lecteurs, une seule description.
 */

/** Une ligne du mapping d'examens, dans les deux produits. */
export type LignePackExamen = {
  codeExamen: string;
  typeExamen: string | null;
  libelle: string | null;
  codeExamenClient: string;
  /** ⚠️ Le nom diffère selon le produit : `codeExamenInjection` chez le portail, `codeExamenClientInject` chez le robot. Ici, un seul nom. */
  codeExamenInjection: string;
  typeExamenClient: string;
  libelleClient: string;
  performed: boolean;
  /** Portail uniquement. */
  reservableEnLigne?: boolean;
  ordoOblig?: boolean;
  examenInjecte?: boolean;
  listeAttenteActive?: boolean;
};

export type PlageHoraire = { start: string; end: string };
export type JourneeHoraire = { enabled: boolean; ranges: PlageHoraire[] };

export type PackTalk = {
  userProductId: number;

  centerName: string | null;
  address: string | null;
  address2: string | null;
  centerPhone: string | null;
  centerMail: string | null;
  centerWebsite: string | null;

  voice: string | null;
  botName: string | null;
  welcomeMsg: string | null;
  emergencyOutOfHours: string | null;
  callMode: string | null;
  specificNotes: string | null;

  /**
   * `TalkSettings.options` EN ENTIER, `serviceEnabled` compris.
   *
   * ⚠️ Ne pas confondre l'agrégat et le fichier. L'agrégat est l'état courant du
   * centre : il sert à savoir ce qui change, et à renvoyer intacts les champs qu'une
   * route exige mais que le pack ne met pas dans le classeur. Le classeur, lui,
   * n'expose que `motif`, `questions` et `menstruations`.
   *
   * `options` est une seule colonne JSON, donc l'écrire remplace l'objet entier :
   * sans cette lecture, un import effacerait `serviceEnabled`, qui décide si le robot
   * décroche ou transfère tous les appels.
   */
  options: Record<string, unknown>;

  /**
   * Jamais dans le classeur, toujours dans l'agrégat.
   *
   * `POST /api/configuration` l'EXIGE en booléen et répond 400 sans lui, alors que son
   * `GET` ne le renvoie pas. L'import le relit ici et le réémet tel quel : c'est un
   * interrupteur d'exploitation, il ne se duplique pas d'un centre à l'autre.
   */
  reconnaissance: boolean;
  examsAccepted: Record<string, boolean>;
  fullPlanningNotes: Record<string, { type?: string; message?: string; phone?: string }>;
  multiExamMapping: Record<string, { enabled?: boolean; mode?: string }>;
  weeklyHours: Record<string, JourneeHoraire>;
  /**
   * `TalkSettings.exams`, **tel quel**.
   *
   * ⚠️ On ne le retype pas. Chaque ligne porte aussi `horaire`, les synonymes,
   * l'interrogatoire et le commentaire, que l'écran de mapping possède et que
   * `POST /api/configuration/mapping` reconduit par fusion sur le code NEURACORP. Les
   * figer ici les ferait disparaître au premier import.
   */
  exams: Record<string, unknown>[];

  faq: { question: string; reponse: string; categorie: string | null; enabled: boolean }[];

  sms: {
    enabledExamTypes: unknown;
    postesByType: unknown;
    reminderDays: number | null;
    cutoffHours: number | null;
    sendConfirmationSms: boolean;
  } | null;
};

export type PackKonnect = {
  userProductId: number;
  /** `ConfigKonnect` en camelCase, **sans** `cloudOcrActif`. */
  parametres: Record<string, unknown>;
  sites: { siteId: string; libelle: string; codePostal: string; adresse: string }[];
  examens: LignePackExamen[];

  /** Les domaines `ProductConfig` du portail, **sans** `konnect.ris-identite`. */
  domaines: Record<string, Record<string, unknown>>;
};

export type Pack = {
  centre: { userId: number; nom: string | null; identifiant: string };
  genereLe: string;
  talk: PackTalk | null;
  konnect: PackKonnect | null;
};
