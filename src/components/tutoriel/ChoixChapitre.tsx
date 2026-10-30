"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { IconX } from "@tabler/icons-react";
import { INK_MUTED } from "@/lib/jetons";
import { useTutoriel } from "./ContexteTutoriel";
import ListeChapitres from "./ListeChapitres";

/**
 * « Tutoriel » dans le menu du profil : la liste des chapitres, et l'on choisit lequel
 * revoir. Même liste que le sommaire de l'accueil.
 */
export default function ChoixChapitre() {
  const tuto = useTutoriel();
  if (!tuto) return null;
  return (
    <Dialog
      open={tuto.choixOuvert}
      onClose={tuto.fermerChoix}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ pr: 6 }}>
        Tutoriel
        <Typography sx={{ fontSize: 13, color: INK_MUTED, mt: 0.25 }}>
          Choisissez un chapitre : la visite vous emmène sur l&apos;écran et
          vous le montre.
        </Typography>
        <IconButton
          aria-label="Fermer"
          onClick={tuto.fermerChoix}
          sx={{ position: "absolute", right: 12, top: 12 }}
        >
          <IconX size={18} />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack>
          <ListeChapitres />
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
