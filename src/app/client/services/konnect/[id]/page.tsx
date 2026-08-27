"use client";

import React from "react";
import { Box, Card, CardActionArea, Grid, Stack, Typography } from "@mui/material";
import { useParams, useRouter } from "next/navigation";
import {
  IconSettings,
  IconListDetails,
  IconChevronRight,
  IconChartLine,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

/**
 * Accueil du produit LyraeKonnect.
 *
 * Remplace la redirection vers le paramétrage : le clic sur le logo doit mener
 * quelque part, pas rebondir. Comme le produit n'a pas encore de pilotage, cette
 * page sert de point de départ et dit ce qui est disponible.
 *
 * Le tableau de bord de suivi viendra à l'étape 7 du chantier multi-produit
 * (chemin *push*, sur le modèle de `calls/summary`) et prendra alors la place des
 * raccourcis, qui redescendront plus bas.
 *
 * Pas de titre de produit ici : le sélecteur du header le porte déjà, et le
 * répéter à deux centimètres de distance n'apprend rien.
 */

type Raccourci = {
  titre: string;
  description: string;
  chemin: string;
  Icone: React.ElementType;
};

const RACCOURCIS: Raccourci[] = [
  {
    titre: "Mapping d'examens",
    description:
      "Les examens que le portail peut proposer, et leur code dans votre logiciel de gestion.",
    chemin: "examens",
    Icone: IconListDetails,
  },
  {
    titre: "Paramètres du portail",
    description:
      "Consignes affichées au patient, notifications, questionnaire clinique, limites de gabarit.",
    chemin: "parametrage",
    Icone: IconSettings,
  },
];

export default function AccueilKonnect() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  return (
    <PageContainer
      title="LyraeKonnect"
      description="Prise de rendez-vous en ligne"
    >
      <Box>
        <SectionHeader
          title="Bienvenue"
          subtitle="Votre portail de prise de rendez-vous en ligne"
        />

        <Grid container spacing={2}>
          {RACCOURCIS.map(({ titre, description, chemin, Icone }) => (
            <Grid item xs={12} md={6} key={chemin}>
              <Card
                variant="outlined"
                sx={{
                  borderColor: "#E4EAEE",
                  borderRadius: 2,
                  height: "100%",
                  transition: "border-color .15s",
                  "&:hover": { borderColor: "var(--accent)" },
                }}
              >
                <CardActionArea
                  onClick={() => router.push(`/client/services/konnect/${id}/${chemin}`)}
                  sx={{ p: 2.5, height: "100%" }}
                >
                  <Stack direction="row" spacing={2} alignItems="flex-start">
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: 2,
                        flexShrink: 0,
                        display: "grid",
                        placeItems: "center",
                        color: "var(--accent-deep)",
                        bgcolor: "rgba(var(--accent-rgb), 0.12)",
                      }}
                    >
                      <Icone size={22} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {titre}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {description}
                      </Typography>
                    </Box>
                    <IconChevronRight size={18} style={{ opacity: 0.4, flexShrink: 0 }} />
                  </Stack>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Ce qui n'existe pas encore, dit franchement plutôt que laissé deviner. */}
        <Card
          variant="outlined"
          sx={{
            mt: 2,
            p: 2.5,
            borderColor: "#E4EAEE",
            borderRadius: 2,
            borderStyle: "dashed",
            bgcolor: "#F7FAFB",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ color: "text.disabled", display: "flex" }}>
              <IconChartLine size={22} />
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                Suivi de l&apos;activité
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Les rendez-vous pris en ligne, les dossiers à traiter et les
                statistiques du portail arriveront ici prochainement.
              </Typography>
            </Box>
          </Stack>
        </Card>
      </Box>
    </PageContainer>
  );
}
