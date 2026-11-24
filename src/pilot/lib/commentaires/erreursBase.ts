import { traduireErreurBase as traduire, type MessagesErreurBase } from "@/pilot/lib/erreursBase";

/**
 * Les phrases d'une erreur de la base à l'écriture d'un commentaire (lot T). La
 * traduction est partagée (`src/lib/erreursBase.ts`) : jamais le message
 * d'origine, qui pourrait recopier le texte du commentaire.
 */
export const MESSAGE_CONTRAINTE = "Le commentaire n'a pas pu être enregistré. Vérifiez le texte et qui prévenir.";
export const MESSAGE_DISPARU = "Le client ou une personne prévenue vient d'être supprimé. Rechargez la page.";
export const MESSAGE_CONFLIT = "Le commentaire n'a pas pu être enregistré. Rechargez la page.";
export const MESSAGE_PANNE = "Écriture d'un commentaire impossible : erreur de la base.";
export const MESSAGES_COMMENTAIRE: MessagesErreurBase = {
  contrainte: MESSAGE_CONTRAINTE, disparu: MESSAGE_DISPARU, conflit: MESSAGE_CONFLIT, panne: MESSAGE_PANNE, ecriture: "Écriture d'un commentaire",
};

export const traduireErreurBase = (erreur: unknown): unknown => traduire(erreur, MESSAGES_COMMENTAIRE);
