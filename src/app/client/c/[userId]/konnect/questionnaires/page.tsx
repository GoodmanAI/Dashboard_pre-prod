"use client";

import { useCentreProduit } from "@/hooks/useCentreProduit";
import AttenteCentre from "@/components/centre/AttenteCentre";
import Ecran from "../../talk/ordonnances-manquantes/Ecran";

/**
 * Questionnaires des patients de Konnect (26/10/2026, plan workspace
 * plans/2026-10-konnect-questionnaires-centre.md).
 *
 * Le patient du portail reçoit, après sa réservation, le lien de dépôt de ses
 * questionnaires ; ceux qui ne les ont pas remplis passé le délai du centre
 * (24 h par défaut) apparaissent ici. C'est l'écran « Ordonnances manquantes »
 * de LyraeTalk, en mode `konnect` : les liens de Konnect seulement, une seule liste.
 *
 * Les liens vivent sur l'affiliation LyraeTalk du centre : c'est elle qui porte
 * les codes de site (ExternalCenterMapping) par lesquels /api/prescriptions/init
 * les rattache. Un centre sans LyraeTalk les porte sur son affiliation Konnect.
 */
export default function Page() {
  const { userProductId, produits, introuvable } = useCentreProduit();

  if (introuvable) return <AttenteCentre introuvable produit="LyraeKonnect" />;
  if (userProductId === null) return <AttenteCentre />;

  const produitLiens =
    produits.find((p) => p.slug === "talk")?.userProductId ?? userProductId;

  return <Ecran params={{ id: String(produitLiens) }} canal="konnect" />;
}
