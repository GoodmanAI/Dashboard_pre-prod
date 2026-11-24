import { CrmCleEtape } from "@prisma/client";
import { z } from "zod";
import { identifiant } from "./commun";

export const cochageEtape = z.object({
  centreId: identifiant,
  productId: identifiant,
  cle: z.nativeEnum(CrmCleEtape),
  faite: z.boolean(),
  commentaire: z.string().trim().max(2000).optional(),
});
