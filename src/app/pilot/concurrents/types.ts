import type { CrmEtapeCommerciale, CrmTypeConcurrent } from "@prisma/client";

/** Ce que les écrans des concurrents reçoivent des pages serveur : des dates en chaîne, rien d'autre. */
export type ConcurrentEcran = {
  id: number; nom: string; type: CrmTypeConcurrent; offre: string | null; siteWeb: string | null; notes: string | null;
  /** La version lue : elle part avec la modification, et si elle a changé le serveur répond 409. */
  majLe: string;
};

export type ReleveEcran = {
  id: number; releveLe: string; prixSalleMoisCentimes: number | null; prixInstallationCentimes: number | null;
  conditions: string | null; source: string | null; enVigueur: boolean;
  /** La version lue : elle part avec la correction ou la suppression, et si elle a changé le serveur répond 409. */
  majLe: string;
};

export type LigneConcurrent = ConcurrentEcran & {
  enVigueur: { prixSalleMoisCentimes: number | null; releveLe: string } | null;
  nombreReleves: number; centresEquipes: number; affairesPerdues: number;
};

export type OrganisationLiee = { id: number; raisonSocialeNom: string; etape: CrmEtapeCommerciale };
/** Un établissement équipé : le lien vient de `lienAvecConcurrent` (src/lib/concurrents/effectif.ts). */
export type OrganisationEquipee = OrganisationLiee & { lien: "en_place" | "passe_chez_lyrae" };
export type AffairePerdue = OrganisationLiee & { dateSortie: string | null };
