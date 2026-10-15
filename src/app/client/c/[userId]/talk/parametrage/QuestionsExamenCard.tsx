"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Retour from "@/components/shared/Retour";
import ArbreDeQuestions, {
  NoeudQuestion,
} from "@/components/shared/ArbreDeQuestions";
import {
  ARBRE_QUESTIONS,
  CLE_QUESTIONS,
  QuestionArbre,
  QuestionsExamen,
} from "@/lib/talkTextes";
import { enregistrerTextesTalk, useTextesTalk } from "./textesTalk";

/**
 * « Questions avant l'IRM et le scanner » (15/10/2026).
 *
 * Le centre choisit, pour l'IRM et pour le scanner, les questions que le robot
 * pose avant de réserver. Seul « pas posée » est stocké : une clé absente veut
 * dire « posée », comme avant ce réglage. Domaine `talk.textes`, clé
 * `questionsExamen`, plan `lyrae/plans/2026-10-avance-et-questions-par-centre.md`.
 */

type Etat = Record<string, QuestionsExamen>;

function lire(valeur: Record<string, unknown>): Etat {
  const q = valeur[CLE_QUESTIONS];
  return q && typeof q === "object" ? (q as Etat) : {};
}

/** Retire les valeurs par défaut, pour comparer et enregistrer. */
function propre(e: Etat): Etat {
  const r: Etat = {};
  for (const [code, q] of Object.entries(e)) {
    const x: QuestionsExamen = {};
    for (const [k, v] of Object.entries(q)) {
      if (v === false) (x as any)[k] = false;
    }
    if (q.injection === false && q.siInjectionNonDemandee === "avec")
      x.siInjectionNonDemandee = "avec";
    if (Object.keys(x).length) r[code] = x;
  }
  return r;
}

const pose = (q: QuestionsExamen | undefined, cle: string) =>
  (q as any)?.[cle] !== false;

