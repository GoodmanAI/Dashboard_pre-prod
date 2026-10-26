"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";

import Retour from "@/components/shared/Retour";
import {
  CATALOGUE,
  DOMAINE_QUESTIONS_CLINIQUES,
  EFFETS,
  TOUTES_POSEES,
  lireQuestionsCliniques,
  retireUnGardeFou,
  type QuestionsCliniques,
} from "@/lib/konnectQuestionsCliniques";

/**
 * Questions cliniques que le portail pose au patient (26/10/2026). Plan :
 * `lyrae/plans/2026-10-konnect-questionnaires-centre.md`.
 *
 * Une case par question, rangees par examen. Le client retire ce qu'il ne veut
 * pas poser, y compris une question qui bloque le rendez-vous ou le renvoie a sa
 * validation : l'ecran le dit sous la case, sans l'empecher.
 *
 * Il porte son propre bouton, comme les plages privees.
 */
export default function QuestionsCliniquesKonnect({
  userProductId,
  lectureSeule,
}: {
  userProductId: number | null;
  lectureSeule: string | null;
}) {
  const [reglage, setReglage] = useState<QuestionsCliniques>(TOUTES_POSEES);
  const [initial, setInitial] = useState<string>(JSON.stringify(TOUTES_POSEES));
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
          `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE_QUESTIONS_CLINIQUES}`
        );
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (annule) return;
        const lu = lireQuestionsCliniques(d?.valeur);
        setReglage(lu);
        setInitial(JSON.stringify(lu));
      } catch {
        if (!annule) setErreur("Impossible de charger les questions. Rechargez la page.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const modifie = useMemo(() => JSON.stringify(reglage) !== initial, [reglage, initial]);
  const fige = Boolean(lectureSeule);
  const retirees = new Set(reglage.desactivees);

  const basculer = (id: string, posee: boolean) =>
    setReglage((r) => ({
      desactivees: (posee
        ? r.desactivees.filter((x) => x !== id)
        : Array.from(new Set([...r.desactivees, id]))
      ).sort(),
    }));

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE_QUESTIONS_CLINIQUES}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: reglage }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "L'enregistrement a été refusé.");
      const ecrit = lireQuestionsCliniques(data?.valeur ?? reglage);
      setReglage(ecrit);
      setInitial(JSON.stringify(ecrit));
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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Cochez les questions que le portail pose au patient avant le choix du créneau.
        Une question décochée n&apos;est plus posée, pour aucun patient.
      </Typography>

      <Stack spacing={3}>
        {CATALOGUE.map((g) => (
          <Box key={g.titre}>
            <Typography variant="subtitle1">{g.titre}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {g.aide}
            </Typography>
            <Stack spacing={0.5}>
              {g.questions.map((q) => {
                const posee = !retirees.has(q.id);
                const parentRetire = q.apres ? retirees.has(q.apres) : false;
                return (
                  <Box key={q.id} sx={{ pl: q.apres ? 4 : 0 }}>
                    <FormControlLabel
                      sx={{ alignItems: "flex-start", m: 0 }}
                      control={
                        <Checkbox
                          size="small"
                          checked={posee}
                          disabled={fige || parentRetire}
                          onChange={(e) => basculer(q.id, e.target.checked)}
                          sx={{ pt: 0.25, "&.Mui-checked": { color: "var(--accent)" } }}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {q.libelle}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" component="p">
                            {parentRetire
                              ? "Posée seulement après un oui à la question au-dessus, qui est retirée."
                              : EFFETS[q.effet]}
                          </Typography>
                          {!posee && retireUnGardeFou(q) && !parentRetire && (
                            <Typography variant="caption" color="warning.dark" component="p">
                              Retirée : le portail ne vous signalera plus ce cas avant le
                              rendez-vous.
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </Box>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>

      {erreur && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {erreur}
        </Alert>
      )}

      <Box sx={{ mt: 2.5, display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          onClick={enregistrer}
          disabled={!modifie || enregistrement || fige}
          sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "var(--accent-press)" } }}
        >
          {enregistrement ? "Enregistrement…" : "Enregistrer les questions"}
        </Button>
      </Box>

      <Retour
        ouvert={succes}
        message={<>Questions enregistrées. Elles valent pour le prochain parcours.</>}
        gravite="success"
        onFermer={() => setSucces(false)}
      />
    </Box>
  );
}
