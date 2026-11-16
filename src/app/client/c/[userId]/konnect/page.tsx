"use client";

import { IconChartBar, IconListDetails, IconSettings } from "@tabler/icons-react";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import { cheminCentre } from "@/lib/cheminsCentre";
import AccueilProduit from "@/components/accueil/AccueilProduit";

/**
 * Accueil de LyraeKonnect (16/11/2026) : la recherche centrale d'abord, puis trois accès
 * directs. Même gabarit que l'accueil de Talk (`AccueilProduit`), à la couleur du portail.
 */

// Phrases que la recherche résout (corpus `scripts/recherche/corpus.json`).
const EXEMPLES_KONNECT = [
  "Les demandes de rappel pas encore traitées",
  "Les statistiques du portail ce mois-ci",
  "Changer le logo du portail",
];

export default function AccueilKonnect() {
  const { userId } = useCentreProduit();
  const chemin = (suite: string) => (userId !== null ? cheminCentre(userId, "konnect", suite) : "#");

  return (
    <AccueilProduit
      titrePage="LyraeKonnect"
      descriptionPage="Accueil du portail de prise de rendez-vous en ligne"
      exemples={EXEMPLES_KONNECT}
      ancreTutoriel="premiers_pas"
      placeholder="Ce que vous cherchez"
      acces={[
        {
          titre: "Mapping des examens",
          description: "Les examens réservables en ligne et leur code dans votre logiciel.",
          href: chemin("examens"),
          Icone: IconListDetails,
        },
        {
          titre: "Paramètres du portail",
          description: "Logo, consignes au patient, notifications, questionnaire clinique.",
          href: chemin("parametrage"),
          Icone: IconSettings,
        },
        {
          titre: "Statistiques",
          description: "Rendez-vous pris en ligne, examens demandés, appels évités.",
          href: chemin("statistiques"),
          Icone: IconChartBar,
        },
      ]}
    />
  );
}
