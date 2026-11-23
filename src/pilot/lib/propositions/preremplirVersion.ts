import type { z } from "zod";
import type { preremplissageVersion } from "@/pilot/lib/validation/proposition";
import { journaliser } from "@/pilot/lib/evenements/journaliser";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { lireGrilleEnVigueurVerrouillee } from "@/pilot/lib/tarifs/grille";
import { chargerSousVerrou, conflitProposition, inclureLignes, transactionProposition } from "./commun";
import type { ResultatPreremplissage } from "./creerVersion";
import { RefusPreremplissage, chargerPreremplissage, preparerLignes } from "./lignesPreremplies";

/**
 * Repréremplit une version en brouillon depuis la grille en vigueur (lot S) :
 * ses lignes sont remplacées par celles de `preremplir`, et `grilleId` devient
 * la grille en vigueur. La remise, l'engagement, le préavis et le reste ne
 * changent pas.
 *
 * - **Brouillon seulement.** Une version envoyée ne change plus (400, le même
 *   refus que la modification).
 * - **Version lue.** `majLe` est celle que l'écran a lue : si la version a
 *   changé depuis, 409 « Rechargez la page », et l'écriture elle-même est
 *   conditionnelle (C-26).
 * - **Même verrou que la création** : la grille en vigueur en partage
 *   (`FOR SHARE`), pour qu'une écriture de tarif ne s'intercale pas.
 * - **Aucune ligne, aucune écriture** : si la grille ne donne rien (aucune
 *   offre, aucun centre, grille vide, centres sans salle), 400 avec les
 *   remarques, et la version garde ses lignes.
 * - **Journal** : le type de la modification d'une version, les champs touchés,
 *   le nombre de lignes et la grille (identifiants seulement).
 */
export async function preremplirVersion(id: number, { majLe }: z.output<typeof preremplissageVersion>, auteurId: number) {
  return transactionProposition(async (tx) => {
    const p = await chargerSousVerrou(tx, id);
    if (+p.majLe !== +majLe) throw conflitProposition();
    if (p.statut !== "BROUILLON") throw new ErreurMetier("Une proposition envoyée ne change plus. Créez une nouvelle version.", 400);
    const grille = await lireGrilleEnVigueurVerrouillee(tx);
    const prepare = preparerLignes(await chargerPreremplissage(tx, p.organisationId, grille));
    if (prepare.refus || grille.id === null) throw new RefusPreremplissage(prepare.refus ?? "Aucune grille tarifaire en vigueur.", prepare.remarques);
    // Conditionnelle, comme `ecrireConditionnellement` (qui n'écrit pas la grille d'une version).
    const ecrites = await tx.crmProposition.updateMany({ where: { id, statut: p.statut, majLe: p.majLe },
      data: { grilleId: grille.id, majLe: new Date(Math.max(Date.now(), +p.majLe + 1)) } });
    if (!ecrites.count) throw conflitProposition();
    await tx.crmLigneProposition.deleteMany({ where: { propositionId: id } });
    await tx.crmLigneProposition.createMany({ data: prepare.lignes.map((l) => ({ ...l, propositionId: id })) });
    await journaliser(tx, { type: "PROPOSITION_STATUT_CHANGE", organisationId: p.organisationId, propositionId: id, auteurId,
      resume: `Version ${p.version} préremplie avec la grille`,
      apres: { champs: ["lignes", "grilleId"], lignes: prepare.lignes.length, preremplie: true, grilleId: grille.id } });
    const proposition = await tx.crmProposition.findUniqueOrThrow({ where: { id }, include: inclureLignes });
    // Les lignes naissent dans l'ordre du tableau : les identifiants croissants suivent le préremplissage.
    const lignesARenseigner = proposition.lignes.filter((_, i) => prepare.aRenseigner[i]).map((l) => l.id);
    return { proposition, preremplissage: { grilleId: grille.id, applicableLe: grille.applicableLe, remarques: prepare.remarques, lignesARenseigner } satisfies ResultatPreremplissage };
  });
}
