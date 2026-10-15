"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import {
  DOMAINE_PLAGES_PRIVEES,
  MAX_CODE,
  MAX_CONSIGNE,
  PRIORITES,
  VALEURS_DEPASSEMENT,
  VIDE,
  erreurLigneDepassement,
  erreurLigneMedecin,
  lirePlagesPrivees,
  normaliserCode,
  validerPlagesPrivees,
  type PlagesPrivees,
  type Priorite,
  type ValeurDepassement,
} from "@/lib/konnectPlagesPrivees";

/**
 * Plages privées du portail (15/10/2026). Plan :
 * `lyrae/plans/2026-10-konnect-plages-privees.md`.
 *
 * Le client dit quels créneaux sont des plages privées, par code médecin ou par
 * valeur de dépassement, et la consigne que le patient lit en les choisissant. La
 * validation est celle de la route (`src/lib/konnectPlagesPrivees.ts`), ligne par
 * ligne, pour que le bouton ne s'allume jamais sur ce que le serveur refuserait.
 *
 * Il porte son propre bouton, comme le reste de l'écran « Paramètres du portail ».
 */

// Une ligne : le code (ou la valeur), la consigne, la corbeille. La consigne passe
// sous le code quand la place manque, selon la largeur de la carte et non de l'écran :
// l'écran Paramétrage est large, mais la carte peut ne pas l'être.
const LIGNE = {
  display: "flex",
  flexWrap: "wrap",
  gap: 1,
  alignItems: "flex-start",
  "& > button": { ml: "auto" },
} as const;

