"use client";

import { useCentreProduit } from "@/hooks/useCentreProduit";
import EcranStatistiquesKonnect from "./Ecran";

/** Adaptateur : le centre courant, puis l'écran (même découpage que Talk). */
export default function StatistiquesKonnect() {
  const { userProductId } = useCentreProduit();
  return <EcranStatistiquesKonnect userProductId={userProductId ?? null} />;
}
