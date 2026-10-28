"use client";

import React from "react";
import { TextField } from "@mui/material";
import DialogConfirmation from "@/components/shared/DialogConfirmation";

const LONGUEUR_MAX = 500;

/**
 * Demande au client, au moment où il signale un appel, ce qui s'est mal passé.
 * Facultatif : « Signaler » sans rien écrire signale quand même.
 *
 * Le commentaire est lu chaque matin par le rapport d'incidents (décision A6 du
 * 27/10/2026, `plans/2026-10-amelioration-continue-lyraetalk.md`). Utilisé par la
 * liste des appels et par l'écran Incidents.
 *
 *   const { demanderCommentaire, dialogue } = useSignalement();
 *   const commentaire = await demanderCommentaire();  // null = annulé
 *   ... {dialogue}
 */
export function useSignalement() {
  const [ouvert, setOuvert] = React.useState(false);
  const [texte, setTexte] = React.useState("");
  const reponse = React.useRef<((commentaire: string | null) => void) | null>(null);

  const demanderCommentaire = React.useCallback(() => {
    return new Promise<string | null>((resolve) => {
      reponse.current = resolve;
      setTexte("");
      setOuvert(true);
    });
  }, []);

  const repondre = (commentaire: string | null) => {
    setOuvert(false);
    reponse.current?.(commentaire);
    reponse.current = null;
  };

  const dialogue = (
    <DialogConfirmation
      ouvert={ouvert}
      titre="Signaler cet appel"
      libelleAction="Signaler"
      focusSurAction={false}
      onConfirmer={() => repondre(texte.trim())}
      onAnnuler={() => repondre(null)}
      texte={
        <TextField
          label="Qu'est-ce qui s'est mal passé ? (facultatif)"
          placeholder="Par exemple : le patient a dû rappeler, le rendez-vous pris n'est pas le bon examen."
          value={texte}
          onChange={(e) => setTexte(e.target.value.slice(0, LONGUEUR_MAX))}
          multiline
          minRows={3}
          fullWidth
          autoFocus
          helperText={`${texte.length} / ${LONGUEUR_MAX}`}
          FormHelperTextProps={{ sx: { textAlign: "right", mx: 0 } }}
          sx={{ mt: 1 }}
        />
      }
    />
  );

  return { demanderCommentaire, dialogue };
}
