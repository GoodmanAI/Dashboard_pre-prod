import { cheminCentre } from "@/lib/cheminsCentre";
import { EXAM_TYPE_KEYS, type ExamTypeKey } from "@/lib/smsConfirmationConfig";
import type { Exigence } from "./types";
import {
  estAdresseMail,
  estNumeroEntrant,
  estNumeroSortant,
  renseigne,
} from "./validateurs";

/**
 * Ce qu'un centre LyraeTalk doit avoir pour fonctionner.
 *
 * **Périmètre : ce qui est effectivement stocké dans le Dashboard aujourd'hui.**
 * Une exigence qui porterait sur une information encore absente de la base
 * mentirait — elle signalerait un manque impossible à corriger depuis un écran.
 * Les informations suivantes vivent encore dans le `getInitInfo.js` de
 * LyraeTalk et rejoindront ce registre au fur et à mesure du plan
 * `2026-09-lyraetalk-config-tout-dashboard.md` :
 *
 *   - les codes RIS par type d'examen et le code du site principal (son lot 4) ;
 *   - le numéro du secrétariat et les fenêtres horaires de repli (son lot 4) ;
 *   - les sites du groupe, leur libellé et leur adresse (son lot 3) ;
 *   - les langues proposées, les étapes du parcours, la consigne de rendez-vous.
 *
 * Les redirections par type d'examen, elles, SONT déjà en base
 * (`TalkSettings.fullPlanningNotes`) : elles sont donc vérifiées ici.
 *
 * **PAS D'EXIGENCE SUR LES QUESTIONS DE PRÉPARATION**, et ce n'est pas un oubli.
 * Le `examQuestions` de `/api/configuration` n'est pas la source : le robot ne
 * les lit pas là. Il les récupère plus tard, une fois l'examen identifié, dans
 * `GET /api/configuration/get/mapping` (champ `Interrogatoire`), qui les porte
 * par CODE d'examen et non par type. Un `examQuestions` vide à l'initialisation
 * ne veut donc rien dire, et l'exigence qui s'y appuyait produisait une alerte
 * que personne ne pouvait faire taire.
 */

/**
 * Correspondance code canonique du mapping d'examens → clé canonique.
 *
 * On lit `examCode`, PAS le libellé `fr`. La colonne `fr` a été écrite à
 * "Scanner" sur les cinq lignes de plusieurs centres par l'ancien écran de
 * saisie des diminutifs (constaté sur le groupe Quimper le 2026-09-04) : s'y
 * fier faisait conclure ici qu'un centre acceptant l'écho, la mammo et la radio
 * n'avait renseigné aucun code court, donc un bandeau bloquant permanent et
 * faux. Le code, lui, est stable.
 *
 * ⚠️ Correspondance encore dupliquée dans `api/configuration/route.ts`
 * (`examCodeMap`, sens inverse). À unifier avec le déplacement des diminutifs
 * (lot 6) ; l'unifier maintenant élargirait ce lot.
 */
const CODE_VERS_TYPE: Record<string, ExamTypeKey> = {
  US: "echographie",
  MG: "mammo",
  RX: "radiographie",
  MR: "irm",
  CT: "scanner",
};

/** Comment nommer un type d'examen dans une phrase lue par un utilisateur. */
const NOM_TYPE: Record<ExamTypeKey, string> = {
  radiographie: "radiographies",
  irm: "IRM",
  echographie: "échographies",
  scanner: "scanners",
  mammo: "mammographies",
};

/** L'instantané de configuration d'un centre LyraeTalk, tel que lu en base. */
export type ConfigTalk = {
  userProductId: number;
  userId: number;
  /** Codes du centre dans le logiciel de gestion (`ExternalCenterMapping`). */
  codesCentres: string[];
  /** Numéros sur lesquels le robot répond (`UserNumber`). */
  numeros: string[];

  centerName: string | null;
  address: string | null;
  address2: string | null;
  centerPhone: string | null;
  centerMail: string | null;
  centerWebsite: string | null;
  welcomeMsg: string | null;

  /** `examsAccepted` : les examens que le centre prend par téléphone. */
  examensAcceptes: Partial<Record<ExamTypeKey, boolean>>;
  /** `fullPlanningNotes` : quoi faire quand le planning d'un examen est plein. */
  notesPlanning: Record<
    string,
    { type?: string; phone?: string; message?: string } | undefined
  >;

  /** Examens du mapping portant un code client, seuls à être proposables. */
  examensAvecCode: number;
  /**
   * Le mapping d'examens, pour vérifier les diminutifs. `examCode` porte le
   * type (US/MG/RX/MR/CT) ; `fr` n'est qu'un libellé d'affichage, il ne sert
   * pas à identifier la ligne.
   */
  mappings: Array<{
    examCode: string | null;
    fr: string | null;
    diminutif: string | null;
  }>;

  /** Nombre d'entrées de la FAQ patient (`ModuleInfoItem`). */
  faq: number;
};

