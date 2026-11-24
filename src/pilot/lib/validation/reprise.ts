import { CrmCleEtape, CrmTypeOrganisation } from "@prisma/client";
import { z } from "zod";
import { dateValide, identifiant, texteOptionnel } from "./commun";
import { ETAPES_REPRISE } from "@/pilot/lib/reprise/regles";

const nom = z.string().trim().min(1).max(200);

/** Relier un compte du Dashboard : à un nouveau client ou à un client existant, sur un nouveau centre ou un centre existant. */
export const repriseCompte = z.object({
  userId: identifiant,
  userProductIds: z.array(identifiant).min(1, "Choisissez au moins un produit.").max(20),
  organisation: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("creer"), raisonSocialeNom: nom, type: z.nativeEnum(CrmTypeOrganisation),
      responsableId: identifiant, chefDeProjetId: identifiant.nullable().optional(), etape: z.enum(ETAPES_REPRISE),
    }).strict(),
    z.object({ mode: z.literal("existante"), organisationId: identifiant }).strict(),
  ]),
  centre: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("creer"), nom, ville: texteOptionnel(), codeSite: texteOptionnel() }).strict(),
    z.object({ mode: z.literal("existant"), centreId: identifiant }).strict(),
  ]),
  etapesFaites: z.array(z.nativeEnum(CrmCleEtape)).max(30).default([]),
  miseEnServiceLe: dateValide.nullable().optional(),
}).strict();

export const RAISONS_ECART = ["Compte de démonstration", "Compte d'entraînement", "Compte interne ou de test", "Autre"] as const;

export const ecartCompte = z.object({
  userId: identifiant,
  raison: z.enum(RAISONS_ECART),
  precision: texteOptionnel(500),
}).strict();
