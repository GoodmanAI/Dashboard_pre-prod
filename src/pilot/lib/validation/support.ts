import { z } from "zod";
import { identifiant } from "./commun";
import { MESSAGE_NIR, ressembleAUnNir } from "./commentaire";

/**
 * Saisies du support (25/11/2026). Un message porte une note pour l'équipe, un texte à
 * dire au client, ou les deux. Il part par mail : aucun numéro de sécurité sociale
 * (même garde que les commentaires, C-22), et l'écran rappelle de ne nommer aucun patient.
 */
export const LONGUEUR_MESSAGE_SUPPORT = 5000;
export const MESSAGE_VIDE = "Écrivez une note pour l'équipe ou un texte à dire au client.";

const texte = z.string({ invalid_type_error: "Vérifiez le texte du message." }).trim()
  .max(LONGUEUR_MESSAGE_SUPPORT, `Un message tient en ${LONGUEUR_MESSAGE_SUPPORT} caractères.`)
  .refine((v) => !ressembleAUnNir(v), MESSAGE_NIR)
  .transform((v) => (v === "" ? null : v))
  .nullable().optional();

const contenu = { noteInterne: texte, aDireAuClient: texte };
const nonVide = (m: { noteInterne?: string | null; aDireAuClient?: string | null }) => Boolean(m.noteInterne || m.aDireAuClient);

export const nouveauSujet = z.object({
  organisationId: identifiant,
  titre: z.string({ required_error: "Donnez un titre au sujet." }).trim().min(1, "Donnez un titre au sujet.").max(160, "Le titre tient en 160 caractères.")
    .refine((v) => !ressembleAUnNir(v), MESSAGE_NIR),
  ...contenu,
}).strict().refine(nonVide, MESSAGE_VIDE);

export const nouveauMessage = z.object(contenu).strict().refine(nonVide, MESSAGE_VIDE);

/** `majLe` : la version lue par l'écran (C-26), pour ne pas changer un sujet qui vient de bouger. */
export const changementStatut = z.object({
  statut: z.enum(["TRANSMIS", "RESOLU", "OUVERT"], { errorMap: () => ({ message: "Statut inconnu." }) }),
  majLe: z.string().datetime({ message: "Rechargez la page." }),
}).strict();
