import type { z } from "zod";
import type { creationVersion } from "@/pilot/lib/validation/proposition";
import { journaliser } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { lireGrilleEnVigueurVerrouillee } from "@/pilot/lib/tarifs/grille";
import { copierLigne, inclureLignes, transactionProposition } from "./commun";
import { RefusPreremplissage, chargerPreremplissage, preparerLignes, type RemarqueExpliquee } from "./lignesPreremplies";

/**
 * Ce que le préremplissage a fait, pour que l'écran dise pourquoi une ligne
 * manque ou reste à chiffrer. L'indicateur « prix à renseigner » n'est pas
 * stocké : une ligne à 0 qui n'est pas offerte le dit après coup.
 */
export type ResultatPreremplissage = {
  /** La grille dont la version tire ses prix. Une version préremplie a toujours au moins une ligne de la grille. */
  grilleId: number | null;
  /** Le jour de la grille réellement utilisée (« AAAA-MM-JJ ») : l'écran l'affiche, plutôt que la date lue au chargement de la page. */
  applicableLe: string | null;
  remarques: RemarqueExpliquee[];
  /** Les lignes créées dont le prix est à renseigner : à 0, jamais un prix inventé. */
  lignesARenseigner: number[];
};

/**
 * Crée la nouvelle version d'une organisation (C-39). Sans `preremplir`, elle
 * reprend les lignes, la remise, l'engagement, le préavis **et la grille** de la
 * plus récente, ou naît vide. Avec `preremplir` (lot S), ses lignes viennent de
 * la grille tarifaire en vigueur (`preremplir`, src/lib/tarifs/preremplir.ts) :
 * la remise, l'engagement et le préavis restent ceux de la version précédente,
 * et `grilleId` est figé sur la version. Si la grille ne donne aucune ligne
 * (aucun centre, aucune offre, centres sans salle, pas de grille), rien n'est
 * créé : 400 avec les remarques (`RefusPreremplissage`), plus de brouillon vide.
 * Un brouillon existant se repréremplit par `preremplirVersion`.
 */
export async function creerVersionDetaillee({ organisationId, preremplir = false }: z.output<typeof creationVersion>, auteurId: number) {
  return transactionProposition(async (tx) => {
    await verrouillerOrganisation(tx, organisationId);
    if (await tx.crmProposition.findFirst({ where: { organisationId, statut: "BROUILLON" }, select: { id: true } })) {
      throw new ErreurMetier("Une version en brouillon existe déjà. Modifiez-la.", 409);
    }
    const precedente = await tx.crmProposition.findFirst({ where: { organisationId }, orderBy: { version: "desc" }, include: inclureLignes });
    let grilleId = precedente?.grilleId ?? null;
    let lignes: Array<ReturnType<typeof copierLigne> | ReturnType<typeof preparerLignes>["lignes"][number]> = precedente?.lignes.map(copierLigne) ?? [];
    let remarques: RemarqueExpliquee[] = [], aRenseigner: boolean[] = [], applicableLe: string | null = null;
    if (preremplir) {
      const grille = await lireGrilleEnVigueurVerrouillee(tx);
      const prepare = preparerLignes(await chargerPreremplissage(tx, organisationId, grille));
      if (prepare.refus) throw new RefusPreremplissage(prepare.refus, prepare.remarques);
      grilleId = grille.id;
      applicableLe = grille.applicableLe;
      ({ lignes, remarques, aRenseigner } = prepare);
    }
    const proposition = await tx.crmProposition.create({ data: {
      organisationId, auteurId, version: (precedente?.version ?? 0) + 1, statut: "BROUILLON", grilleId,
      remisePourMille: precedente?.remisePourMille ?? 0, engagementMois: precedente?.engagementMois, preavisMois: precedente?.preavisMois,
      lignes: { create: lignes },
    }, include: inclureLignes });
    await journaliser(tx, { type: "PROPOSITION_CREEE", organisationId, propositionId: proposition.id, auteurId,
      resume: `Version ${proposition.version} créée`,
      apres: { version: proposition.version, lignes: proposition.lignes.length, ...(preremplir ? { preremplie: true, grilleId } : {}) } });
    // Les lignes naissent dans l'ordre du tableau : les identifiants croissants suivent le préremplissage.
    const lignesARenseigner = preremplir ? proposition.lignes.filter((_, i) => aRenseigner[i]).map((l) => l.id) : [];
    return { proposition, preremplissage: preremplir ? { grilleId, applicableLe, remarques, lignesARenseigner } satisfies ResultatPreremplissage : null };
  });
}

export async function creerVersion(champs: z.output<typeof creationVersion>, auteurId: number) {
  return (await creerVersionDetaillee(champs, auteurId)).proposition;
}
