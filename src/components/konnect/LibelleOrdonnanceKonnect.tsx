"use client";

import React, { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";

import Retour from "@/components/shared/Retour";
import {
  DOMAINE_LIBELLE_ORDONNANCE,
  LIBELLE_XPLORE_MAX,
  lireLibelleOrdonnance,
} from "@/lib/konnectLibelleOrdonnance";

/**
 * Nom de l'ordonnance dans Xplore, deposee par le portail (26/10/2026). Le meme
 * champ que celui de chaque questionnaire, pour la piece que Konnect recueille
 * lui-meme. Plan : `lyrae/plans/2026-10-konnect-questionnaires-centre.md`.
 */
export default function LibelleOrdonnanceKonnect({
  userProductId,
  lectureSeule,
}: {
  userProductId: number | null;
  lectureSeule: string | null;
}) {
  const [libelle, setLibelle] = useState("");
  const [initial, setInitial] = useState("");
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE_LIBELLE_ORDONNANCE}`
        );
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (annule) return;
        const lu = lireLibelleOrdonnance(d?.valeur).libelle ?? "";
        setLibelle(lu);
        setInitial(lu);
      } catch {
        if (!annule) setErreur("Impossible de charger le nom de l'ordonnance. Rechargez la page.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE_LIBELLE_ORDONNANCE}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: { libelle: libelle.trim() || null } }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "L'enregistrement a été refusé.");
      const ecrit = lireLibelleOrdonnance(data?.valeur).libelle ?? "";
      setLibelle(ecrit);
      setInitial(ecrit);
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} sx={{ color: "var(--accent)" }} />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-start" }}>
        <TextField
          size="small"
          label="Nom de l'ordonnance dans Xplore"
          placeholder="Ordonnance"
          value={libelle}
          disabled={Boolean(lectureSeule)}
          onChange={(e) => setLibelle(e.target.value)}
          inputProps={{ maxLength: LIBELLE_XPLORE_MAX }}
          helperText="Recopiez-le tel qu'il apparaît dans la liste des pièces jointes de Xplore. Vide : « Ordonnance 1/2 », « Ordonnance 2/2 »…"
          sx={{ flex: 1 }}
        />
        <Button
          variant="contained"
          onClick={enregistrer}
          disabled={libelle.trim() === initial.trim() || enregistrement || Boolean(lectureSeule)}
          sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "var(--accent-press)" } }}
        >
          {enregistrement ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        Pour un rendez-vous à plusieurs examens, l&apos;ordonnance est rattachée à chacun
        d&apos;eux.
      </Typography>
      {erreur && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {erreur}
        </Alert>
      )}
      <Retour
        ouvert={succes}
        message={<>Nom de l&apos;ordonnance enregistré.</>}
        gravite="success"
        onFermer={() => setSucces(false)}
      />
    </Box>
  );
}
