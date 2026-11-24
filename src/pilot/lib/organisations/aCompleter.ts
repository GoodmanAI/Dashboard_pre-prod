import type { CrmEtapeCommerciale } from "@prisma/client";

type Organisation = {
  etape: CrmEtapeCommerciale;
  prochaineActionLe?: Date | string | null;
  ris: string | null;
  chefDeProjetId: number | null;
  contacts: { principal: boolean }[];
  centres: { id: number; rattachements: { id: number; datePromise: Date | string | null }[] }[];
};
export type Complement = {
  libelle: string;
  onglet: "resume" | "contacts" | "centres" | "chronologie";
  action: "contact" | "centre" | "organisation" | "rattachement" | "date" | "action";
  cibleId?: number;
};

export function aCompleter(org: Organisation): Complement[] {
  if (["PERDU", "EN_SOMMEIL", "ARRETE"].includes(org.etape)) return [];
  const manques: Complement[] = [];
  if (["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION"].includes(org.etape) && !org.prochaineActionLe) {
    manques.push({ libelle: "Dater la prochaine action", onglet: "chronologie", action: "action" });
  }
  if (!org.contacts.some((c) => c.principal)) manques.push({ libelle: "Ajouter un contact principal", onglet: "contacts", action: "contact" });
  if (!org.centres.length) manques.push({ libelle: "Ajouter un premier centre", onglet: "centres", action: "centre" });
  if (["PROPOSITION", "SIGNE", "EN_INTEGRATION", "EN_PRODUCTION"].includes(org.etape)) {
    if (!org.ris?.trim()) manques.push({ libelle: "Préciser le RIS", onglet: "resume", action: "organisation" });
    // Sans centre, « Ajouter un premier centre » suffit : le rattachement vient après.
    if (org.centres.length && !org.centres.some((c) => c.rattachements.length)) {
      manques.push({ libelle: "Ajouter un produit à un centre", onglet: "centres", action: "rattachement", cibleId: org.centres[0]?.id });
    }
  }
  if (["SIGNE", "EN_INTEGRATION"].includes(org.etape)) {
    if (!org.chefDeProjetId) manques.push({ libelle: "Nommer un chef de projet", onglet: "resume", action: "organisation" });
    const sansDate = org.centres.flatMap((c) => c.rattachements).find((r) => !r.datePromise);
    if (sansDate) manques.push({ libelle: "Poser une date promise", onglet: "centres", action: "date", cibleId: sansDate.id });
  }
  return manques;
}
