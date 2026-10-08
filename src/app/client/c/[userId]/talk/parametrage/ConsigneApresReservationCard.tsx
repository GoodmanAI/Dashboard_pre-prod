"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Retour from "@/components/shared/Retour";
import ChampAvecVariables from "@/components/shared/ChampAvecVariables";
import {
  CLE_CONSIGNE,
  CLE_CONSIGNE_PAR_EXAMEN,
  CONSIGNE_STANDARD,
  DEBUT_ANNONCE_EXEMPLE,
  EXAMENS_CONSIGNE,
  MAX_CONSIGNE,
  VARIABLES_CONSIGNE,
  erreurGabarit,
  rendreConsigne,
} from "@/lib/talkTextes";
import { enregistrerTextesTalk, useTextesTalk } from "./textesTalk";

/**
 * « Ce que le robot dit après la réservation » (08/10/2026).
 *
 * Le début de l'annonce est fixe (date, heure, nom du patient) ; le client règle
 * la suite, dite après « Le jour de l'examen » : arriver en avance, documents à
 * apporter. Une consigne générale, et au besoin une par type d'examen, qui la
 * remplace pour cet examen. Domaine `talk.textes`, plan
 * `lyrae/plans/2026-10-confirmation-personnalisable.md`.
 *
 * Le texte ne s'applique qu'aux appels en français : un patient qui parle une
 * autre langue entend la consigne standard traduite.
 */

type Etat = { generale: string; parExamen: Record<string, string> };

const VIDE: Etat = { generale: "", parExamen: {} };

function lire(valeur: Record<string, unknown>): Etat {
  const g = valeur[CLE_CONSIGNE];
  const p = valeur[CLE_CONSIGNE_PAR_EXAMEN];
  const parExamen: Record<string, string> = {};
  if (p && typeof p === "object") {
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof v === "string") parExamen[k] = v;
    }
  }
  return { generale: typeof g === "string" ? g : "", parExamen };
}

function erreurLocale(texte: string): string | null {
  if (texte.length > MAX_CONSIGNE)
    return `${texte.length} caractères, ${MAX_CONSIGNE} au plus.`;
  return erreurGabarit(texte, VARIABLES_CONSIGNE);
}

