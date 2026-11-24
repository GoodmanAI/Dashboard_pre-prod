import { prisma } from "@/pilot/lib/prisma";
import { lireGrilleEnVigueur } from "@/pilot/lib/tarifs/grille";
import { lignesFacturation } from "@/lib/sallesFactureesLecture";
import { facturerLignes, prixDesSalles } from "./calcul";

/**
 * Ce que l'écran Facturation lit : les salles cochées au Dashboard (une ligne par
 * client et par site), le prix de la grille de Pilot, et les formations de POC
 * dont la facture n'est pas encore émise (C-95). Trois lectures en parallèle.
 */
export async function chargerFacturation() {
  const [grille, salles, formations] = await Promise.all([
    lireGrilleEnVigueur(),
    lignesFacturation(),
    prisma.crmFormationPoc.findMany({
      where: { factureEmiseLe: null },
      select: { organisationId: true, debuteLe: true, montantCentimes: true, organisation: { select: { raisonSocialeNom: true } } },
      orderBy: { debuteLe: "asc" },
    }),
  ]);
  const prix = prixDesSalles(grille);
  return {
    grilleDu: grille.applicableLe,
    prix,
    ...facturerLignes(salles, prix),
    formations: formations.map((f) => ({
      organisationId: f.organisationId,
      nom: f.organisation.raisonSocialeNom,
      debuteLe: f.debuteLe.toISOString().slice(0, 10),
      montantCentimes: f.montantCentimes,
    })),
  };
}
