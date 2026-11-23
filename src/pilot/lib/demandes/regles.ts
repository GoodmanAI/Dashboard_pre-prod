import type { CrmCleEtape, CrmStatutDemande, CrmTypeDemande } from "@prisma/client";

/**
 * Les demandes d'action entre collègues (CHOIX.md, C-58) : ce qu'on demande à
 * quelqu'un de faire, sur un client, avec une échéance. Fonctions pures.
 */

/** Ce qu'on demande, dans l'ordre d'un déploiement de prise de RDV en radiologie. */
export const LIBELLES_DEMANDE: Record<CrmTypeDemande, string> = {
  RAPPELER_CLIENT: "Rappeler le client",
  PLANIFIER_VISIO: "Planifier une visio",
  PREPARER_DEVIS: "Préparer le devis",
  VALIDER_REMISE: "Valider une remise ou un tarif",
  OBTENIR_ACCES_RIS: "Obtenir l'accès au RIS ou au VPN",
  RELANCER_EDL: "Relancer EDL pour le jeton Xplore",
  ENVOYER_ACCES_DASHBOARD: "Envoyer l'accès au Dashboard",
  FINIR_MAPPING: "Finir l'association des examens",
  PARAMETRER_ROBOT: "Paramétrer le robot",
  TESTER_CRENEAUX: "Tester les créneaux de RDV",
  VERIFIER_TELEPHONIE: "Vérifier la ligne téléphonique",
  PLANIFIER_FORMATION: "Planifier une formation",
  PREPARER_MISE_EN_SERVICE: "Préparer la mise en service",
  AUTRE: "Autre demande",
};
export const TYPES_DEMANDE = Object.keys(LIBELLES_DEMANDE) as CrmTypeDemande[];

export const LIBELLES_STATUT_DEMANDE: Record<CrmStatutDemande, string> = { OUVERTE: "À faire", FAITE: "Faite", ANNULEE: "Annulée" };

/** Depuis une étape de mise en service, la demande qu'on fait le plus souvent. */
export function typeSuggere(cle: CrmCleEtape | null | undefined): CrmTypeDemande {
  switch (cle) {
    case "PREMIERE_VISIO": return "PLANIFIER_VISIO";
    case "VISIO_TECHNIQUE": return "OBTENIR_ACCES_RIS";
    case "ACCES_DASHBOARD_ENTRAINEMENT": return "ENVOYER_ACCES_DASHBOARD";
    case "FORMATION_DASHBOARD": case "FORMATION_SECRETAIRES": return "PLANIFIER_FORMATION";
    case "JETON_XPLORE": return "RELANCER_EDL";
    case "MAPPING_EXAMENS": return "FINIR_MAPPING";
    case "TEST_CRENEAUX": return "TESTER_CRENEAUX";
    case "REGLAGES_ROBOT": case "MESSAGES_RAPPEL": return "PARAMETRER_ROBOT";
    case "INTERFACAGE_TELEPHONIQUE": return "VERIFIER_TELEPHONIE";
    case "PASSAGE_PRODUCTION": return "PREPARER_MISE_EN_SERVICE";
    default: return "AUTRE";
  }
}

type Acteur = { id: number; role: string };
type DemandeLue = { statut: CrmStatutDemande; demandeurId: number | null; destinataireId: number };
export type Refus = { statut: 400 | 403 | 409; message: string } | null;

const superAdmin = (a: Acteur) => a.role === "SUPER_ADMIN";

/** Marquer faite : le destinataire, ou un super-administrateur. */
export function refusTraiter(d: DemandeLue, a: Acteur): Refus {
  if (d.destinataireId !== a.id && !superAdmin(a)) return { statut: 403, message: "Seule la personne à qui la demande est adressée peut la marquer faite." };
  if (d.statut !== "OUVERTE") return { statut: 409, message: "Cette demande est déjà traitée. Rechargez la page." };
  return null;
}

/** Annuler : la personne qui a demandé, ou un super-administrateur. */
export function refusAnnuler(d: DemandeLue, a: Acteur): Refus {
  if (d.demandeurId !== a.id && !superAdmin(a)) return { statut: 403, message: "Seule la personne qui a fait la demande peut l'annuler." };
  if (d.statut !== "OUVERTE") return { statut: 409, message: "Cette demande est déjà traitée. Rechargez la page." };
  return null;
}

/** Créer : à quelqu'un d'autre, pour aujourd'hui au plus tôt. */
export function refusCreer(p: { destinataireId: number; echeanceLe: Date | null }, a: Acteur, debutDuJour: Date): Refus {
  if (p.destinataireId === a.id) return { statut: 400, message: "Choisissez une autre personne. Pour vous-même, notez une prochaine action sur la fiche." };
  if (p.echeanceLe && p.echeanceLe < debutDuJour) return { statut: 400, message: "L'échéance ne peut pas être passée." };
  return null;
}

/** En retard : ouverte, échéance avant aujourd'hui. */
export const enRetard = (d: { statut: CrmStatutDemande; echeanceLe: Date | string | null }, debutDuJour: Date) =>
  d.statut === "OUVERTE" && d.echeanceLe !== null && new Date(d.echeanceLe) < debutDuJour;