export default function QuestionsExamenCard({
  userProductId,
  readOnly,
}: {
  userProductId: number;
  readOnly: boolean;
}) {
  const { valeur, erreurChargement } = useTextesTalk(userProductId);
  const [etat, setEtat] = useState<Etat>({});
  const [initial, setInitial] = useState<string>("{}");
  const [onglet, setOnglet] = useState<string>(ARBRE_QUESTIONS[0].code);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistreA, setEnregistreA] = useState<number | null>(null);

  useEffect(() => {
    if (!valeur) return;
    const e = propre(lire(valeur));
    setEtat(e);
    setInitial(JSON.stringify(e));
  }, [valeur]);

  const modifie = JSON.stringify(propre(etat)) !== initial;
  const retirees = Object.values(propre(etat)).reduce(
    (n, q) => n + Object.values(q).filter((v) => v === false).length,
    0,
  );

  const arbre =
    ARBRE_QUESTIONS.find((a) => a.code === onglet) ?? ARBRE_QUESTIONS[0];
  const q = etat[arbre.code];
  const injectionPosee = pose(q, "injection");
  const reserveAvec = q?.siInjectionNonDemandee === "avec";

  function changer(code: string, patch: Partial<QuestionsExamen>) {
    setEtat((p) => ({ ...p, [code]: { ...(p[code] ?? {}), ...patch } }));
  }

  function noeud(x: QuestionArbre): NoeudQuestion {
    const base: NoeudQuestion = {
      cle: x.cle,
      titre: x.titre,
      question: x.question,
      suites: [
        { si: "Oui", alors: x.siOui },
        { si: "Non", alors: x.siNon },
      ],
      coche: pose(q, x.cle),
    };
    if (x.siInjecte) {
      if (!injectionPosee && !reserveAvec) {
        base.inactif = true;
        base.raisonInactif =
          "Jamais posée : sans la question de l'injection, l'examen est réservé sans injection.";
      }
    }
    if (x.cle === "injection") {
      base.suites = [
        { si: "Oui", alors: `${x.siOui}, puis la question 1.1` },
        { si: "Non", alors: x.siNon },
      ];
      base.siDecoche = (
        <Stack spacing={0.5}>
          <Typography variant="body2">
            Sans la question, le robot réserve l&apos;examen :
          </Typography>
          <RadioGroup
            row
            value={reserveAvec ? "avec" : "sans"}
            onChange={(e) =>
              changer(arbre.code, {
                siInjectionNonDemandee: e.target.value as "sans" | "avec",
              })
            }
          >
            <FormControlLabel
              value="sans"
              control={<Radio size="small" />}
              label="sans injection"
              disabled={readOnly}
            />
            <FormControlLabel
              value="avec"
              control={<Radio size="small" />}
              label="avec injection"
              disabled={readOnly}
            />
          </RadioGroup>
        </Stack>
      );
    }
    return base;
  }

  const enfantsInjection = arbre.questions.filter((x) => x.siInjecte);
  const noeuds: NoeudQuestion[] = arbre.questions
    .filter((x) => !x.siInjecte)
    .map((x) =>
      x.cle === "injection"
        ? { ...noeud(x), enfants: enfantsInjection.map(noeud) }
        : noeud(x),
    );

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const p = propre(etat);
      const v = await enregistrerTextesTalk(userProductId, {
        [CLE_QUESTIONS]: Object.keys(p).length ? p : null,
      });
      const e = propre(lire(v));
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
            Questions avant l&apos;IRM et le scanner
          </Typography>
          <Chip
            size="small"
            label={
              retirees
                ? `${retirees} question${retirees > 1 ? "s" : ""} retirée${retirees > 1 ? "s" : ""}`
                : "Toutes posées"
            }
            sx={{
              bgcolor: retirees
                ? "rgba(var(--accent-rgb), 0.15)"
                : "rgba(0,0,0,0.06)",
              color: retirees ? "var(--accent-deep)" : "text.secondary",
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
              Avant de réserver une IRM ou un scanner, le robot pose ces
              questions, dans cet ordre. Décochez celles que votre centre ne
              veut pas qu&apos;il pose. Une réponse « oui » à une question de
              sécurité transfère l&apos;appel au secrétariat.
            </Typography>

            <Tabs
              value={onglet}
              onChange={(_, v) => setOnglet(v)}
              sx={{ borderBottom: 1, borderColor: "divider" }}
            >
              {ARBRE_QUESTIONS.map((a) => (
                <Tab
                  key={a.code}
                  value={a.code}
                  label={a.libelle}
                  sx={{ textTransform: "none" }}
                />
              ))}
            </Tabs>

            <ArbreDeQuestions
              noeuds={noeuds}
              desactive={readOnly}
              onBasculer={(cle, coche) => changer(arbre.code, { [cle]: coche })}
            />

            {erreur && <Alert severity="error">{erreur}</Alert>}

            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <Button
                variant="text"
                disabled={readOnly || enregistrement || retirees === 0}
                onClick={() => setEtat({})}
                sx={{ color: "text.secondary" }}
              >
                Poser toutes les questions
              </Button>
              <Button
                variant="contained"
                disableElevation
                disabled={readOnly || enregistrement || !modifie}
                onClick={() => void enregistrer()}
                sx={{
                  bgcolor: "var(--accent)",
                  "&:hover": { bgcolor: "var(--accent-press)" },
                }}
              >
                {enregistrement
                  ? "Enregistrement…"
                  : "Enregistrer les questions"}
              </Button>
            </Stack>
          </Stack>
        )}

        <Retour
          ouvert={enregistreA !== null}
          message={
            <>
              Questions enregistrées. Le robot les applique dès le prochain
              appel.
            </>
          }
          gravite={"success"}
          onFermer={() => setEnregistreA(null)}
        />
      </AccordionDetails>
    </Accordion>
  );
}
