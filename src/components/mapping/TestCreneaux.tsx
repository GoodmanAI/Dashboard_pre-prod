"use client";

import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { IconCalendarEvent } from "@tabler/icons-react";
import { BORDER, BRAND, INK, INK_MUTED, OK, OK_SOFT, SURFACE_MUTED, WARNING, WARNING_SOFT } from "@/lib/jetons";
import type { CreneauMarque, EtatTest, ReponseTest } from "@/lib/testCreneaux";

/**
 * « Tester les créneaux », un bouton par ligne de la correspondance des examens de Talk.
 * -----------------------------------------------------------------------------
 * Plan `plans/2026-10-tester-les-creneaux-depuis-le-dashboard.md`. Un clic relit en
 * base la ligne ENREGISTRÉE, demande ses créneaux à Xplore par AI2Xplore, et dit ce
 * que Lyrae récupère et ce que le robot proposera. La secrétaire corrige seule
 * (code, salles, ouverture dans Xplore) et relance.
 *
 *   const test = useTestCreneaux(userProductId);
 *   <BoutonTestCreneaux test={test} codeExamen=… aUnCode=… modifiee=… />
 *   {test.dialogue}
 */

/** Grisé pendant le test et 5 s après (T10). */
const REPOS_MS = 5000;

type EtatDialogue =
  | { phase: "ferme" }
  | { phase: "chargement"; libelle: string }
  | { phase: "resultat"; libelle: string; reponse: ReponseTest }
  | { phase: "erreur"; libelle: string; message: string };

export type TestCreneaux = ReturnType<typeof useTestCreneaux>;

export function useTestCreneaux(userProductId: number) {
  const [actif, setActif] = React.useState(false);
  const [etat, setEtat] = React.useState<EtatDialogue>({ phase: "ferme" });
  const [occupe, setOccupe] = React.useState(false);

  React.useEffect(() => {
    let vivant = true;
    fetch("/api/configuration/mapping/test-creneaux", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { actif: false }))
      .then((j) => vivant && setActif(Boolean(j?.actif)))
      .catch(() => vivant && setActif(false));
    return () => {
      vivant = false;
    };
  }, []);

  const tester = React.useCallback(
    async (codeExamen: string, libelle: string) => {
      if (occupe) return;
      setOccupe(true);
      setEtat({ phase: "chargement", libelle });
      try {
        const r = await fetch("/api/configuration/mapping/test-creneaux", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userProductId, codeExamen }),
        });
        if (r.status === 429) {
          setEtat({
            phase: "erreur",
            libelle,
            message: "Vous avez lancé 5 tests en une minute. Attendez un peu avant le suivant.",
          });
        } else if (!r.ok) {
          setEtat({
            phase: "erreur",
            libelle,
            message: "Le test n'a pas pu se lancer. Rechargez la page, puis réessayez.",
          });
        } else {
          setEtat({ phase: "resultat", libelle, reponse: await r.json() });
        }
      } catch {
        setEtat({
          phase: "erreur",
          libelle,
          message: "Le test n'a pas pu joindre le serveur. Vérifiez votre connexion, puis réessayez.",
        });
      } finally {
        setTimeout(() => setOccupe(false), REPOS_MS);
      }
    },
    [occupe, userProductId]
  );

  const fermer = React.useCallback(() => setEtat({ phase: "ferme" }), []);

  return { actif, occupe, tester, dialogue: <DialogTestCreneaux etat={etat} onFermer={fermer} /> };
}

