import type { z } from "zod";
import { MESSAGE_NIR } from "./commentaire";
import { MESSAGE_CODE_POSTAL } from "./commun";
import { MESSAGE_ACTION_SANS_DATE, MESSAGE_DATE_SANS_ACTION } from "./echange";

/** Les refus qui disent déjà quoi corriger : affichés tels quels, quel que soit le champ (C-86, C-92). */
const MESSAGES_PARLANTS = new Set([MESSAGE_NIR, MESSAGE_CODE_POSTAL, MESSAGE_ACTION_SANS_DATE, MESSAGE_DATE_SANS_ACTION]);

/** Libellés affichés des champs, pour qu'un refus dise lequel corriger. */
const LIBELLES_CHAMPS: Record<string, string> = {
  reference: "Référence", signeLe: "Date de signature", renouvelleLe: "Renouvellement", le: "Date",
  montantMensuelCentimes: "Montant mensuel en euros", montantMiseEnServiceCentimes: "Frais d'installation en euros",
  demarrageAttenduLe: "Mois de démarrage attendu", probabilite: "Probabilité", categoriePrevision: "Niveau de confiance",
  raisonPerte: "Raison de perte (1 à 500 caractères)", issue: "Issue", revenirALEtape: "Revenir à l'étape", remplaceContratIds: "Contrats à terminer",
  lignes: "Lignes", montantCentimes: "Montant en euros", remisePourMille: "Remise en pourcentage",
  engagementMois: "Durée du contrat en mois", preavisMois: "Préavis en mois", valideJusquAu: "Valide jusqu'au",
  documentUrl: "Lien du document (https)", reponseClient: "Réponse du client", debuteLe: "Début officiel du contrat",
  essaiDebuteLe: "Début de l'essai", essaiJours: "Durée de l'essai en jours (1 à 365)", reconduction: "Reconduction",
  conditionsTarifaires: "Conditions particulières (2 000 caractères au plus)",
  unite: "Unité", volumeInclus: "Volume inclus", centreId: "Centre", libelle: "Libellé", offerte: "Offert",
  vers: "Statut", operation: "Action", aLaChargeDe: "À la charge de", compteRendu: "Libellé ou compte rendu",
  vagueId: "Vague", organisationId: "Organisation",
  jusquAu: "Jusqu'au", raison: "Raison (1 à 500 caractères)",
  raisonSocialeNom: "Nom du client", type: "Type", responsableId: "Commercial",
  chefDeProjetId: "Chef de projet", utilisateurId: "Compte Dashboard", ris: "RIS",
  nombreSites: "Sites", nombreSalles: "Salles", volumeAppelsEstime: "Appels estimés par jour",
  nom: "Nom", fonction: "Fonction", email: "Email", telephone: "Téléphone",
  roleDecision: "Rôle dans la décision", metier: "Métier", notes: "Notes", codeSite: "Code site", ville: "Ville",
  productId: "Produit", userProductId: "Compte Dashboard", datePromise: "Date promise",
  destinataireId: "À qui", echeanceLe: "Pour quand", precisions: "Précisions (1 000 caractères au plus)",
  reponse: "Réponse (1 000 caractères au plus)", centreProduitId: "Produit du centre", etapeIntegrationId: "Étape",
  // Fiche de saisie rapide d'un prospect (C-65).
  priorite: "Priorité", siteWeb: "Site web", codePostal: "Code postal", adresse: "Adresse",
  rattachementGht: "GHT ou groupe", origine: "Origine du contact", solutionActuelle: "Solution actuelle",
  surveneuLe: "Date du premier contact", prochaineAction: "Prochaine action", prochaineActionLe: "Date de la prochaine action",
  contacts: "Contacts",
  // Version lue d'une proposition, avec ses lignes (lot S).
  majLe: "Version lue",
};

/** Le refus parlant, s'il y en a un ; sinon null, et la route garde son message. */
export function messageParlant(erreur: z.ZodError): string | null {
  const premiere = erreur.issues[0];
  return premiere && MESSAGES_PARLANTS.has(premiere.message) ? premiere.message : null;
}

export function messageValidation(erreur: z.ZodError): string {
  // Le refus d'une donnée patient dit pourquoi, quel que soit le champ (C-86).
  const premiere = erreur.issues[0];
  if (premiere && MESSAGES_PARLANTS.has(premiere.message)) return premiere.message;
  const champ = premiere?.path ?? [];
  const cle = String(typeof champ.at(-1) === "number" ? champ.at(-2) : champ.at(-1) ?? "");
  const libelle = LIBELLES_CHAMPS[cle];
  if (!libelle) return "Vérifiez les champs du formulaire.";
  const duContact = champ[0] === "contactPrincipal" || (champ[0] === "contacts" && typeof champ[1] === "number");
  const rang = champ[0] === "contacts" && typeof champ[1] === "number" ? ` ${champ[1] + 1}` : "";
  return `Vérifiez le champ « ${libelle}${duContact ? ` du contact${rang}` : ""} ».`;
}
