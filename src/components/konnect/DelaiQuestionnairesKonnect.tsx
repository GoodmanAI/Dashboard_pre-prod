"use client";

import React, { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";

import Retour from "@/components/shared/Retour";
import {
  ALERT_AFTER_HOURS_MAX,
  ALERT_AFTER_HOURS_MIN,
  DEFAULT_ALERT_AFTER_HOURS_KONNECT,
} from "@/lib/prescriptionConfig";

/**
 * Delai avant qu'un questionnaire non rempli d'un patient du portail apparaisse
 * dans « Questionnaires des patients » (26/10/2026,
 * `PrescriptionConfig.alertAfterHoursKonnect`, 24 h par defaut). Le pendant du
 * delai des ordonnances de LyraeTalk. Plan :
 * `lyrae/plans/2026-10-konnect-questionnaires-centre.md`.
 *
 * `userProductId` est l'affiliation qui porte les liens de depot du centre
 * (LyraeTalk, sinon Konnect), la meme que la page des questionnaires.
 */
export default function DelaiQuestionnairesKonnect({
  userProductId,
  lectureSeule,
}: {
  userProductId: number | null;
  lectureSeule: string | null;
}) {
  const [heures, setHeures] = useState("");
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
        const r = await fetch(`/api/prescriptions/config?userProductId=${userProductId}`);
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (annule) return;
        const lu = String(
          Number.isFinite(d?.alertAfterHoursKonnect)
            ? d.alertAfterHoursKonnect
            : DEFAULT_ALERT_AFTER_HOURS_KONNECT
        );
        setHeures(lu);
        setInitial(lu);
      } catch {
        if (!annule) setErreur("Impossible de charger le délai. Rechargez la page.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const valeur = Number.parseInt(heures, 10);
  const valide =
    Number.isFinite(valeur) && valeur >= ALERT_AFTER_HOURS_MIN && valeur <= ALERT_AFTER_HOURS_MAX;

  async function enregistrer() {
    if (!valide) return;
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(`/api/prescriptions/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProductId, alertAfterHoursKonnect: valeur }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "L'enregistrement a été refusé.");
      const ecrit = String(data?.alertAfterHoursKonnect ?? valeur);
      setHeures(ecrit);
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
          type="number"
          label="Délai en heures"
          value={heures}
          disabled={Boolean(lectureSeule)}
          onChange={(e) => setHeures(e.target.value)}
          inputProps={{ min: ALERT_AFTER_HOURS_MIN, max: ALERT_AFTER_HOURS_MAX, step: 1 }}
          error={heures !== "" && !valide}
          helperText={
            heures !== "" && !valide
              ? `Entre ${ALERT_AFTER_HOURS_MIN} et ${ALERT_AFTER_HOURS_MAX} heures.`
              : "Compté à partir de l'envoi du lien au patient."
          }
          sx={{ width: { xs: "100%", sm: 220 } }}
        />
        <Button
          variant="contained"
          onClick={enregistrer}
          disabled={!valide || heures.trim() === initial.trim() || enregistrement || Boolean(lectureSeule)}
          sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "var(--accent-press)" } }}
        >
          {enregistrement ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        Passé ce délai, un patient qui n&apos;a pas rempli ses questionnaires apparaît dans
        « Questionnaires des patients », avec un badge dans le menu. Vous pouvez alors le
        rappeler avant son rendez-vous.
      </Typography>
      {erreur && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {erreur}
        </Alert>
      )}
      <Retour
        ouvert={succes}
        message={<>Délai enregistré.</>}
        gravite="success"
        onFermer={() => setSucces(false)}
      />
    </Box>
  );
}
