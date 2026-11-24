import type { CrmTypeEchange } from "@prisma/client";

export const LIBELLES_ECHANGE: Record<CrmTypeEchange, string> = {
  VISIO_POURPARLERS: "Visio de pourparlers",
  VISIO_TECHNIQUE: "Visio technique",
  DEMO: "Démo",
  MAIL: "Mail",
  APPEL: "Appel",
  DEVIS_ENVOYE: "Devis envoyé",
  RELANCE: "Relance",
  JALON: "Étape clé", FORMATION: "Formation", VISITE: "Visite", INTERFACAGE: "Interfaçage", LINKEDIN: "LinkedIn",
};

/** Le résumé d'audit vient du type, jamais du texte libre de l'échange. */
const RESUMES: Record<CrmTypeEchange, string> = {
  VISIO_POURPARLERS: "Visio de pourparlers notée",
  VISIO_TECHNIQUE: "Visio technique notée",
  DEMO: "Démo notée",
  MAIL: "Mail noté",
  APPEL: "Appel noté",
  DEVIS_ENVOYE: "Envoi de devis noté",
  RELANCE: "Relance notée",
  JALON: "Étape clé notée", FORMATION: "Formation notée", VISITE: "Visite notée", INTERFACAGE: "Interfaçage noté",
  LINKEDIN: "Message LinkedIn noté",
};

export function resumeEchange(type: CrmTypeEchange): string {
  return RESUMES[type];
}
