"use client";

import { useState } from "react";
import { Box, Typography, Tabs, Tab, Paper } from "@mui/material";
import ModifyClientProducts from "@/components/ModifyClientProducts";
import ResetClientPassword from "@/components/ResetClientPassword";

/**
 * Page d’administration : gestion des clients.
 * Responsabilités :
 *  - Fournir une interface à onglets pour :
 *      1) Modifier les produits associés à un client.
 *      2) Réinitialiser le mot de passe d’un client.
 *  - Gérer l’état d’onglet local et rendre le contenu correspondant.
 */
export default function ManageClientsPage() {
  /** État local : onglet actif. */
  const [currentTab, setCurrentTab] = useState(0);

  /** Gestion du changement d’onglet (Tabs MUI). */
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  /**
   * Rendu principal :
   *  - Conteneur centré avec carte blanche.
   *  - En-tête de page.
   *  - Barre d’onglets.
   *  - Contenu conditionnel selon l’onglet sélectionné.
   */
  return (
    <Box
      sx={{
        maxWidth: "800px",
        margin: "auto",
        p: 4,
        backgroundColor: "white",
        boxShadow: 3,
        borderRadius: 2,
      }}
    >
      {/* En-tête */}
      <Typography fontWeight="700" variant="h4" textAlign="center" mb={2}>
        Manage Clients
      </Typography>

      {/* Barre d’onglets */}
      <Paper elevation={2} sx={{ mb: 2 }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          centered
        >
          <Tab label="Modify Client Products" />
          <Tab label="Reset Password" />
        </Tabs>
      </Paper>

      {/* Contenu de l’onglet actif */}
      <Box mt={4}>
        {currentTab === 0 ? <ModifyClientProducts /> : <ResetClientPassword />}
      </Box>
    </Box>
  );
}
