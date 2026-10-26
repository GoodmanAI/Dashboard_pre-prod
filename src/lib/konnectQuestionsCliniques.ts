/**
 * Questions cliniques du portail Konnect que le client choisit de poser
 * (domaine `konnect.questions-cliniques`, 26/10/2026).
 *
 * Konnect pose ses questions cliniques (ticket 4C, `app/questionnaire/contenu.py`)
 * selon l'examen : IRM, IRM injectee, scanner injecte, examen irradiant. Le
 * client coche celles qu'il veut. Toutes se decochent, y compris celles qui
 * bloquent le rendez-vous ou le renvoient a la validation du centre : c'est son
 * choix (DECISIONS.md du 26/10/2026, plan
 * plans/2026-10-konnect-questionnaires-centre.md).
 *
 * Valeur : `{ desactivees: string[] }`, les ids retires. Absent ou vide : toutes
 * les questions sont posees, comme avant. On stocke les retraits, pas la liste
 * des questions posees : une question ajoutee plus tard a Konnect est posee
 * d'office, au lieu d'etre muette chez tous les centres.
 *
 * ⚠️ Le catalogue ci-dessous recopie les ids de `contenu.py` (le Dashboard ne
 * peut pas appeler Konnect, decision du 08/09/2026). Une question ajoutee dans
 * Konnect s'ajoute ici pour devenir decochable ; un id inconnu de Konnect est
 * ignore par lui.
 */

export const DOMAINE_QUESTIONS_CLINIQUES = "konnect.questions-cliniques";

/** Ce que fait une reponse « oui », dans les mots du client. */
export type Effet = "valide" | "bloque" | "signale" | "note";

export const EFFETS: Record<Effet, string> = {
  valide: "Si oui, vous validez le rendez-vous avant qu'il soit confirmé.",
  bloque: "Si oui, le rendez-vous n'est pas pris : le patient doit vous appeler.",
  signale: "Si oui, la réponse vous est signalée.",
  note: "Si oui, la réponse est notée dans le rendez-vous.",
};

export interface QuestionClinique {
  id: string;
  libelle: string;
  effet: Effet;
  /** Posee seulement apres un « oui » a cette question. */
  apres?: string;
}

export interface GroupeQuestions {
  titre: string;
  aide: string;
  questions: QuestionClinique[];
}

export const CATALOGUE: GroupeQuestions[] = [
  {
    titre: "IRM",
    aide: "Posées pour toute IRM.",
    questions: [
      { id: "irm_pacemaker", libelle: "Pacemaker ou défibrillateur cardiaque", effet: "valide" },
      { id: "irm_implant_cochleaire", libelle: "Implant cochléaire", effet: "valide" },
      { id: "irm_neurostimulateur", libelle: "Neurostimulateur", effet: "valide" },
      { id: "irm_pompe_implantee", libelle: "Pompe implantée sous la peau", effet: "valide" },
      { id: "irm_corps_etranger_oeil", libelle: "Éclat métallique dans l'œil", effet: "valide" },
      { id: "irm_clip_anevrisme", libelle: "Clip d'anévrisme ou fragment métallique dans le corps", effet: "valide" },
      { id: "irm_eclats_metalliques_pro", libelle: "Travail du métal sans protection des yeux", effet: "valide" },
      { id: "irm_claustrophobie", libelle: "Claustrophobie", effet: "note" },
      { id: "grossesse_irm", libelle: "Grossesse (IRM sans injection, femmes de 12 à 55 ans)", effet: "note" },
    ],
  },
  {
    titre: "IRM avec injection",
    aide: "Posées en plus quand l'IRM est ou peut être injectée.",
    questions: [
      { id: "irm_allergie_gadolinium", libelle: "Allergie au produit de contraste de l'IRM (gadolinium)", effet: "signale" },
      { id: "irm_allergie_gadolinium_grave", libelle: "Réaction allergique grave", effet: "valide", apres: "irm_allergie_gadolinium" },
      { id: "grossesse_irm_injectee", libelle: "Grossesse (femmes de 12 à 55 ans)", effet: "valide" },
    ],
  },
  {
    titre: "Scanner avec injection",
    aide: "Posées quand le scanner est ou peut être injecté.",
    questions: [
      { id: "scanner_allergie_iode", libelle: "Allergie au produit de contraste iodé", effet: "signale" },
      { id: "scanner_allergie_iode_grave", libelle: "Réaction allergique grave", effet: "valide", apres: "scanner_allergie_iode" },
      { id: "scanner_insuffisance_renale", libelle: "Maladie des reins, dialyse, greffe ou rein unique", effet: "signale" },
      { id: "scanner_diabete_metformine", libelle: "Diabète de type 2 ou metformine", effet: "signale" },
      { id: "scanner_dysthyroidie", libelle: "Trouble de la thyroïde", effet: "signale" },
      { id: "scanner_hta", libelle: "Hypertension artérielle", effet: "signale" },
    ],
  },
  {
    titre: "Scanner, radiographie et mammographie",
    aide: "Examens avec rayons X.",
    questions: [
      { id: "grossesse", libelle: "Grossesse (femmes de 12 à 55 ans)", effet: "bloque" },
    ],
  },
];

const IDS_CONNUS = new Set(CATALOGUE.flatMap((g) => g.questions.map((q) => q.id)));

export interface QuestionsCliniques {
  desactivees: string[];
}

export const TOUTES_POSEES: QuestionsCliniques = { desactivees: [] };

/** Lecture tolerante (ecran) : ids connus seulement, sans doublon, tries. */
export function lireQuestionsCliniques(raw: unknown): QuestionsCliniques {
  const liste =
    raw && typeof raw === "object" && Array.isArray((raw as { desactivees?: unknown }).desactivees)
      ? ((raw as { desactivees: unknown[] }).desactivees)
      : [];
  return {
    desactivees: Array.from(
      new Set(liste.filter((v): v is string => typeof v === "string" && IDS_CONNUS.has(v)))
    ).sort(),
  };
}

/** Validation de la route : refuse un id inconnu plutot que de l'avaler. */
export function validerQuestionsCliniques(
  raw: unknown
): { valeur: QuestionsCliniques } | { erreur: string } {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).desactivees)) {
    return { erreur: "Liste des questions retirées absente." };
  }
  const inconnus = ((raw as any).desactivees as unknown[]).filter(
    (v) => typeof v !== "string" || !IDS_CONNUS.has(v)
  );
  if (inconnus.length > 0) {
    return { erreur: "Une question retirée n'existe pas dans le portail. Rechargez la page." };
  }
  return { valeur: lireQuestionsCliniques(raw) };
}

/** Une question retiree dont le « oui » arretait ou faisait valider le RDV. */
export function retireUnGardeFou(q: QuestionClinique): boolean {
  return q.effet === "valide" || q.effet === "bloque";
}