export function BoutonTestCreneaux({
  test,
  codeExamen,
  libelle,
  aUnCode,
  modifiee,
}: {
  test: TestCreneaux;
  codeExamen: string;
  libelle: string;
  /** Code client ou code injecté saisi sur la ligne. */
  aUnCode: boolean;
  /** La ligne a des changements non enregistrés : le test lirait l'ancienne version. */
  modifiee: boolean;
}) {
  if (!test.actif) return null;
  const raison = modifiee
    ? "Enregistrez d'abord vos modifications : le test lit la ligne enregistrée."
    : !aUnCode
      ? "Saisissez d'abord le code de l'examen dans votre logiciel."
      : test.occupe
        ? "Un test vient d'être lancé. Patientez quelques secondes."
        : "Voir les créneaux que Lyrae trouve pour cet examen.";
  const bloque = modifiee || !aUnCode || test.occupe;

  return (
    <Tooltip title={raison} placement="top">
      {/* Le span garde l'info-bulle sur un bouton désactivé. */}
      <span style={{ display: "inline-flex" }}>
        <Button
          size="small"
          variant="text"
          startIcon={<IconCalendarEvent size={15} />}
          disabled={bloque}
          onClick={() => test.tester(codeExamen, libelle)}
          sx={{
            px: 1,
            minHeight: 32,
            fontSize: 12,
            fontWeight: 600,
            color: BRAND,
            textTransform: "none",
            justifyContent: "flex-start",
          }}
        >
          Tester les créneaux
        </Button>
      </span>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// La fenêtre
// ---------------------------------------------------------------------------

/** `2026-10-30` → « jeudi 30 octobre ». Midi UTC : aucun fuseau ne change le jour. */
function jourLisible(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

const premiereMajuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** Le message principal de chaque état, et sa gravité. */
function message(r: ReponseTest): { gravite: "success" | "info" | "warning" | "error"; texte: string } {
  const jusquau = r.fenetre ? jourLisible(r.fenetre.jusquau) : "";
  const n = r.creneaux?.length ?? 0;
  const textes: Record<EtatTest, { gravite: "success" | "info" | "warning" | "error"; texte: string }> = {
    ok:
      r.fenetre?.type === "premiers"
        ? {
            gravite: "info",
            texte: `Aucun créneau d'ici le ${jusquau}. Voici les premiers que Lyrae trouve.`,
          }
        : {
            gravite: "success",
            texte: `Lyrae voit ${pluriel(n, "créneau", "créneaux")} pour cet examen d'ici le ${jusquau}. ${
              r.proposes === n
                ? n > 1
                  ? "Tous seront proposés aux patients."
                  : "Il sera proposé aux patients."
                : `${r.proposes} ${r.proposes && r.proposes > 1 ? "seront proposés" : "sera proposé"} aux patients.`
            }`,
          },
    tous_ecartes: {
      gravite: "warning",
      texte:
        "Lyrae voit des créneaux, mais aucun dans les salles retenues pour cet examen. Ajoutez la salle dans la colonne Salles, ou ouvrez les plages dans une salle retenue.",
    },
    aucun: {
      gravite: "warning",
      texte:
        "Votre planning accepte cet examen, mais aucun créneau n'est ouvert aux rendez-vous externes. Ouvrez des plages pour Lyrae dans Xplore, puis relancez le test.",
    },
    refus: {
      gravite: "error",
      texte:
        "Xplore ne connaît pas ce code d'examen, ou ne l'ouvre pas aux rendez-vous externes. Vérifiez le code de cette ligne, et l'ouverture de l'examen aux rendez-vous externes dans Xplore.",
    },
    panne: {
      gravite: "info",
      texte: "Le test n'a pas pu joindre votre planning. Ce n'est pas votre réglage. Réessayez dans quelques minutes.",
    },
    injoignable: {
      gravite: "info",
      texte: "Le test n'a pas pu joindre votre planning. Ce n'est pas votre réglage. Réessayez dans quelques minutes.",
    },
    site_inconnu: {
      gravite: "error",
      texte: "Le code de votre centre dans Xplore n'est pas encore relié à Lyrae. Contactez Lyrae pour le relier.",
    },
    sans_site: {
      gravite: "error",
      texte: "Votre centre n'a pas encore de code dans Xplore. Contactez Lyrae pour le relier.",
    },
    type_ferme: {
      gravite: "warning",
      texte:
        "Lyrae ne prend pas de rendez-vous pour ce type d'examen dans votre centre. Contactez Lyrae si c'est une erreur.",
    },
    sans_code: {
      gravite: "warning",
      texte: "Cette ligne n'a pas de code d'examen. Saisissez le code de votre logiciel, enregistrez, puis relancez le test.",
    },
    non_enregistre: {
      gravite: "warning",
      texte: "Cette ligne n'est pas encore enregistrée. Enregistrez, puis relancez le test.",
    },
  };
  return textes[r.etat] ?? textes.injoignable;
}

export function DialogTestCreneaux({ etat, onFermer }: { etat: EtatDialogue; onFermer: () => void }) {
  const theme = useTheme();
  const plein = useMediaQuery(theme.breakpoints.down("sm"));
  const ouvert = etat.phase !== "ferme";

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      fullScreen={plein}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { borderRadius: plein ? 0 : 3 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, pb: 0.5, color: INK }}>Créneaux vus par Lyrae</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {etat.phase !== "ferme" && (
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: INK, mb: 1.5 }}>{etat.libelle}</Typography>
        )}
        {etat.phase === "chargement" && (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={20} />
            <Typography sx={{ fontSize: 14, color: INK_MUTED }}>
              Lecture du planning, quelques secondes…
            </Typography>
          </Stack>
        )}
        {etat.phase === "erreur" && <Alert severity="info">{etat.message}</Alert>}
        {etat.phase === "resultat" && <Resultat r={etat.reponse} />}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onFermer} variant="contained" disableElevation sx={{ textTransform: "none" }}>
          Fermer
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Resultat({ r }: { r: ReponseTest }) {
  const m = message(r);
  const creneaux = r.creneaux ?? [];
  const desEcartes = creneaux.some((c) => !c.propose);
  const plusieursSites = (r.sites?.codes.length ?? 0) > 1;

  return (
    <Stack spacing={1.5}>
      {r.examen?.codeEnvoye && (
        <Typography sx={{ fontSize: 12.5, color: INK_MUTED }}>
          Code envoyé à Xplore : <b>{r.examen.codeEnvoye}</b>
          {r.examen.typeEnvoye ? ` (type ${r.examen.typeEnvoye})` : ""}
          {r.examen.injecte ? ", version injectée" : ""}
          {r.sites?.codes.length ? `. Centre${plusieursSites ? "s" : ""} : ${r.sites.codes.join(", ")}` : ""}.
        </Typography>
      )}

      {r.examen && !r.examen.pratique && (
        <Alert severity="warning">
          Cet examen n&apos;est pas attribué à Lyrae : le robot ne le propose pas au téléphone. Cochez la case de la
          ligne pour qu&apos;il le propose.
        </Alert>
      )}

      <Alert severity={m.gravite}>{m.texte}</Alert>

      {r.etat === "refus" && (r.motifs?.length ?? 0) > 0 && (
        <Typography sx={{ fontSize: 12, color: INK_MUTED }}>Réponse d&apos;Xplore : {r.motifs!.join(" ; ")}</Typography>
      )}

      {r.fenetre?.tronque && (
        <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
          Seuls les {creneaux.length} premiers créneaux sont affichés.
        </Typography>
      )}

      {creneaux.length > 0 && (
        <ListeCreneaux
          creneaux={creneaux}
          libelles={r.salles?.libelles ?? {}}
          avecSite={plusieursSites}
          avecMarque={desEcartes}
        />
      )}

      {creneaux.length > 0 && (
        <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
          Au téléphone, Lyrae ne propose pas les créneaux trop proches de l&apos;heure de l&apos;appel.
        </Typography>
      )}
    </Stack>
  );
}

