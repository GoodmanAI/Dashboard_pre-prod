"use client";

import React from "react";
import Link from "next/link";
import { Box, Card, CardActionArea, Typography } from "@mui/material";
import { IconArrowRight } from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import BarreRecherche from "@/components/recherche/BarreRecherche";
import SommaireTutoriel from "@/components/tutoriel/SommaireTutoriel";
import { BORDER, INK, INK_MUTED, SURFACE } from "@/lib/jetons";

/**
 * Accueil d'un produit (LyraeTalk, LyraeKonnect), 16/11/2026.
 *
 * Le client arrive sur la recherche centrale : il demande ce qu'il veut voir, l'écran
 * s'ouvre préfiltré dans le panneau. Dessous, trois accès directs (correspondance des
 * examens, paramètres, statistiques), puis ce que le produit veut ajouter (`children`,
 * la ligne du jour de Talk), puis la carte du tutoriel.
 *
 * Écran d'outil ouvert des dizaines de fois par jour : aucune animation d'entrée. Seule
 * exception, voulue par Enzo (16/11/2026) : une bande lente dans la couleur du produit passe
 * sur le titre et la phrase toutes les 10 s (`.accueil-degrade` de `global.css`), sans rien
 * déplacer ; coupée quand le système demande moins d'animations.
 */

export type AccesDirect = {
  titre: string;
  description: string;
  href: string;
  Icone: React.ElementType;
  /** Ancre (`id`) de la tuile, pour le tutoriel ou la recherche. */
  ancre?: string;
};

export default function AccueilProduit({
  titrePage,
  descriptionPage,
  exemples,
  placeholder,
  acces,
  ancreTutoriel,
  children,
}: {
  titrePage: string;
  descriptionPage: string;
  /** Phrases que la recherche sait résoudre pour ce produit (voir `scripts/recherche/corpus.json`). */
  exemples: string[];
  /** Exemple écrit dans la barre vide, propre au produit. */
  placeholder: string;
  acces: AccesDirect[];
  /** Ancre de la carte du tutoriel, déclarée par l'écran (la recherche et le tutoriel y mènent). */
  ancreTutoriel: string;
  children?: React.ReactNode;
}) {
  return (
    <PageContainer title={titrePage} description={descriptionPage}>
      <Box sx={{ maxWidth: 880, mx: "auto" }}>
        <Box
          component="section"
          aria-labelledby="accueil-titre"
          sx={{
            textAlign: "center",
            pt: { xs: 2, md: 7 },
            pb: { xs: 1, md: 2 },
          }}
        >
          <Typography
            id="accueil-titre"
            component="h1"
            className="accueil-degrade"
            sx={{
              fontSize: { xs: 26, md: 34 },
              fontWeight: 600,
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
              textWrap: "balance",
            }}
          >
            Que voulez-vous voir ?
          </Typography>
          <Typography
            className="accueil-degrade accueil-degrade--doux"
            sx={{
              mt: 1.25,
              mb: { xs: 2.5, md: 3.5 },
              mx: "auto",
              maxWidth: 600,
              fontSize: { xs: 15, md: 16 },
              lineHeight: 1.5,
              textWrap: "balance",
            }}
          >
            Écrivez ou dictez votre demande comme à un collègue : l&apos;écran
            s&apos;ouvre déjà filtré.
          </Typography>
          <BarreRecherche
            variante="accueil"
            exemples={exemples}
            placeholder={placeholder}
            focusAuChargement
            pleineLargeur
          />
        </Box>

        <Box component="nav" aria-label="Accès directs">
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                sm: `repeat(${acces.length}, minmax(0, 1fr))`,
              },
            }}
          >
            {acces.map((a) => (
              <TuileAcces key={a.href} {...a} />
            ))}
          </Box>
        </Box>

        {children && <Box sx={{ mt: 3 }}>{children}</Box>}

        <Box sx={{ mt: 4 }}>
          <SommaireTutoriel id={ancreTutoriel} />
        </Box>
      </Box>
    </PageContainer>
  );
}

function TuileAcces({ titre, description, href, Icone, ancre }: AccesDirect) {
  return (
    <Card
      id={ancre}
      variant="outlined"
      sx={{
        borderColor: BORDER,
        borderRadius: 2.5,
        bgcolor: SURFACE,
        height: "100%",
        transition:
          "border-color 200ms ease, box-shadow 200ms ease, transform 120ms ease-out",
        "& .fleche": {
          transition:
            "transform 200ms cubic-bezier(0.23, 1, 0.32, 1), color 200ms ease",
        },
        "@media (hover: hover) and (pointer: fine)": {
          "&:hover": {
            borderColor: "rgba(var(--accent-rgb), 0.55)",
            boxShadow: "0 8px 22px -12px rgba(var(--accent-rgb), 0.45)",
          },
          "&:hover .fleche": {
            transform: "translateX(3px)",
            color: "var(--accent-deep)",
          },
        },
        "&:active": { transform: "scale(0.98)" },
      }}
    >
      <CardActionArea
        component={Link}
        href={href}
        sx={{
          height: "100%",
          p: 2.25,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "flex-start",
          gap: 1.5,
          "& .MuiCardActionArea-focusHighlight": { display: "none" },
          "&.Mui-focusVisible": {
            outline: "2px solid var(--accent)",
            outlineOffset: 2,
            borderRadius: 2.5,
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 42,
              height: 42,
              flexShrink: 0,
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              bgcolor: "rgba(var(--accent-rgb), 0.12)",
              color: "var(--accent-deep)",
            }}
          >
            <Icone size={21} stroke={1.75} />
          </Box>
          <Box
            className="fleche"
            aria-hidden
            sx={{ color: "#9AA8B4", display: "flex" }}
          >
            <IconArrowRight size={18} />
          </Box>
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              color: INK,
              fontWeight: 600,
              fontSize: 15.5,
              lineHeight: 1.3,
            }}
          >
            {titre}
          </Typography>
          <Typography
            sx={{
              color: INK_MUTED,
              fontSize: 13.5,
              lineHeight: 1.45,
              mt: 0.5,
              textWrap: "pretty",
            }}
          >
            {description}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}
