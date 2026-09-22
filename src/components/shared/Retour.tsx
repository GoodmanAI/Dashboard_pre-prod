"use client";

import React, { useCallback, useState } from "react";
import { Alert, Snackbar } from "@mui/material";

/**
 * Le retour après une action : « Enregistré », « Le ticket n'a pas été mis à jour ».
 *
 * Un seul composant pour tout le Dashboard. Avant (audit du 18/09/2026), six formes
 * cohabitaient : bas-centre, bas-gauche, bas-droite, haut-droite, message nu ou Alert,
 * de 1,5 à 5 secondes. Le bas-centre tombait sous la barre d'enregistrement.
 *
 * Ici : bas-droite, au-dessus de la barre d'enregistrement, 4 secondes pour un succès
 * (on a vu, on passe à autre chose), 8 secondes pour une erreur (il faut la lire).
 *
 * Usage :
 *   const { retour, montrer } = useRetour();
 *   montrer("Sites enregistrés.");                       // succès
 *   montrer("Le site n'a pas été enregistré.", "error"); // erreur
 *   ... {retour}
 */

export type Gravite = "success" | "error" | "info" | "warning";

type Etat = { ouvert: boolean; message: string; gravite: Gravite };

export function useRetour() {
  const [etat, setEtat] = useState<Etat>({ ouvert: false, message: "", gravite: "success" });

  const montrer = useCallback((message: string, gravite: Gravite = "success") => {
    setEtat({ ouvert: true, message, gravite });
  }, []);
  const fermer = useCallback(() => setEtat((e) => ({ ...e, ouvert: false })), []);

  const retour = (
    <Retour ouvert={etat.ouvert} message={etat.message} gravite={etat.gravite} onFermer={fermer} />
  );
  return { retour, montrer, fermer };
}

export default function Retour({
  ouvert,
  message,
  gravite = "success",
  onFermer,
}: {
  ouvert: boolean;
  /** Texte, ou fragment JSX. `null` et `undefined` pendant la fermeture. */
  message: React.ReactNode;
  gravite?: Gravite;
  onFermer: () => void;
}) {
  return (
    <Snackbar
      open={ouvert}
      autoHideDuration={gravite === "error" ? 8000 : 4000}
      onClose={(_, raison) => {
        // Un clic ailleurs sur la page ne doit pas escamoter une erreur avant lecture.
        if (raison === "clickaway" && gravite === "error") return;
        onFermer();
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      // Au-dessus de la barre d'enregistrement (bottom: 16, ~56 px de haut).
      sx={{ bottom: { xs: 88 } }}
    >
      <Alert
        severity={gravite}
        variant="filled"
        onClose={onFermer}
        sx={{ fontWeight: 500, boxShadow: "0 10px 30px rgba(15, 42, 63, 0.18)" }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
