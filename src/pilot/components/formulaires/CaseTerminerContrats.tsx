"use client";

import { Box, Checkbox, FormControlLabel, Typography } from "@mui/material";

/** Cochée par défaut : un client parti ne compte plus dans les abonnements signés. Décochée, les contrats restent à terminer dans l'onglet Argent. */
export function CaseTerminerContrats({ nombre }: { nombre: number }) {
  return <Box>
    <FormControlLabel control={<Checkbox name="terminerContrats" defaultChecked />}
      label={nombre > 1 ? `Terminer aussi les ${nombre} contrats actifs, à la date du jour` : "Terminer aussi le contrat actif, à la date du jour"} />
    <Typography variant="caption" color="text.secondary" component="p">Sinon, ils restent comptés dans les abonnements signés.</Typography>
  </Box>;
}
