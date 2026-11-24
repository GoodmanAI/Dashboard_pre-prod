import type { CrmCleEtape } from "@prisma/client";
import { lireRis, PLUSIEURS_RIS } from "@/pilot/lib/organisations/temperature";

/** C-93 : aucune deuxième case pour un fait déjà connu dans Pilot. */
export const PREREQUIS = [
  { id: "telephonie", cle: "INTERFACAGE_TELEPHONIQUE", libelle: "Téléphonie", aide: "Branchez la ligne et cochez les essais dans la check-list." },
  { id: "ris", cle: null, libelle: "RIS", aide: "Renseignez le RIS du centre ou de l'organisation sur la fiche." },
  { id: "commande-edl", cle: "BON_COMMANDE_EDL", libelle: "Bon de commande EDL reçu", aide: "Confirmez la réception de la commande passée à EDL dans la check-list. Une attente auprès d'EDL peut être déclarée." },
  { id: "commercial-edl", cle: null, libelle: "Commercial EDL identifié", aide: "Ajoutez le commercial dans Contacts avec le métier « Commercial EDL ». Le commercial RIS déjà saisi dans Apport d'affaires compte aussi." },
  { id: "api", cle: "JETON_XPLORE", libelle: "API reçue et testée", aide: "Faites configurer et tester le jeton par l'équipe technique. Cette case est automatique." },
] as const satisfies readonly { id: string; cle: CrmCleEtape | null; libelle: string; aide: string }[];

export function prerequisDeploiement(p: { ris: string | null; commercialEdl?: boolean; produit: string; cases: readonly { cle: CrmCleEtape; faite: boolean }[] }) {
  const ris = lireRis(p.ris);
  const edl = ris.genre === "famille" && ris.famille === "Xplore (EDL)";
  return PREREQUIS.map((r) => {
    // Un RIS inconnu n'exempte pas silencieusement les attentes EDL.
    const applicable = r.cle === "INTERFACAGE_TELEPHONIQUE" ? p.produit === "" || ["LyraeTalk", "Desk"].includes(p.produit)
      : r.id === "commande-edl" || r.id === "commercial-edl" ? ris.genre === "vide" || ris.genre === "famille" && (edl || ris.famille === PLUSIEURS_RIS) : true;
    const faite = r.id === "ris" ? ris.genre === "famille" && ris.famille !== PLUSIEURS_RIS
      : r.id === "commercial-edl" ? p.commercialEdl === true : p.cases.some((c) => c.cle === r.cle && c.faite);
    return { ...r, applicable, faite, detail: !applicable ? "Sans objet pour ce produit ou ce RIS." : faite ? (r.id === "ris" ? p.ris! : "Fait") : r.aide };
  });
}
