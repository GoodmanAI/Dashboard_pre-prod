"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Retour from "@/components/shared/Retour";
import {
  AVANCE_MAX,
  AVANCE_PAS,
  CLE_AVANCE,
  EXAMENS_CONSIGNE,
  heureAvancee,
} from "@/lib/talkTextes";
import { enregistrerTextesTalk, useTextesTalk } from "./textesTalk";

/**
 * « Heure d'arrivée du patient » (15/10/2026).
 *
 * Par type d'examen, le nombre de minutes à retirer de l'heure du créneau quand le
 * robot la donne au patient : à l'oral (créneaux proposés, récapitulatif,
 * confirmation), dans le SMS de confirmation et de dépôt, et sur la page de dépôt.
 * Le rendez-vous reste réservé à l'heure réelle. Domaine `talk.textes`, clé
 * `avanceParExamen`, plan `lyrae/plans/2026-10-avance-et-questions-par-centre.md`.
 */

type Etat = Record<string, string>;

function lire(valeur: Record<string, unknown>): Etat {
  const a = valeur[CLE_AVANCE];
  const e: Etat = {};
  if (a && typeof a === "object") {
    for (const [k, v] of Object.entries(a as Record<string, unknown>)) {
      if (typeof v === "number" && v > 0) e[k] = String(v);
    }
  }
  return e;
}

function erreurChamp(brut: string | undefined): string | null {
  if (!brut?.trim()) return null;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < 0 || n > AVANCE_MAX)
    return `Entre 0 et ${AVANCE_MAX} minutes.`;
  if (n % AVANCE_PAS !== 0) return `De ${AVANCE_PAS} en ${AVANCE_PAS} minutes.`;
  return null;
}

export default function HeureArriveeCard({
  userProductId,
  readOnly,
}: {
  userProductId: number;
  readOnly: boolean;
}) {
  const { valeur, erreurChargement } = useTextesTalk(userProductId);
  const [etat, setEtat] = useState<Etat>({});
  const [initial, setInitial] = useState<string>("{}");
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistreA, setEnregistreA] = useState<number | null>(null);

  useEffect(() => {
    if (!valeur) return;
    const e = lire(valeur);
    setEtat(e);
    setInitial(JSON.stringify(e));
  }, [valeur]);

  const propre = (e: Etat) => {
    const r: Record<string, number> = {};
    for (const [k, v] of Object.entries(e)) {
      const n = Number(v);
      if (v.trim() && Number.isFinite(n) && n > 0) r[k] = n;
    }
    return r;
  };
  const modifie =
    JSON.stringify(propre(etat)) !==
    JSON.stringify(propre(JSON.parse(initial)));
  const reglees = Object.keys(propre(etat)).length;
  const bloque = EXAMENS_CONSIGNE.some((x) => erreurChamp(etat[x.code]));

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const p = propre(etat);
      const v = await enregistrerTextesTalk(userProductId, {
        [CLE_AVANCE]: Object.keys(p).length ? p : null,
      });
      const e = lire(v);
      setEtat(e);
      setInitial(JSON.stringify(e));
      setEnregistreA(Date.now());
    } catch (err: any) {
      setErreur(err?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Typography variant="h6">Heure d&apos;arrivée du patient</Typography>
          <Chip
            size="small"
            label={
              reglees
                ? `${reglees} examen${reglees > 1 ? "s" : ""}`
                : "Heure du créneau"
            }
            sx={{
              bgcolor: reglees
                ? "rgba(var(--accent-rgb), 0.15)"
                : "rgba(0,0,0,0.06)",
              color: reglees ? "var(--accent-deep)" : "text.secondary",
              fontWeight: 700,
            }}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {erreurChargement ? (
          <Alert severity="error">{erreurChargement}</Alert>
        ) : !valeur ? (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={24} sx={{ color: "var(--accent)" }} />
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              Si le patient doit venir avant l&apos;heure de son examen,
              indiquez combien de minutes. Le robot donne alors l&apos;heure à
              laquelle se présenter : quand il propose les créneaux, quand il
              confirme le rendez-vous, et dans les SMS. Le rendez-vous reste
              enregistré à l&apos;heure du créneau dans votre logiciel.
            </Typography>
            <Alert
              severity="info"
              sx={{ "& .MuiAlert-message": { width: "100%" } }}
            >
              Mettez la même durée que la convocation réglée dans votre logiciel
              de gestion. Pour un rendez-vous déjà pris (rappel, annulation,
              modification), le robot lit l&apos;heure de convocation de votre
              logiciel et n&apos;ajoute rien.
            </Alert>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 2,
              }}
            >
              {EXAMENS_CONSIGNE.map((x) => {
                const e = erreurChamp(etat[x.code]);
                const n = Number(etat[x.code]);
                const exemple =
                  !e && n > 0
                    ? `Créneau de 13h00 : le patient entend ${heureAvancee("13h00", n)}.`
                    : "Vide : le robot donne l'heure du créneau.";
                return (
                  <TextField
                    key={x.code}
                    label={x.libelle}
                    size="small"
                    type="number"
                    value={etat[x.code] ?? ""}
                    onChange={(ev) =>
                      setEtat((p) => ({ ...p, [x.code]: ev.target.value }))
                    }
                    disabled={readOnly}
                    error={Boolean(e)}
                    helperText={e ?? exemple}
                    inputProps={{ min: 0, max: AVANCE_MAX, step: AVANCE_PAS }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          min avant
                        </InputAdornment>
                      ),
                    }}
                  />
                );
              })}
            </Box>

            {erreur && <Alert severity="error">{erreur}</Alert>}

            <Stack direction="row" justifyContent="flex-end">
              <Button
                variant="contained"
                disableElevation
                disabled={readOnly || enregistrement || !modifie || bloque}
                onClick={() => void enregistrer()}
                sx={{
                  bgcolor: "var(--accent)",
                  "&:hover": { bgcolor: "var(--accent-press)" },
                }}
              >
                {enregistrement
                  ? "Enregistrement…"
                  : "Enregistrer les heures d'arrivée"}
              </Button>
            </Stack>
          </Stack>
        )}

        <Retour
          ouvert={enregistreA !== null}
          message={
            <>
              Heures d&apos;arrivée enregistrées. Le robot les donne dès le
              prochain appel.
            </>
          }
          gravite={"success"}
          onFermer={() => setEnregistreA(null)}
        />
      </AccordionDetails>
    </Accordion>
  );
}
