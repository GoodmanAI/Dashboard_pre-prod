import { z } from "zod";
import { identifiant } from "@/pilot/lib/validation/commun";
import { LIBELLES_TYPES_ALERTE } from "./types";
import type { ResultatAlertes, TypeAlerte } from "./types";

const facultatif = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => v === "" ? undefined : v, schema.optional());
export const filtresAlertes = z.object({
  moi: facultatif(z.enum(["1", "0"])), niveau: facultatif(z.enum(["bloquant", "attention"])),
  type: facultatif(z.custom<TypeAlerte>((v) => typeof v === "string" && Object.hasOwn(LIBELLES_TYPES_ALERTE, v))),
  organisationId: facultatif(z.coerce.number().pipe(identifiant)),
});
export function filtrerAlertes(resultat: ResultatAlertes, filtres: z.output<typeof filtresAlertes>): ResultatAlertes {
  const accepte = (a: ResultatAlertes["actives"][number]) => (!filtres.niveau || a.niveau === filtres.niveau)
    && (!filtres.type || a.type === filtres.type) && (!filtres.organisationId || a.organisationId === filtres.organisationId);
  return { actives: resultat.actives.filter(accepte), acquittees: resultat.acquittees.filter(accepte) };
}
