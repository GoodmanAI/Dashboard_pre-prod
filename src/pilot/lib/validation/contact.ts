import { CrmRoleDecision, CrmAttitude } from "@prisma/client";
import { z } from "zod";
import { auMoinsUnChamp, identifiant, texteOptionnel } from "./commun";

export const contactSansOrganisation = z.object({
  nom: z.string().trim().min(1).max(200),
  fonction: texteOptionnel(),
  /** Le métier (C-88), saisie libre : gérant, radiologue, prestataire informatique. */
  metier: texteOptionnel(100),
  email: z.string().trim().pipe(z.string().email().or(z.literal(""))).transform((v) => v || null).nullable().optional(),
  telephone: texteOptionnel(),
  roleDecision: z.nativeEnum(CrmRoleDecision).default("INCONNU"),
  attitude: z.nativeEnum(CrmAttitude).default("INCONNU"),
  principal: z.boolean().default(false),
  /** Reçoit les factures (lot V, C-85) : coche seul « Contacts facturation récupérés ». */
  facturation: z.boolean().default(false),
  notes: texteOptionnel(2000),
}).strict();
export const creationContact = contactSansOrganisation.extend({ organisationId: identifiant });
// Une modification ne déplace jamais un contact vers une autre organisation.
export const majContact = contactSansOrganisation.partial().refine(auMoinsUnChamp, "Renseignez au moins un champ.");
