"use client";

import React, { useEffect, useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import CombinaisonsEtPaires from "@/components/konnect/multiExamens/CombinaisonsEtPaires";
import ReglesCoexistence from "@/components/konnect/multiExamens/ReglesCoexistence";

/**
 * Multi examens (18/09/2026) : ce qu'un patient qui demande plusieurs examens peut faire.
 *
 * Réunit deux écrans qui se recouvraient aux yeux du client :
 *
 * - **Réservation en ligne** (ex « Examens qui vont ensemble », domaine
 *   `konnect.paires-examens`) : les combinaisons de modalités réservables ensemble et
 *   l'attente maximale. C'est le seul réglage APPLIQUÉ par le portail aujourd'hui.
 * - **Règles de coexistence** (domaine `konnect.regles-coexistence`) : jamais le même
 *   jour, dans la même venue, seulement sur certains sites. Enregistrées et transmises,
 *   mais qu'aucun moteur n'applique encore. L'onglet le dit.
 *
 * Les deux domaines, leurs droits de page et la route `regles-coexistence` (qui renvoie
 * ici) restent tels quels : les valeurs de droits sont des énumérations en base.
 *
 * LES DEUX ONGLETS RESTENT MONTÉS. Chacun a sa barre d'enregistrement flottante ; masquer
 * l'onglet inactif (plutôt que le démonter) évite de perdre une saisie en changeant
 * d'onglet, et cache sa barre avec lui.
 */

const ONGLETS = ["reservation", "coexistence"] as const;
type Onglet = (typeof ONGLETS)[number];

export default function MultiExamensKonnect() {
  const [onglet, setOnglet] = useState<Onglet>("reservation");

  // `?onglet=coexistence` : l'ancienne adresse de l'écran des règles y mène.
  useEffect(() => {
    const demande = new URLSearchParams(window.location.search).get("onglet");
    if (demande === "coexistence") setOnglet("coexistence");
  }, []);

  return (
    <PageContainer title="Multi examens" description="Plusieurs examens pour un même patient">
      <Box>
        <SectionHeader
          title="Multi examens"
          subtitle="Ce qu'un patient qui a plusieurs examens peut réserver en ligne"
        />
        <Tabs
          value={onglet}
          onChange={(_, v: Onglet) => setOnglet(v)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ mb: 3, borderBottom: "1px solid #E4EAEE" }}
        >
          <Tab value="reservation" label="Réservation en ligne" sx={{ textTransform: "none" }} />
          <Tab
            value="coexistence"
            label="Règles de coexistence (pas encore appliquées)"
            sx={{ textTransform: "none" }}
          />
        </Tabs>
        <Box sx={{ display: onglet === "reservation" ? "block" : "none" }}>
          <CombinaisonsEtPaires />
        </Box>
        <Box sx={{ display: onglet === "coexistence" ? "block" : "none" }}>
          <ReglesCoexistence />
        </Box>
      </Box>
    </PageContainer>
  );
}
