import type { CrmTemperature } from "@prisma/client";
import { compter } from "@/pilot/lib/texte";
import { LIBELLES_TEMPERATURE, MOIS_DECISION_PROCHE, POINTS, SALLES, VALEUR_AUCUN_RIS, type Critere, type ResultatTemperature } from "./temperature";

/** Le titre du bloc des cases cochées à la main : les conseils y renvoient. */
export const TITRE_BLOC_CASES = "Ce que vous savez du client";
/** Le titre du bloc de la date de décision : le conseil y renvoie aussi. */
export const TITRE_BLOC_DECISION = "Décision attendue";

/**
 * Ce que les écrans montrent de la température (lot R) : des règles pures, sans
 * base ni horloge, pour que la fiche, le tableau et la liste disent la même
 * chose. Le barème reste dans `temperature.ts` : ici, seulement la mise en mots.
 */

/** Ce que la carte du tableau et la ligne de la liste gardent : le niveau, et s'il a été forcé. */
export type ResumeTemperature = { niveau: CrmTemperature; forcee: boolean };

/** `null` après la signature, pour un dossier perdu ou en pause : l'écran n'affiche rien. */
export function resumeTemperature(r: { affichee: CrmTemperature | null; forcage: object | null }): ResumeTemperature | null {
  return r.affichee === null ? null : { niveau: r.affichee, forcee: r.forcage !== null };
}

/** Du plus chaud au plus froid : le rang du tri. Sans température, après les autres. */
export function rangTemperature(niveau: CrmTemperature | null): number {
  return niveau === "CHAUD" ? 0 : niveau === "TIEDE" ? 1 : niveau === "FROID" ? 2 : 3;
}

export const NIVEAUX_TEMPERATURE: readonly CrmTemperature[] = ["CHAUD", "TIEDE", "FROID"];

/** La phrase lue à voix haute : « Température : chaud, forcée ». */
export function libelleAccessible(t: ResumeTemperature): string {
  return `Température : ${LIBELLES_TEMPERATURE[t.niveau].toLowerCase()}${t.forcee ? ", forcée" : ""}`;
}

/** Une date de forçage, « 18/11 » : jour et mois, en UTC comme les autres dates de Pilot. */
const jourMois = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export type ForcageAffiche = { temperature: CrmTemperature; le: string | Date | null; parNom: string | null };

/**
 * Le résultat du barème tel que la page serveur le passe à l'écran : des dates en
 * chaîne (rien d'autre ne traverse la frontière client), le nom de l'auteur du
 * forçage lu une fois, et, quand la température est sans objet, aucun détail de points.
 */
export type TemperatureFiche = Omit<ResultatTemperature, "forcage"> & {
  forcage: { temperature: CrmTemperature; le: string | null; parNom: string | null } | null;
};
export function pourLEcran(r: ResultatTemperature, parNom: string | null): TemperatureFiche {
  return {
    ...r,
    points: r.sansObjet ? { ...r.points, criteres: [] } : r.points,
    forcage: r.forcage && { temperature: r.forcage.temperature, le: r.forcage.le?.toISOString() ?? null, parNom },
  };
}

/**
 * « Forcée chaud par Camille Alpha le 18/11, le calcul dit tiède. » Quand le calcul
 * donne le même niveau, la phrase le dit : le forçage ne change rien pour l'instant.
 */
export function phraseForcage(forcage: ForcageAffiche, calculee: CrmTemperature | null): string {
  const niveau = LIBELLES_TEMPERATURE[forcage.temperature].toLowerCase();
  const par = forcage.parNom ? ` par ${forcage.parNom}` : "";
  const le = forcage.le ? ` le ${jourMois(new Date(forcage.le))}` : "";
  const calcul = calculee === null ? "" : calculee === forcage.temperature
    ? ", comme le calcul"
    : `, le calcul dit ${LIBELLES_TEMPERATURE[calculee].toLowerCase()}`;
  return `Forcée ${niveau}${par}${le}${calcul}.`;
}

export type ActionCritere = "organisation" | "contact" | null;

/**
 * Comment gagner des points sur un critère, ou `null` quand il est complet. Une
 * phrase courte, lisible par qui découvre Pilot. `action` dit quel écran ouvre le
 * bouton qui accompagne la phrase : modifier l'organisation, ajouter un contact,
 * ou rien (la case se coche ou la date se règle dans le bloc voisin).
 */
export function conseilCritere(c: Pick<Critere, "cle" | "points" | "possibles"> & { valeur?: string }): { texte: string | null; action: ActionCritere } {
  if (c.points >= c.possibles) return { texte: null, action: null };
  switch (c.cle) {
    case "taille":
      return c.points === 0
        ? { texte: `Renseignez le nombre de salles. À partir de ${SALLES.moyen} salles le dossier compte ${compter(POINTS.taille.moyen, "point")}, à partir de ${SALLES.grand} il en compte ${POINTS.taille.grand}.`, action: "organisation" }
        : { texte: `À partir de ${SALLES.grand} salles, le dossier est grand et compte ${compter(POINTS.taille.grand, "point")}.`, action: "organisation" };
    case "ris":
      // La saisie dit « pas de RIS » (« Aucun », « Néant »...) : le renseigner ne servirait à rien, l'écran dit pourquoi
      // le point manque. Une saisie incertaine (« Inconnu », « NC », « À vérifier ») est un RIS inconnu : il faut le renseigner.
      if (c.points === 0 && c.valeur?.startsWith(VALEUR_AUCUN_RIS)) {
        return { texte: "Sans RIS, le dossier ne gagne pas ce point. Notez le RIS s'il en choisit un.", action: "organisation" };
      }
      return c.points === 0
        ? { texte: "Renseignez le RIS utilisé par l'établissement.", action: "organisation" }
        : { texte: `Xplore (EDL) compte ${compter(POINTS.ris.xplore, "point")}, un autre RIS ${compter(POINTS.ris.autre, "point")}.`, action: null };
    case "decideur":
      return c.points === 0
        ? { texte: "Ajoutez un contact décideur.", action: "contact" }
        : { texte: `Repérez le décideur parmi les contacts : il compte ${compter(POINTS.decideur.decideur, "point")}, un prescripteur ${compter(POINTS.decideur.prescripteur, "point")}.`, action: "contact" };
    case "budget":
      return { texte: `Cochez « Budget évoqué » dans « ${TITRE_BLOC_CASES} » quand le budget a été abordé avec le client.`, action: null };
    case "decision":
      return c.points === 0
        ? { texte: `Renseignez la date dans « ${TITRE_BLOC_DECISION} », ou mettez-la à jour si elle est passée.`, action: null }
        : { texte: `Une décision attendue dans les ${MOIS_DECISION_PROCHE} mois compte ${compter(POINTS.decision.proche, "point")}.`, action: null };
    case "besoin":
      return { texte: `Cochez « Besoin exprimé » dans « ${TITRE_BLOC_CASES} » quand le client a dit ce qu'il cherche.`, action: null };
  }
}
