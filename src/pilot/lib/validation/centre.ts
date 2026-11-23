import { z } from "zod";
import { auMoinsUnChamp, codePostal, dateValide, identifiant, texteOptionnel } from "./commun";

// Adresse et code postal du site : la région d'un prospect s'en déduit (C-65).
const centre = z.object({ nom: z.string().trim().min(1).max(200), codeSite: texteOptionnel(), ville: texteOptionnel(),
  adresse: texteOptionnel(300), codePostal,
  // L'établissement (C-89) : SIRET à 14 chiffres, FINESS, remplis depuis l'annuaire ou saisis.
  siret: z.string().trim().transform((v) => v.replace(/\s/g, "")).pipe(z.string().regex(/^(\d{14})?$/, "SIRET : 14 chiffres.")).transform((v) => v || null).nullable().optional(),
  finess: texteOptionnel(200) }).strict();
export const creationCentre = centre.extend({ organisationId: identifiant });
export const majCentre = centre.partial().refine(auMoinsUnChamp, "Renseignez au moins un champ.");

const rattachement = z.object({
  userProductId: identifiant.nullable().optional(),
  datePromise: dateValide.nullable().optional(),
}).strict();
export const creationRattachement = rattachement.extend({ centreId: identifiant, productId: identifiant });
export const majRattachement = rattachement.extend({ vagueId: identifiant.nullable().optional() }).refine(auMoinsUnChamp, "Renseignez au moins un champ.");
