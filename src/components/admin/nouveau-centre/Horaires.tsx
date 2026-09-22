"use client";

import { Box, Button, IconButton, Stack, Switch, TextField, Tooltip, Typography } from "@mui/material";
import { IconCopy, IconPlus, IconX } from "@tabler/icons-react";
import { JOURS, type Journee, type Plage } from "@/lib/questionnaireTalk";
import { INK, INK_MUTED, BORDER } from "@/lib/jetons";

/**
 * Les horaires d'ouverture, avec report d'un jour sur les suivants.
 *
 * **Le report est la raison d'être de ce composant.** Sept jours saisis à la main font
 * quatorze champs pour une information qui se répète presque toujours. La demande était
 * explicite : remplir lundi de 8 h à 18 h, puis reporter jusqu'au vendredi d'un geste.
 *
 * ⚠️ **Le report ne verrouille rien.** Chaque jour reste modifiable après, et c'est
 * précisément le cas qui a motivé la demande : le samedi n'ouvre que le matin. Un report
 * qui figerait les jours suivants raterait ce pour quoi on le fait.
 *
 * Forme stockée, relevée sur l'écran de paramétrage : clés de jour en ANGLAIS, heures en
 * `"HH:MM"` sur 24 h, `enabled: false` pour un jour fermé, et `ranges` en tableau parce
 * qu'un centre peut fermer le midi.
 */
export default function Horaires({
  valeur,
  onChange,
}: {
  valeur: Record<string, Journee>;
  onChange: (v: Record<string, Journee>) => void;
}) {
  const majJour = (cle: string, j: Journee) => onChange({ ...valeur, [cle]: j });

  const reporter = (depuis: string) => {
    const modele = valeur[depuis];
    if (!modele) return;
    const i = JOURS.findIndex((j) => j.cle === depuis);
    const suivant = { ...valeur };
    // On s'arrête au vendredi : reporter un horaire de semaine sur le samedi et le
    // dimanche ouvrirait un centre qui ne l'est pas, ce qui est pire que de le saisir.
    for (const j of JOURS.slice(i + 1, 5)) {
      suivant[j.cle] = {
        enabled: modele.enabled,
        ranges: modele.ranges.map((p) => ({ ...p })),
      };
    }
    onChange(suivant);
  };

  return (
    <Stack spacing={1}>
      {JOURS.map((jour, i) => {
        const j = valeur[jour.cle] ?? { enabled: false, ranges: [] };
        const peutReporter = i < 4 && j.enabled && j.ranges.length > 0;
        return (
          <Box
            key={jour.cle}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1.5,
              p: 1.25,
              border: `1px solid ${BORDER}`,
              borderRadius: 1.5,
              bgcolor: j.enabled ? "transparent" : "#FAFBFC",
            }}
          >
            <Box sx={{ width: 96, pt: 0.75 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
                {jour.libelle}
              </Typography>
            </Box>

            <Switch
              checked={j.enabled}
              onChange={(_, v) =>
                majJour(jour.cle, {
                  enabled: v,
                  // Ouvrir un jour vierge propose la plage la plus courante plutôt
                  // qu'une ligne vide : c'est ce qu'on aurait tapé.
                  ranges: v && j.ranges.length === 0 ? [{ start: "08:00", end: "18:00" }] : j.ranges,
                })
              }
              sx={{ mt: 0.25 }}
            />

            <Box sx={{ flex: 1, minWidth: 0 }}>
              {!j.enabled ? (
                <Typography sx={{ fontSize: 13, color: INK_MUTED, pt: 1 }}>Fermé</Typography>
              ) : (
                <Stack spacing={0.75}>
                  {j.ranges.map((p: Plage, k: number) => (
                    <Stack key={k} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <TextField
                        type="time"
                        size="small"
                        value={p.start}
                        onChange={(e) => {
                          const ranges = [...j.ranges];
                          ranges[k] = { ...p, start: e.target.value };
                          majJour(jour.cle, { ...j, ranges });
                        }}
                        sx={{ width: 122 }}
                      />
                      <Typography sx={{ fontSize: 13, color: INK_MUTED }}>à</Typography>
                      <TextField
                        type="time"
                        size="small"
                        value={p.end}
                        onChange={(e) => {
                          const ranges = [...j.ranges];
                          ranges[k] = { ...p, end: e.target.value };
                          majJour(jour.cle, { ...j, ranges });
                        }}
                        sx={{ width: 122 }}
                      />
                      {j.ranges.length > 1 && (
                        <Tooltip title="Retirer cette plage">
                          <IconButton
                            size="small"
                            onClick={() =>
                              majJour(jour.cle, {
                                ...j,
                                ranges: j.ranges.filter((_, n) => n !== k),
                              })
                            }
                          >
                            <IconX size={15} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  ))}
                  <Box>
                    <Button
                      size="small"
                      startIcon={<IconPlus size={14} />}
                      onClick={() =>
                        majJour(jour.cle, {
                          ...j,
                          ranges: [...j.ranges, { start: "14:00", end: "18:00" }],
                        })
                      }
                    >
                      Couper la journée
                    </Button>
                  </Box>
                </Stack>
              )}
            </Box>

            <Box sx={{ pt: 0.5 }}>
              {peutReporter && (
                <Tooltip title="Reporter ces horaires jusqu'au vendredi. Chaque jour reste modifiable après.">
                  <Button
                    size="small"
                    startIcon={<IconCopy size={14} />}
                    onClick={() => reporter(jour.cle)}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    Reporter
                  </Button>
                </Tooltip>
              )}
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