function ListeCreneaux({
  creneaux,
  libelles,
  avecSite,
  avecMarque,
}: {
  creneaux: CreneauMarque[];
  libelles: Record<string, string>;
  avecSite: boolean;
  avecMarque: boolean;
}) {
  const parJour = React.useMemo(() => {
    const m = new Map<string, CreneauMarque[]>();
    for (const c of creneaux) m.set(c.date, [...(m.get(c.date) ?? []), c]);
    return [...m.entries()];
  }, [creneaux]);

  return (
    <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: 2, overflow: "hidden" }}>
      {parJour.map(([jour, liste]) => (
        <Box key={jour}>
          <Typography
            sx={{
              px: 1.5,
              py: 0.75,
              fontSize: 12.5,
              fontWeight: 700,
              color: INK,
              bgcolor: SURFACE_MUTED,
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            {premiereMajuscule(jourLisible(jour))}
          </Typography>
          {liste.map((c, i) => (
            <Stack
              key={`${c.id ?? i}-${c.heure}-${c.poste}`}
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{
                px: 1.5,
                py: 0.75,
                borderBottom: `1px solid ${BORDER}`,
                opacity: c.propose ? 1 : 0.75,
                flexWrap: "wrap",
                rowGap: 0.5,
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK, minWidth: 44, fontVariantNumeric: "tabular-nums" }}>
                {c.heure}
              </Typography>
              <Typography sx={{ fontSize: 13, color: INK, flex: 1, minWidth: 80 }}>
                {libelles[c.poste] ?? (c.poste || "Salle non précisée")}
                {avecSite ? <Box component="span" sx={{ color: INK_MUTED }}> · {c.codeSite}</Box> : null}
              </Typography>
              {avecMarque && (
                <Chip
                  size="small"
                  label={c.propose ? "Proposé" : "Non proposé : salle non retenue"}
                  sx={{
                    height: 22,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: c.propose ? OK : WARNING,
                    bgcolor: c.propose ? OK_SOFT : WARNING_SOFT,
                  }}
                />
              )}
            </Stack>
          ))}
        </Box>
      ))}
    </Box>
  );
}
