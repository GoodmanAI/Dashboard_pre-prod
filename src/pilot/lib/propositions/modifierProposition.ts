import type { z } from "zod";
import type { contenuProposition } from "@/pilot/lib/validation/proposition";
import { journaliser } from "@/pilot/lib/evenements/journaliser";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { chargerSousVerrou, copierLigne, ecrireConditionnellement, inclureLignes, transactionProposition } from "./commun";

/** La version lue par le dialogue n'est plus celle de la base : un préremplissage, ou un autre écran, l'a changée. */
export const MESSAGE_VERSION_CHANGEE = "Cette version vient de changer. Rechargez la page.";

/**
 * Modifie une version. Avec des lignes, `majLe` (la version lue par l'écran)
 * est obligatoire (validation) et comparée sous le verrou : si un
 * préremplissage ou un autre écran a écrit entre-temps, 409 et rien n'est
 * écrit. Sans elle, un dialogue ouvert avant un préremplissage remettrait ses
 * anciennes lignes en silence.
 */
export async function modifierProposition(id: number, donnees: z.output<typeof contenuProposition>, auteurId: number) {
  return transactionProposition(async (tx) => {
    const p = await chargerSousVerrou(tx, id);
    const { lignes: lignesRecues, majLe: versionLue, ...contenu } = donnees;
    if (versionLue !== undefined && +versionLue !== +p.majLe) throw new ErreurMetier(MESSAGE_VERSION_CHANGEE, 409);
    const transmis = Object.keys(donnees).filter((c) => c !== "majLe" && donnees[c as keyof typeof donnees] !== undefined);
    if (p.statut !== "BROUILLON" && transmis.some((c) => !["reponseClient", "notes", "documentUrl"].includes(c))) {
      throw new ErreurMetier("Une proposition envoyée ne change plus. Créez une nouvelle version.", 400);
    }
    // Seuls les champs qui changent vraiment sont écrits et journalisés.
    const diff = champsChanges(p, contenu, ["remisePourMille", "engagementMois", "preavisMois", "valideJusquAu", "documentUrl", "reponseClient", "notes"]);
    const memesLignes = (a: object[], b: object[]) => JSON.stringify(a) === JSON.stringify(b);
    // `offerte` (lot S) compte comme le reste : une ligne qui devient offerte change la version.
    const normaliser = (l: { productId?: number | null; centreId?: number | null; type: string; montantCentimes: number; unite?: string | null; volumeInclus?: number | null; libelle?: string | null; offerte?: boolean;
      quantite?: number | null; prixUnitaireCentimes?: number | null; baseQuantite?: string | null; remisePourMille?: number | null }) =>
      ({ productId: l.productId ?? null, centreId: l.centreId ?? null, type: l.type, montantCentimes: l.montantCentimes, unite: l.unite ?? null, volumeInclus: l.volumeInclus ?? null, libelle: l.libelle ?? null, offerte: l.offerte ?? false,
        quantite: l.quantite ?? null, prixUnitaireCentimes: l.prixUnitaireCentimes ?? null, baseQuantite: l.baseQuantite ?? null, remisePourMille: l.remisePourMille ?? null });
    const lignes = lignesRecues && !memesLignes(lignesRecues.map(normaliser), p.lignes.map((l) => normaliser(copierLigne(l)))) ? lignesRecues : undefined;
    const champs = [...Object.keys(diff.apres), ...(lignes ? ["lignes"] : [])];
    if (!champs.length) return p;
    if (lignes) {
      // Une ligne sans produit (lot S) n'a pas de produit à vérifier.
      const produits = [...new Set(lignes.flatMap((l) => l.productId == null ? [] : [l.productId]))];
      const centres = [...new Set(lignes.flatMap((l) => l.centreId == null ? [] : [l.centreId]))];
      if (await tx.product.count({ where: { id: { in: produits } } }) !== produits.length) throw new ErreurMetier("Produit inconnu dans les lignes.", 400);
      if (await tx.crmCentre.count({ where: { id: { in: centres }, organisationId: p.organisationId } }) !== centres.length) {
        throw new ErreurMetier("Le centre doit appartenir à cette organisation.", 400);
      }
    }
    await ecrireConditionnellement(tx, p, { ...diff.apres, majLe: new Date() });
    if (lignes) {
      await tx.crmLigneProposition.deleteMany({ where: { propositionId: id } });
      if (lignes.length) await tx.crmLigneProposition.createMany({ data: lignes.map((l) => ({ ...l, propositionId: id })) });
    }
    await journaliser(tx, { type: "PROPOSITION_STATUT_CHANGE", organisationId: p.organisationId, propositionId: id, auteurId,
      resume: `Version ${p.version} modifiée`, apres: { champs } });
    return tx.crmProposition.findUniqueOrThrow({ where: { id }, include: inclureLignes });
  });
}
