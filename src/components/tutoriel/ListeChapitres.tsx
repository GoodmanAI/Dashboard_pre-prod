"use client";

import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { IconCircleCheckFilled, IconPlayerPlay } from "@tabler/icons-react";
import {
  BORDER,
  INK,
  INK_MUTED,
  OK,
  WARNING,
  WARNING_SOFT,
} from "@/lib/jetons";
import type { EtatChapitre } from "@/lib/tutoriel/types";
import { useTutoriel } from "./ContexteTutoriel";

/** L'état d'un chapitre en une étiquette. Rien quand il n'y a rien à vérifier. */
function Etiquette({
  etat,
  primordial,
}: {
  etat: EtatChapitre;
  primordial?: boolean;
}) {
  if (etat === "a_faire") {
    return (
      <Chip
        size="small"
        label={primordial ? "À faire en premier" : "À compléter"}
        sx={{ bgcolor: WARNING_SOFT, color: WARNING, fontWeight: 700 }}
      />
    );
  }
  if (etat === "a_verifier") {
    return (
      <Chip
        size="small"
        variant="outlined"
        label="Rempli, à vérifier"
        sx={{ color: INK_MUTED }}
      />
    );
  }
  return null;
}

/**
 * Les chapitres, leur état et un bouton pour lancer chacun. Partagé par le sommaire de
 * l'accueil et le choix du menu du profil.
 */
export default function ListeChapitres() {
  const tuto = useTutoriel();
  if (!tuto) return null;
  return (
    <Stack component="ol" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
      {tuto.chapitres.map((c, i) => {
        const etat = tuto.etats[c.cle] ?? null;
        const vu = tuto.vus.includes(c.cle);
        return (
          <Box
            component="li"
            key={c.cle}
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 1.5,
              rowGap: 1,
              p: 1.5,
              border: `1px solid ${BORDER}`,
              borderRadius: 2,
              bgcolor:
                etat === "a_faire" ? "rgba(180, 96, 42, 0.04)" : "transparent",
            }}
          >
            <Box sx={{ flex: "1 1 240px", minWidth: 0 }}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                useFlexGap
                flexWrap="wrap"
              >
                <Typography
                  sx={{ fontWeight: 600, fontSize: 14.5, color: INK }}
                >
                  {i + 1}. {c.titre}
                </Typography>
                {vu && etat === null && (
                  <IconCircleCheckFilled
                    size={16}
                    color={OK}
                    aria-label="Déjà vu"
                  />
                )}
                <Etiquette etat={etat} primordial={c.primordial} />
              </Stack>
              <Typography variant="body2" sx={{ color: INK_MUTED, mt: 0.25 }}>
                {c.resume}
              </Typography>
            </Box>
            <Button
              size="small"
              variant={etat === "a_faire" ? "contained" : "outlined"}
              startIcon={<IconPlayerPlay size={14} />}
              onClick={() => tuto.demarrer(c.cle)}
              sx={{
                ml: "auto",
                flexShrink: 0,
                textTransform: "none",
                ...(etat === "a_faire" && {
                  bgcolor: WARNING,
                  "&:hover": { bgcolor: "#9A5023" },
                }),
              }}
            >
              {vu ? "Revoir" : "Voir"}
            </Button>
          </Box>
        );
      })}
    </Stack>
  );
}