export default function PlagesPriveesKonnect({
  userProductId,
  lectureSeule,
}: {
  userProductId: number | null;
  lectureSeule: string | null;
}) {
  const [plages, setPlages] = useState<PlagesPrivees>(VIDE);
  const [initiales, setInitiales] = useState<string>(JSON.stringify(VIDE));
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
          `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE_PLAGES_PRIVEES}`
        );
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (annule) return;
        const lues = lirePlagesPrivees(d?.valeur);
        setPlages(lues);
        setInitiales(JSON.stringify(lues));
      } catch {
        if (!annule) setErreur("Impossible de charger les plages privées. Rechargez la page.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const modifie = useMemo(() => JSON.stringify(plages) !== initiales, [plages, initiales]);
  const verdict = useMemo(() => validerPlagesPrivees(plages), [plages]);
  const fige = Boolean(lectureSeule);

  // Erreurs ligne par ligne, dans l'ordre de l'écran : un doublon n'est signalé que
  // sur sa seconde occurrence, comme la route le refuse.
  const erreursMedecins = useMemo(() => {
    const vus = new Set<string>();
    return plages.medecins.map((l) => {
      const code = normaliserCode(l.code);
      const e = erreurLigneMedecin(code, l.consigne.trim(), vus);
      vus.add(code);
      return e;
    });
  }, [plages.medecins]);
  const erreursDepassements = useMemo(() => {
    const vues = new Set<string>();
    return plages.depassements.map((l) => {
      const e = erreurLigneDepassement(l.valeur, l.consigne.trim(), vues);
      vues.add(l.valeur);
      return e;
    });
  }, [plages.depassements]);

  const majMedecin = (i: number, champ: Partial<PlagesPrivees["medecins"][number]>) =>
    setPlages((p) => ({
      ...p,
      medecins: p.medecins.map((l, j) => (j === i ? { ...l, ...champ } : l)),
    }));
  const majDepassement = (i: number, champ: Partial<PlagesPrivees["depassements"][number]>) =>
    setPlages((p) => ({
      ...p,
      depassements: p.depassements.map((l, j) => (j === i ? { ...l, ...champ } : l)),
    }));

  // Une nouvelle ligne de dépassement prend la première valeur encore libre.
  const valeurLibre = VALEURS_DEPASSEMENT.find(
    (v) => !plages.depassements.some((l) => l.valeur === v.valeur)
  )?.valeur;

  async function enregistrer() {
    if ("erreur" in verdict) return;
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE_PLAGES_PRIVEES}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: verdict.valeur }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "L'enregistrement a été refusé.");
      const ecrites = lirePlagesPrivees(data?.valeur ?? verdict.valeur);
      setPlages(ecrites);
      setInitiales(JSON.stringify(ecrites));
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
        <CircularProgress size={24} sx={{ color: "var(--accent)" }} />
      </Box>
    );
  }

  const lesDeux = plages.medecins.length > 0 && plages.depassements.length > 0;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Le portail signale au patient les créneaux que vous désignez ici comme des plages
        privées. Il les distingue dans le calendrier et affiche votre consigne quand le patient
        en choisit une. Sans aucune ligne, aucun créneau n&apos;est signalé.
      </Typography>

      {/* ---------------- Par médecin ---------------- */}
      <Typography variant="subtitle1">Par médecin</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Tous les créneaux de ce médecin, dans tous vos centres. Le code est celui de votre
        logiciel de gestion.
      </Typography>
      <Stack spacing={1.5}>
        {plages.medecins.map((l, i) => (
          <Box key={i} sx={LIGNE}>
            <TextField
              size="small"
              label="Code médecin"
              value={l.code}
              disabled={fige}
              sx={{ flex: "0 0 170px" }}
              inputProps={{ maxLength: MAX_CODE, style: { textTransform: "uppercase" } }}
              error={Boolean(erreursMedecins[i]) && !l.code.trim()}
              onChange={(e) => majMedecin(i, { code: e.target.value })}
            />
            <TextField
              size="small"
              label="Consigne au patient"
              sx={{ flex: "1 1 260px", minWidth: 0 }}
              multiline
              minRows={2}
              value={l.consigne}
              disabled={fige}
              placeholder="Ce créneau est une consultation privée. Un dépassement d'honoraires vous sera demandé au centre."
              error={Boolean(erreursMedecins[i]) && Boolean(l.code.trim())}
              helperText={erreursMedecins[i] ?? `${l.consigne.length} / ${MAX_CONSIGNE}`}
              inputProps={{ maxLength: MAX_CONSIGNE }}
              onChange={(e) => majMedecin(i, { consigne: e.target.value })}
            />
            <IconButton
              aria-label={`Retirer le médecin ${l.code || "sans code"}`}
              disabled={fige}
              onClick={() =>
                setPlages((p) => ({ ...p, medecins: p.medecins.filter((_, j) => j !== i) }))
              }
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Stack>
      <Button
        size="small"
        startIcon={<AddIcon />}
        disabled={fige}
        sx={{ mt: 1 }}
        onClick={() =>
          setPlages((p) => ({ ...p, medecins: [...p.medecins, { code: "", consigne: "" }] }))
        }
      >
        Ajouter un médecin
      </Button>

      {/* ---------------- Par dépassement d'honoraires ---------------- */}
      <Typography variant="subtitle1" sx={{ mt: 3 }}>
        Par dépassement d&apos;honoraires
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        La valeur que votre logiciel de gestion porte sur le créneau. « ? » ne concerne que les
        créneaux marqués « ? », pas ceux marqués C ou D.
      </Typography>
      <Stack spacing={1.5}>
        {plages.depassements.map((l, i) => (
          <Box key={i} sx={LIGNE}>
            <TextField
              select
              size="small"
              label="Valeur"
              value={l.valeur}
              disabled={fige}
              sx={{ flex: "0 0 170px" }}
              onChange={(e) => majDepassement(i, { valeur: e.target.value as ValeurDepassement })}
            >
              {VALEURS_DEPASSEMENT.map((v) => (
                <MenuItem key={v.valeur} value={v.valeur}>
                  {v.libelle}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Consigne au patient"
              sx={{ flex: "1 1 260px", minWidth: 0 }}
              multiline
              minRows={2}
              value={l.consigne}
              disabled={fige}
              placeholder="Ce créneau comporte un dépassement d'honoraires. L'accueil du centre vous en indiquera le montant."
              error={Boolean(erreursDepassements[i])}
              helperText={erreursDepassements[i] ?? `${l.consigne.length} / ${MAX_CONSIGNE}`}
              inputProps={{ maxLength: MAX_CONSIGNE }}
              onChange={(e) => majDepassement(i, { consigne: e.target.value })}
            />
            <IconButton
              aria-label={`Retirer la valeur ${l.valeur}`}
              disabled={fige}
              onClick={() =>
                setPlages((p) => ({
                  ...p,
                  depassements: p.depassements.filter((_, j) => j !== i),
                }))
              }
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Stack>
      <Button
        size="small"
        startIcon={<AddIcon />}
        disabled={fige || !valeurLibre}
        sx={{ mt: 1 }}
        onClick={() =>
          valeurLibre &&
          setPlages((p) => ({
            ...p,
            depassements: [...p.depassements, { valeur: valeurLibre, consigne: "" }],
          }))
        }
      >
        Ajouter une valeur
      </Button>

      {/* ---------------- Les deux règles ---------------- */}
      {lesDeux && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1">Si un créneau correspond aux deux règles</Typography>
          <RadioGroup
            value={plages.priorite}
            onChange={(e) => setPlages((p) => ({ ...p, priorite: e.target.value as Priorite }))}
          >
            {PRIORITES.map((p) => (
              <FormControlLabel
                key={p.valeur}
                value={p.valeur}
                disabled={fige}
                control={<Radio size="small" />}
                label={
                  <span>
                    {p.libelle}
                    <Typography component="span" variant="body2" color="text.secondary">
                      {" "}
                      ({p.aide.charAt(0).toLowerCase() + p.aide.slice(1, -1)})
                    </Typography>
                  </span>
                }
              />
            ))}
          </RadioGroup>
        </Box>
      )}

      {erreur && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {erreur}
        </Alert>
      )}
      {succes && !modifie && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSucces(false)}>
          Plages privées enregistrées. Le portail les reprend à sa prochaine synchronisation.
        </Alert>
      )}

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
        <Button
          variant="contained"
          disableElevation
          disabled={!modifie || enregistrement || fige || "erreur" in verdict}
          onClick={() => void enregistrer()}
          sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "var(--accent-press)" } }}
        >
          {enregistrement ? "Enregistrement…" : "Enregistrer les plages privées"}
        </Button>
      </Box>
    </Box>
  );
}
