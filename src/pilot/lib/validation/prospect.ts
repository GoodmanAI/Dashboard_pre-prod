import { z } from "zod";
import { codePostal, dateValide, identifiant, texteOptionnel } from "./commun";
import { contactSansOrganisation } from "./contact";
import { verifierProchaineAction } from "./echange";
import { creationOrganisation } from "./organisation";
import { MONTANT_OPPORTUNITE_MAXIMUM_CENTIMES } from "./opportunite";
import { CANAUX_PREMIER_CONTACT } from "@/pilot/lib/prospection/regles";

/**
 * La fiche de saisie rapide d'un prospect (C-65) : l'établissement, son site,
 * ses interlocuteurs et, s'il a déjà eu lieu, le premier contact. Tout est créé
 * en une transaction : jamais de prospect à moitié enregistré.
 */
export const creationProspect = z.object({
  organisation: creationOrganisation.omit({ contactPrincipal: true }).extend({
    solutionActuelle: texteOptionnel(2000),
    // Le concurrent en place (lot R) : enregistré dans la même transaction que le prospect.
    concurrentId: identifiant.nullable().optional(),
  }),
  // La ville est le seul élément d'adresse obligatoire : elle sert à repérer les doublons.
  site: z.object({
    adresse: texteOptionnel(300),
    codePostal,
    ville: z.string({ required_error: "Indiquez la ville." }).trim().min(1, "Indiquez la ville.").max(200),
    // L'établissement choisi dans l'annuaire (C-89).
    siret: z.string().regex(/^\d{14}$/).nullable().optional(),
    finess: texteOptionnel(200),
  }).strict(),
  // Le premier de la liste devient le contact principal.
  contacts: z.array(contactSansOrganisation.omit({ principal: true })).max(10, "Dix contacts au plus à la création.").default([]),
  premierContact: z.object({
    type: z.enum(CANAUX_PREMIER_CONTACT),
    surveneuLe: dateValide,
    compteRendu: texteOptionnel(5000),
    prochaineAction: texteOptionnel(500),
    prochaineActionLe: dateValide.nullable().optional(),
  }).strict().superRefine(verifierProchaineAction).optional(),
  // Le montant estimé par mois (C-70) : il devient une opportunité, jamais une colonne de l'organisation.
  // Les offres cochées disent à quel produit il se rattache (la première, Talk avant Konnect).
  // Même plafond que l'opportunité saisie dans l'onglet Argent : c'est une opportunité.
  montantEstime: z.object({
    montantMensuelCentimes: z.number().int().min(1).max(MONTANT_OPPORTUNITE_MAXIMUM_CENTIMES),
    offres: z.array(z.enum(["TALK", "KONNECT", "CONNECTEUR_RIS"])).max(3)
      .refine((offres) => new Set(offres).size === offres.length, "Chaque offre ne se coche qu'une fois."),
  }).strict().optional(),
}).strict();
