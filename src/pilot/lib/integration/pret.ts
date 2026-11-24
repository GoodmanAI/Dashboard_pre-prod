import type { CrmCleEtape, CrmTiers } from "@prisma/client";
import { CHECKLIST, definitionEtape } from "@/pilot/lib/checklist/definition";
import { libelleAttente } from "@/pilot/lib/checklist/reglesAttentes";
import { compter } from "@/pilot/lib/texte";
import { joursEntre } from "./dateRealiste";

export type EtapePret = {
  cle: CrmCleEtape; faite: boolean; motif: string | null; enAttenteDe: CrmTiers | null; demandeeLe: Date | null;
};
export type Manquante = { cle: CrmCleEtape; libelle: string; enAttenteDe: CrmTiers | null; motif: string };

/**
 * Architecture §8.5, sur les étapes bloquantes ouvertes, dans l'ordre du
 * référentiel. Le motif dit pourquoi la case est vide : le constat de
 * l'évaluateur pour une étape automatique, sinon l'attente déclarée, sinon le
 * constat du volet automatique d'une étape mixte, sinon « À faire ».
 * `maintenant` compte les jours d'attente : pas d'horloge implicite.
 */
export function pret({ etapes, maintenant, produit }: { etapes: EtapePret[]; maintenant: Date; produit?: string }): { pret: boolean; manquantes: Manquante[] } {
  const ordre = (cle: CrmCleEtape) => CHECKLIST.findIndex((d) => d.cle === cle);
  const manquantes = etapes.filter((e) => !e.faite && definitionEtape(e.cle).bloquante)
    .sort((a, b) => ordre(a.cle) - ordre(b.cle))
    .map((e): Manquante => {
      const def = definitionEtape(e.cle, produit);
      return { cle: e.cle, libelle: def.libelle, enAttenteDe: e.enAttenteDe, motif: motif(e, def.mode, maintenant) };
    });
  return { pret: manquantes.length === 0, manquantes };
}

function motif(e: EtapePret, mode: string, maintenant: Date): string {
  if (mode === "AUTOMATIQUE" && e.motif) return e.motif;
  if (e.enAttenteDe) {
    if (!e.demandeeLe) return libelleAttente(e.enAttenteDe);
    const jours = Math.max(0, joursEntre(e.demandeeLe, maintenant));
    return `${libelleAttente(e.enAttenteDe)} ${jours === 0 ? "depuis aujourd'hui" : `depuis ${compter(jours, "jour")}`}`;
  }
  return e.motif ?? "À faire";
}
