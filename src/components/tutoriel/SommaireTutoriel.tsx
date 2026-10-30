"use client";

import { Box, Button, Stack, Typography } from "@mui/material";
import { usePremiersPas } from "@/hooks/usePremiersPas";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import { useIntegre } from "@/lib/recherche/integre";
import { BORDER, INK, INK_MUTED, SURFACE } from "@/lib/jetons";
import { useTutoriel } from "./ContexteTutoriel";
import ListeChapitres from "./ListeChapitres";

/**
 * Le sommaire du tutoriel, en tête de l'accueil (remplace la carte « Premiers pas » du
 * 29/10). Il dit ce qui reste à faire, chapitre par chapitre, et lance la visite.
 *
 * Visible tant que la personne ne l'a pas rangé ; ensuite, le tutoriel reste dans le
 * menu du profil. Dans le panneau de la recherche, seulement si c'est lui qu'on cherche
 * (« par où commencer »), et alors même rangé.
 *
 * `id` : l'ancre de la recherche centrale, posée par l'écran (son contrôle la cherche là).
 */
export default function SommaireTutoriel({ id }: { id: string }) {
  const tuto = useTutoriel();
  const integre = useIntegre();
  const { etat, agir } = usePremiersPas();
  const { produit } = useCentreProduit();
  const demande = integre?.ancre === "premiers_pas";

  if (!tuto?.disponible || !etat) return null;
  if (integre && !demande) return null;
  if (etat.masque && !demande) return null;

  const aFaire = tuto.chapitres.filter(
    (c) => tuto.etats[c.cle] === "a_faire",
  ).length;

  return (
    <Box
      id={id}
      sx={{
        mb: 3,
        p: { xs: 2, sm: 2.5 },
        bgcolor: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 2,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "flex-start" }}
        spacing={1}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 17, color: INK }}>
            Tutoriel
          </Typography>
          <Typography variant="body2" sx={{ color: INK_MUTED, mt: 0.25 }}>
            {aFaire > 0
              ? `${aFaire} chapitre${aFaire > 1 ? "s" : ""} à compléter avant que ${produit === "konnect" ? "le portail" : "le robot"} puisse bien travailler. Commencez par le premier en orange.`
              : "Tout l'essentiel est rempli. Revoyez un chapitre quand vous voulez."}
          </Typography>
        </Box>
        {!integre && (
          <Button
            size="small"
            onClick={() => void agir({ masque: true })}
            sx={{
              flexShrink: 0,
              alignSelf: { xs: "flex-start", sm: "auto" },
              textTransform: "none",
            }}
          >
            Masquer
          </Button>
        )}
      </Stack>
      <ListeChapitres />
      {!integre && (
        <Typography variant="body2" sx={{ color: INK_MUTED, mt: 1.5 }}>
          Masqué, le tutoriel reste dans le menu de votre profil, en haut à
          droite.
        </Typography>
      )}
    </Box>
  );
}
