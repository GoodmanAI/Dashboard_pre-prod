"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

/**
 * Planning complet, par type d'examen (18/09/2026). Plan :
 * `lyrae/plans/2026-09-konnect-demandes-bloquees.md`, cas 3.
 *
 * REPRIS DE LYRAETALK (« Consigne quand le planning est complet », `fullPlanningNotes`) :
 * mêmes cinq types d'examen, même principe d'une consigne par type. Le robot termine
 * l'appel ou transfère ; le portail, lui, affiche un message ou transmet une demande de
 * rappel.
 *
 * Domaine `konnect.planning-complet` :
 * `{ types: { radiographie|irm|echographie|scanner|mammo: { mode, message } } }`, avec
 * `mode` parmi `rappel` (défaut, valeur absente comprise) et `message`.
 *
 * Il porte son propre bouton, comme le reste de l'écran « Paramètres du portail ».
 */

const DOMAINE = "konnect.planning-complet";

const TYPES: [string, string][] = [
  ["radiographie", "Radiographie"],
  ["irm", "IRM"],
  ["echographie", "Échographie"],
  ["scanner", "Scanner"],
  ["mammo", "Mammographie"],
];

const MAX_MESSAGE = 400;

type Consigne = { mode: "rappel" | "message"; message: string };

const PAR_DEFAUT: Consigne = { mode: "rappel", message: "" };

export default function PlanningCompletKonnect({
  userProductId,
  lectureSeule,
}: {
  userProductId: number | null;
  lectureSeule: string | null;
}) {
  const [consignes, setConsignes] = useState<Record<string, Consigne>>({});
  const [initiales, setInitiales] = useState<string>("{}");
  const [autresCles, setAutresCles] = useState<Record<string, unknown>>({});
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch(`/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`);
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (annule) return;
        const valeur = d?.valeur && typeof d.valeur === "object" ? d.valeur : {};
        const { types, ...reste } = valeur;
        setAutresCles(reste);
        const lues: Record<string, Consigne> = {};
        TYPES.forEach(([cle]) => {
          const brut = types?.[cle];
          lues[cle] = {
            mode: brut?.mode === "message" ? "message" : "rappel",
            message: typeof brut?.message === "string" ? brut.message : "",
          };
        });
        setConsignes(lues);
        setInitiales(JSON.stringify(lues));
      } catch {
        if (!annule) setErreur("Impossible de charger les consignes de planning complet.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const modifie = useMemo(() => JSON.stringify(consignes) !== initiales, [consignes, initiales]);

  const messageManquant = TYPES.find(
    ([cle]) => consignes[cle]?.mode === "message" && !consignes[cle]?.message.trim()
  );

  const maj = (cle: string, champ: Partial<Consigne>) =>
    setConsignes((prec) => ({ ...prec, [cle]: { ...(prec[cle] ?? PAR_DEFAUT), ...champ } }));

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(`/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valeur: { ...autresCles, types: consignes } }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "L'enregistrement a été refusé.");
      setInitiales(JSON.stringify(consignes));
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

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Quand aucun créneau n&apos;est disponible en ligne et que la liste d&apos;attente
        n&apos;est pas proposée, le portail suit la consigne du type d&apos;examen. Soit il
        transmet une demande de rappel à vos secrétaires, soit il affiche votre message au
        patient.
      </Typography>

      <Stack spacing={2.5}>
        {TYPES.map(([cle, libelle]) => {
          const c = consignes[cle] ?? PAR_DEFAUT;
          return (
            <Box key={cle}>
              <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
                {libelle}
              </Typography>
              <RadioGroup
                row
                value={c.mode}
                onChange={(e) => maj(cle, { mode: e.target.value as Consigne["mode"] })}
              >
                <FormControlLabel
                  value="rappel"
                  control={<Radio size="small" />}
                  label="Demande de rappel"
                  disabled={Boolean(lectureSeule)}
                />
                <FormControlLabel
                  value="message"
                  control={<Radio size="small" />}
                  label="Message au patient"
                  disabled={Boolean(lectureSeule)}
                />
              </RadioGroup>
              {c.mode === "message" && (
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  placeholder="Le planning est complet. Réessayez d'ici une semaine."
                  value={c.message}
                  disabled={Boolean(lectureSeule)}
                  error={!c.message.trim()}
                  helperText={!c.message.trim() ? "Écrivez le message que le patient lira." : " "}
                  inputProps={{ maxLength: MAX_MESSAGE }}
                  onChange={(e) => maj(cle, { message: e.target.value })}
                />
              )}
            </Box>
          );
        })}
      </Stack>

      {erreur && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {erreur}
        </Alert>
      )}
      {succes && !modifie && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSucces(false)}>
          Consignes enregistrées. Le portail les reprend à sa prochaine synchronisation.
        </Alert>
      )}

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
        <Button
          variant="contained"
          disableElevation
          disabled={!modifie || enregistrement || Boolean(lectureSeule) || Boolean(messageManquant)}
          onClick={() => void enregistrer()}
          sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "var(--accent-press)" } }}
        >
          {enregistrement ? "Enregistrement…" : "Enregistrer les consignes"}
        </Button>
      </Box>
    </Box>
  );
}
