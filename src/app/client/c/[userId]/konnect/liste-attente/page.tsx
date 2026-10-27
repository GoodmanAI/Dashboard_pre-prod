"use client";

import { useCentreProduit } from "@/hooks/useCentreProduit";
import ListeAttenteEcran from "@/components/konnect/ListeAttenteEcran";

/** Liste d'attente des patients LyraeKonnect (27/10/2026) : la vue est dans le composant. */
export default function ListeAttenteKonnect() {
  const { userProductId } = useCentreProduit();
  return <ListeAttenteEcran userProductId={userProductId} />;
}