export default function ConsigneApresReservationCard({
  userProductId,
  readOnly,
  centre,
}: {
  userProductId: number;
  readOnly: boolean;
  centre: string;
}) {
  const { valeur, erreurChargement } = useTextesTalk(userProductId);
  const [etat, setEtat] = useState<Etat>(VIDE);
  const [initial, setInitial] = useState<string>(JSON.stringify(VIDE));
  const [apercu, setApercu] = useState<string>("MR");
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistreA, setEnregistreA] = useState<number | null>(null);

  useEffect(() => {
    if (!valeur) return;
    const e = lire(valeur);
    setEtat(e);
    setInitial(JSON.stringify(e));
  }, [valeur]);

  const modifie = JSON.stringify(etat) !== initial;
  const personnalisee =
    Boolean(etat.generale.trim()) ||
    Object.values(etat.parExamen).some((v) => v.trim());

  const erreurs = useMemo(() => {
    const e: Record<string, string | null> = {
      generale: erreurLocale(etat.generale),
    };
    for (const x of EXAMENS_CONSIGNE)
      e[x.code] = erreurLocale(etat.parExamen[x.code] ?? "");
    return e;
  }, [etat]);
  const bloque = Object.values(erreurs).some(Boolean);

  const examenApercu =
    EXAMENS_CONSIGNE.find((x) => x.code === apercu) ?? EXAMENS_CONSIGNE[0];
  const consigneApercu =
    etat.parExamen[apercu]?.trim() || etat.generale.trim() || CONSIGNE_STANDARD;
  const phraseApercu =
    DEBUT_ANNONCE_EXEMPLE +
    rendreConsigne(consigneApercu, {
      examen: examenApercu.parle,
      centre: centre || "notre centre",
    });

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const parExamen: Record<string, string> = {};
      for (const [k, v] of Object.entries(etat.parExamen))
        if (v.trim()) parExamen[k] = v.trim();
      const v = await enregistrerTextesTalk(userProductId, {
        [CLE_CONSIGNE]: etat.generale.trim(),
        [CLE_CONSIGNE_PAR_EXAMEN]: Object.keys(parExamen).length
          ? parExamen
          : null,
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
          <Typography variant="h6">
            Ce que le robot dit après la réservation
          </Typography>
          <Chip
            size="small"
            label={personnalisee ? "Personnalisé" : "Texte standard"}
            sx={{
              bgcolor: personnalisee
                ? "rgba(var(--accent-rgb), 0.15)"
                : "rgba(0,0,0,0.06)",
              color: personnalisee ? "var(--accent-deep)" : "text.secondary",
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
              Une fois le rendez-vous pris, le robot confirme la date,
              l&apos;heure et le nom du patient, puis dit « Le jour de
              l&apos;examen » suivi de votre consigne. Écrivez la suite : venir
              en avance, documents à apporter. Commencez par un verbe, sans
              majuscule. Ce texte est dit aux patients qui parlent français.
            </Typography>

            <ChampAvecVariables
              label="Consigne pour tous les examens"
              valeur={etat.generale}
              onChange={(v) => setEtat((p) => ({ ...p, generale: v }))}
              variables={VARIABLES_CONSIGNE}
              placeholder={CONSIGNE_STANDARD}
              aide={
                etat.generale.trim()
                  ? `${etat.generale.length} / ${MAX_CONSIGNE} caractères`
                  : "Vide : le robot dit le texte standard, affiché en gris."
              }
              erreur={erreurs.generale}
              desactive={readOnly}
              maxLength={MAX_CONSIGNE + 50}
            />

            <Box>
              <Typography variant="subtitle1">
                Consigne propre à un examen
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1.5 }}
              >
                Facultatif. Remplie, elle remplace la consigne générale pour cet
                examen. Par exemple : venir trente minutes avant pour une IRM.
              </Typography>
              <Stack spacing={2}>
                {EXAMENS_CONSIGNE.map((x) => (
                  <ChampAvecVariables
                    key={x.code}
                    label={x.libelle}
                    valeur={etat.parExamen[x.code] ?? ""}
                    onChange={(v) =>
                      setEtat((p) => ({
                        ...p,
                        parExamen: { ...p.parExamen, [x.code]: v },
                      }))
                    }
                    variables={VARIABLES_CONSIGNE}
                    placeholder="Vide : la consigne générale s'applique."
                    erreur={erreurs[x.code]}
                    desactive={readOnly}
                    minRows={1}
                    maxLength={MAX_CONSIGNE + 50}
                  />
                ))}
              </Stack>
            </Box>

            <Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ xs: "flex-start", sm: "center" }}
                justifyContent="space-between"
                sx={{ mb: 1 }}
              >
                <Typography variant="subtitle1">
                  Ce que le patient entend
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={apercu}
                  onChange={(_, v) => v && setApercu(v)}
                  sx={{ flexWrap: "wrap", maxWidth: "100%" }}
                >
                  {EXAMENS_CONSIGNE.map((x) => (
                    <ToggleButton
                      key={x.code}
                      value={x.code}
                      sx={{ textTransform: "none", px: 1.25 }}
                    >
                      {x.libelle}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Stack>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: "rgba(var(--accent-rgb), 0.07)",
                  border: "1px solid rgba(var(--accent-rgb), 0.25)",
                }}
              >
                <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                  {phraseApercu}
                </Typography>
              </Box>
            </Box>

            {erreur && <Alert severity="error">{erreur}</Alert>}

            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <Button
                variant="text"
                disabled={readOnly || enregistrement || !personnalisee}
                onClick={() => setEtat(VIDE)}
                sx={{ color: "text.secondary" }}
              >
                Revenir au texte standard
              </Button>
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
                {enregistrement ? "Enregistrement…" : "Enregistrer la consigne"}
              </Button>
            </Stack>
          </Stack>
        )}

        <Retour
          ouvert={enregistreA !== null}
          message={
            <>Consigne enregistrée. Le robot la dit dès le prochain appel.</>
          }
          gravite={"success"}
          onFermer={() => setEnregistreA(null)}
        />
      </AccordionDetails>
    </Accordion>
  );
}
