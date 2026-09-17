"use client";

import { useCentreProduit } from "@/hooks/useCentreProduit";
import AttenteCentre from "@/components/centre/AttenteCentre";
import Ecran from "../../talk/stats-no-show/Ecran";

/**
 * Relances no-show, vues depuis Konnect (18/09/2026).
 * Plan : `lyrae/plans/2026-09-relances-no-show-unifiees.md`.
 *
 * Les relances d'AI2Xplore couvrent tous les rendez-vous du centre, quel que soit le canal
 * de prise de rendez-vous : c'est le même écran que « Stats No-Show » de LyraeTalk. Les
 * routes qu'il appelle lisent le réglage et les chiffres chez le porteur du client
 * (`src/lib/porteurRelances.ts`), si bien qu'un client qui a les deux produits voit les
 * mêmes informations ici et là.
 */
export default function Page() {
  const { userProductId, introuvable } = useCentreProduit();

  if (introuvable) return <AttenteCentre introuvable produit="LyraeKonnect" />;
  if (userProductId === null) return <AttenteCentre />;

  return <Ecran params={{ id: String(userProductId) }} />;
}