/** Les types que le centre a déclaré accepter. */
function typesAcceptes(c: ConfigTalk): ExamTypeKey[] {
  return EXAM_TYPE_KEYS.filter((t) => c.examensAcceptes?.[t] === true);
}

/**
 * Les types dont la conduite à tenir est déclarée mais inexploitable : une
 * redirection vers un numéro qui ne tient pas, ou une fin d'appel sans message.
 *
 * C'est le cas grave : le robot annoncera au patient un numéro faux, ou se
 * taira. Il porte sur TOUS les types, y compris ceux que le centre accepte —
 * `fullPlanningNotes` sert précisément quand le planning d'un examen accepté
 * est plein.
 */
function conduitesInexploitables(c: ConfigTalk): ExamTypeKey[] {
  return EXAM_TYPE_KEYS.filter((t) => {
    const note = c.notesPlanning?.[t];
    if (!note) return false;
    if (note.type === "redirection") return !estNumeroSortant(note.phone);
    if (note.type === "fin_appel") return !renseigne(note.message);
    return false;
  });
}

/** Les types non acceptés pour lesquels aucune conduite n'est déclarée. */
function conduitesAbsentes(c: ConfigTalk): ExamTypeKey[] {
  return EXAM_TYPE_KEYS.filter((t) => {
    if (c.examensAcceptes?.[t] === true) return false;
    const note = c.notesPlanning?.[t];
    if (!note || !renseigne(note.type)) return true;
    // Déclarée mais vide : c'est `conduitesInexploitables` qui la signale, avec
    // une criticité plus forte. Ne pas la compter deux fois.
    return false;
  });
}

