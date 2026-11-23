import type { CrmBaseTarif, CrmTypeLigne } from "@prisma/client";
import type { StatutGrille } from "@/pilot/lib/tarifs/regles";

/** Ce que les écrans des tarifs reçoivent de la page serveur : des dates en chaîne, rien d'autre. */
export type TarifEcran = {
  id: number; code: string; libelle: string; productId: number | null; type: CrmTypeLigne; base: CrmBaseTarif;
  /** Null : « Prix à renseigner ». */
  montantHtCentimes: number | null;
  /** Base pourcentage seulement : 150 = 15 %. */
  pourMille: number | null;
};

export type GrilleEcran = {
  id: number;
  /** « AAAA-MM-JJ ». */
  applicableLe: string;
  notes: string | null;
  /** La version lue : elle part avec chaque écriture, et si elle a changé le serveur répond 409. */
  majLe: string;
  statut: StatutGrille;
  nombrePropositions: number;
  modifiable: boolean;
  raison: string | null;
  dateModifiable: boolean;
  supprimable: boolean;
  tarifs: TarifEcran[];
};
