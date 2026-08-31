"use client";

import { Alert, AlertTitle, Box } from "@mui/material";
import { useCentreProduit } from "@/hooks/useCentreProduit";

/**
 * Dit franchement que ce centre n'a pas ce produit, au lieu de tourner (lot U2).
 *
 * Les pages gardent toutes leurs effets par `if (!userProductId) return`, ce qui
 * les protège d'un appel API sur un identifiant vide. Mais quand la résolution
 * aboutit à « ce client n'est pas affilié à LyraeKonnect », cette garde ne lève
 * jamais et l'écran reste en chargement pour toujours. Vu de l'utilisateur, ça
 * ressemble à une panne alors que c'est une réponse.
 *
 * Le cas se produit sur une URL saisie à la main, et surtout sur un lien envoyé
 * avant qu'une affiliation ne soit retirée.
 *
 * ON NE BLOQUE PAS PENDANT LE CHARGEMENT, volontairement. Intercepter aussi cet
 * état mettrait un spinner devant les neuf écrans à chaque navigation, le temps
 * d'un aller-retour dont les pages n'ont pas besoin pour dessiner leur cadre.
 */
export default function GardeProduit({ children }: { children: React.ReactNode }) {
  const { introuvable } = useCentreProduit();

  if (!introuvable) return <>{children}</>;

  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="warning" variant="outlined">
        <AlertTitle>Ce centre n&apos;a pas LyraeKonnect</AlertTitle>
        Le portail de prise de rendez-vous en ligne n&apos;est pas activé pour ce
        compte. Si le lien vous a été transmis, demandez qu&apos;on vous le renvoie :
        il pointe peut-être vers un centre qui a changé d&apos;offre.
      </Alert>
    </Box>
  );
}
