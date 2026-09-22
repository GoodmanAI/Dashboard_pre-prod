"use client";

import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

/**
 * Demande de confirmation avant un geste qu'on ne rattrape pas : supprimer, déconnecter,
 * abandonner des modifications.
 *
 * Remplace le `confirm()` natif du navigateur, qui s'affiche hors du site, se valide
 * d'un Entrée réflexe, et ne peut ni nommer l'action sur son bouton ni être stylé.
 * Le bouton d'action porte le verbe (« Supprimer le compte »), jamais « OK ».
 */
export default function DialogConfirmation({
  ouvert,
  titre,
  texte,
  libelleAction,
  destructif = false,
  enCours = false,
  onConfirmer,
  onAnnuler,
}: {
  ouvert: boolean;
  titre: string;
  texte: React.ReactNode;
  /** Le verbe du bouton : « Supprimer le compte », « Abandonner les modifications ». */
  libelleAction: string;
  /** En rouge quand le geste ne se rattrape pas. */
  destructif?: boolean;
  enCours?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  return (
    <Dialog open={ouvert} onClose={enCours ? undefined : onAnnuler} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{titre}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{texte}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onAnnuler} disabled={enCours} color="inherit">
          Annuler
        </Button>
        <Button
          variant="contained"
          color={destructif ? "error" : "primary"}
          onClick={onConfirmer}
          disabled={enCours}
          autoFocus={!destructif}
        >
          {libelleAction}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type Demande = {
  titre: string;
  texte: React.ReactNode;
  libelleAction: string;
  destructif?: boolean;
};

/**
 * La même chose sous forme de promesse, pour remplacer un `confirm()` sans réécrire
 * l'écran : `if (!(await confirmer({ ... }))) return;`.
 *
 *   const { confirmer, dialogue } = useConfirmation();
 *   ... {dialogue}
 */
export function useConfirmation() {
  const [demande, setDemande] = React.useState<Demande | null>(null);
  const reponse = React.useRef<((ok: boolean) => void) | null>(null);

  const confirmer = React.useCallback((d: Demande) => {
    return new Promise<boolean>((resolve) => {
      reponse.current = resolve;
      setDemande(d);
    });
  }, []);
  const repondre = (ok: boolean) => {
    setDemande(null);
    reponse.current?.(ok);
    reponse.current = null;
  };

  const dialogue = (
    <DialogConfirmation
      ouvert={demande !== null}
      titre={demande?.titre ?? ""}
      texte={demande?.texte ?? ""}
      libelleAction={demande?.libelleAction ?? "Confirmer"}
      destructif={demande?.destructif}
      onConfirmer={() => repondre(true)}
      onAnnuler={() => repondre(false)}
    />
  );
  return { confirmer, dialogue };
}
