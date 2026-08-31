"use client";

import { Alert, AlertTitle, Box, CircularProgress } from "@mui/material";

/**
 * Ce que montre un écran de centre avant d'avoir son `userProductId` (lot U3).
 *
 * Les URL portent le client, les routes API attendent l'affiliation à un produit,
 * et la traduction entre les deux passe par un appel. Il y a donc un court instant
 * où l'écran ne peut rien demander, et un cas où il ne pourra jamais : ce client
 * n'a pas ce produit.
 *
 * LES DEUX MÉRITENT UN AFFICHAGE DIFFÉRENT. Sans ça, « pas encore » et « jamais »
 * se ressemblent : un spinner qui ne s'arrête pas passe pour une panne alors que
 * c'est une réponse.
 */
export default function AttenteCentre({
  introuvable = false,
  produit = "ce produit",
}: {
  introuvable?: boolean;
  produit?: string;
}) {
  if (introuvable) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" variant="outlined">
          <AlertTitle>Ce centre n&apos;a pas {produit}</AlertTitle>
          Le produit n&apos;est pas activé pour ce compte. Si le lien vous a été
          transmis, demandez qu&apos;on vous le renvoie : il pointe peut-être vers un
          centre qui a changé d&apos;offre.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
      <CircularProgress
        sx={{ "& .MuiCircularProgress-svg": { color: "var(--accent)" } }}
      />
    </Box>
  );
}