function enumerer(types: ExamTypeKey[]): string {
  const noms = types.map((t) => NOM_TYPE[t]);
  if (noms.length <= 1) return noms.join("");
  return `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
}

export const REGISTRE_TALK: Exigence<ConfigTalk>[] = [
  // ─────────────────────────────  Administrateur  ─────────────────────────────
  {
    cle: "talk.codes-centres",
    libelle: "Codes du centre",
    proprietaire: "admin",
    criticite: "bloquant",
    manque:
      "Aucun rendez-vous n'arrivera jusqu'à ce centre. Ajoutez son code dans le logiciel de gestion.",
    href: () => "/admin/talk-installation",
    satisfaite: (c) => c.codesCentres.length > 0,
  },
  {
    cle: "talk.numero-entrant",
    libelle: "Numéro d'appel",
    proprietaire: "admin",
    criticite: "bloquant",
    manque:
      "Le robot n'a aucun numéro valide sur lequel répondre. Le numéro doit être au format international, par exemple +33545820880.",
    href: () => "/admin/talk-installation",
    satisfaite: (c) => c.numeros.some(estNumeroEntrant),
  },
  {
    cle: "talk.diminutifs",
    libelle: "Codes courts des examens",
    proprietaire: "admin",
    criticite: "bloquant",
    manque:
      "Le robot ne saura pas relire les rendez-vous déjà pris. Renseignez le code court de chaque type d'examen accepté.",
    href: () => "/admin/talk-installation",
    satisfaite: (c) => {
      const acceptes = typesAcceptes(c);
      if (acceptes.length === 0) return true; // couvert par `talk.examens-acceptes`
      const avecDiminutif = new Set(
        c.mappings
          .filter((m) => renseigne(m.diminutif))
          .map((m) => (m.examCode ? CODE_VERS_TYPE[m.examCode] : undefined))
          .filter((t): t is ExamTypeKey => t !== undefined)
      );
      return acceptes.every((t) => avecDiminutif.has(t));
    },
  },

  // ───────────────────────────────────  Client  ───────────────────────────────
  {
    cle: "talk.examens-acceptes",
    libelle: "Examens acceptés",
    proprietaire: "client",
    criticite: "bloquant",
    manque:
      "Le robot ne peut prendre aucun rendez-vous. Cochez au moins un examen que le centre accepte par téléphone.",
    href: (ctx) => cheminCentre(ctx.userId, "talk", "parametrage"),
    satisfaite: (c) => typesAcceptes(c).length > 0,
  },
  {
    cle: "talk.codes-examens",
    libelle: "Codes des examens",
    proprietaire: "client",
    criticite: "bloquant",
    manque:
      "Aucun examen n'a de code : le robot ne pourra rien proposer au patient.",
    href: (ctx) => cheminCentre(ctx.userId, "talk", "parametrage/mapping_exam"),
    satisfaite: (c) => c.examensAvecCode > 0,
  },
  {
    cle: "talk.fiche-identite",
    libelle: "Nom et adresse du centre",
    proprietaire: "client",
    criticite: "bloquant",
    manque:
      "Le robot ne peut pas dire au patient où se rendre. Renseignez le nom, l'adresse, le code postal et la ville.",
    href: (ctx) => cheminCentre(ctx.userId, "talk", "parametrage"),
    satisfaite: (c) =>
      renseigne(c.centerName) && renseigne(c.address) && renseigne(c.address2),
  },
  {
    cle: "talk.fiche-telephone",
    libelle: "Téléphone du centre",
    proprietaire: "client",
    criticite: "bloquant",
    manque:
      "Le robot n'a pas de numéro valide à donner au patient. Attendu : dix chiffres, par exemple 0545820880.",
    href: (ctx) => cheminCentre(ctx.userId, "talk", "parametrage"),
    satisfaite: (c) => estNumeroSortant(c.centerPhone),
  },
  {
    cle: "talk.redirections",
    libelle: "Planning complet : conduite à tenir",
    proprietaire: "client",
    // Absente, le patient part au secrétariat général : le service est dégradé.
    // Inexploitable, le robot dicte un numéro faux ou se tait : c'est bloquant.
    criticite: (c) => (conduitesInexploitables(c).length > 0 ? "bloquant" : "degrade"),
    manque: (c) => {
      const cassees = conduitesInexploitables(c);
      if (cassees.length > 0) {
        return `La conduite à tenir pour ${enumerer(
          cassees
        )} est déclarée mais vide ou invalide. Le robot n'aura rien à dire au patient.`;
      }
      return `Les patients qui demandent ${enumerer(
        conduitesAbsentes(c)
      )} iront au secrétariat général, faute de conduite définie.`;
    },
    href: (ctx) => cheminCentre(ctx.userId, "talk", "parametrage"),
    satisfaite: (c) =>
      conduitesInexploitables(c).length === 0 && conduitesAbsentes(c).length === 0,
  },
  {
    cle: "talk.fiche-mail",
    libelle: "Adresse mail du centre",
    proprietaire: "client",
    criticite: "degrade",
    manque:
      "Le robot ne pourra pas proposer d'envoyer l'ordonnance par mail.",
    href: (ctx) => cheminCentre(ctx.userId, "talk", "parametrage"),
    satisfaite: (c) => estAdresseMail(c.centerMail),
  },
  {
    cle: "talk.faq",
    libelle: "FAQ patient",
    proprietaire: "client",
    criticite: "degrade",
    manque:
      "Le robot n'a rien à répondre aux questions des patients sur le centre.",
    href: (ctx) => cheminCentre(ctx.userId, "talk", "informationnel"),
    satisfaite: (c) => c.faq > 0,
  },
  {
    cle: "talk.message-accueil",
    libelle: "Message d'accueil",
    proprietaire: "client",
    criticite: "confort",
    manque: "Le robot utilise sa phrase d'accueil par défaut.",
    href: (ctx) => cheminCentre(ctx.userId, "talk", "parametrage"),
    satisfaite: (c) => renseigne(c.welcomeMsg),
  },
  {
    cle: "talk.fiche-site-web",
    libelle: "Site internet",
    proprietaire: "client",
    criticite: "confort",
    manque: "Le robot ne pourra pas donner l'adresse du site au patient.",
    href: (ctx) => cheminCentre(ctx.userId, "talk", "parametrage"),
    satisfaite: (c) => renseigne(c.centerWebsite),
  },
];
