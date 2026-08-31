"use client";

import { useCentreProduit } from "@/hooks/useCentreProduit";
import AttenteCentre from "@/components/centre/AttenteCentre";
import Ecran from "./Ecran";

/**
 * Traduit le client de l'URL en `userProductId` pour l'écran (lot U3).
 *
 * L'URL porte le client, l'écran attend l'affiliation à LyraeTalk : quelqu'un doit
 * faire le pont. C'est ce fichier, et rien d'autre.
 *
 * POURQUOI UN ADAPTATEUR PLUTÔT QUE LE HOOK DANS L'ÉCRAN. Quatre écrans de Talk
 * lancent leur `fetch` sans garder l'identifiant : appelés pendant la résolution,
 * ils interrogeraient l'API sur une valeur vide. En montant l'écran seulement une
 * fois l'identifiant connu, le problème ne se pose pour aucun des quatorze, et
 * aucune ligne de leur logique n'a bougé.
 *
 * L'écran garde donc sa signature d'origine, `params.id` = `userProductId`, la
 * même que celle attendue par les ré-exports de `/admin/clients/`.
 */
export default function Page({ params }: { params: { callId: string } }) {
  const { userProductId, introuvable } = useCentreProduit();

  if (introuvable) return <AttenteCentre introuvable produit="LyraeTalk" />;
  if (userProductId === null) return <AttenteCentre />;

  return <Ecran params={{ id: String(userProductId), callId: params.callId }} />;
}
