"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import Retour from "@/components/shared/Retour";
import ChampAvecVariables from "@/components/shared/ChampAvecVariables";
import {
  CLE_EXAMEN_FERME,
  ERREUR_NUMERO_FERME,
  ERREUR_ORIENTER_VIDE,
  EXAMENS_CONSIGNE,
  MAX_TEXTE_EXAMEN_FERME,
  REPONSES_EXAMEN_FERME,
  VARIABLES_EXAMEN_FERME,
  erreurTexteFerme,
  examenAvecArticle,
  numeroEnInternational,
  numeroLisible,
  phraseExamenFerme,
  type ExamenFerme,
  type ReponseExamenFerme,
} from "@/lib/talkTextes";
import { enregistrerTextesTalk, useTextesTalk } from "./textesTalk";

/**
 * « Examens que le robot ne prend pas » (02/11/2026).
 *
 * Pour chaque examen que le centre ne confie pas au robot, ce que le robot répond
 * au patient : passer l'appel (comme avant), dire où prendre rendez-vous (phrase
 * du centre et/ou numéro), ou dire que le centre ne fait pas l'examen. Domaine
 * `talk.textes`, clé `examenFermeAuRobot` ; forme et validation dans
 * `src/lib/talkTextes.ts`. Plan `lyrae/plans/2026-11-examens-fermes-au-robot.md`.
 *
 * La carte liste d'office les types décochés dans « Examens acceptés » et les
 * examens marqués non réservables dans la correspondance ; « Ajouter un examen
 * précis » en ajoute un autre. Le réglage ne joue que pour un examen demandé
 * seul : dans une demande à plusieurs examens, l'appel passe au secrétariat.
 */

type ExamKey = "radiographie" | "irm" | "echographie" | "scanner" | "mammo";

/** Clé de « Examens acceptés » vers code robot. */
const CODE_DU_TYPE: Record<ExamKey, string> = {
  radiographie: "RX",
  irm: "MR",
  echographie: "US",
  scanner: "CT",
  mammo: "MG",
};

type Saisie = { reponse: ReponseExamenFerme; texte: string; telephone: string };

type ExamenMapping = {
  codeExamen: string;
  typeExamen: string;
  libelle: string;
  /** Le libellé que le centre a saisi, sinon celui du référentiel. */
  affiche: string;
  performed: boolean;
};

type Ligne = {
  cle: string;
  titre: string;
  /** L'examen tel que le robot le dit : « la mammographie ». */
  parle: string;
  pourquoi: string | null;
  /** Ligne ajoutée à la main : on peut la retirer. */
  ajoutee: boolean;
};

const DEFAUT: Saisie = { reponse: "transferer", texte: "", telephone: "" };

function lire(valeur: Record<string, unknown>): Record<string, Saisie> {
  const brut = valeur[CLE_EXAMEN_FERME];
  const sortie: Record<string, Saisie> = {};
  if (!brut || typeof brut !== "object") return sortie;
  for (const [cle, v] of Object.entries(brut as Record<string, any>)) {
    if (!v || typeof v !== "object") continue;
    const reponse: ReponseExamenFerme =
      v.reponse === "orienter" || v.reponse === "non_fait"
        ? v.reponse
        : "transferer";
    sortie[cle] = {
      reponse,
      texte: typeof v.texte === "string" ? v.texte : "",
      telephone:
        typeof v.telephone === "string" ? numeroLisible(v.telephone) : "",
    };
  }
  return sortie;
}

function erreursDe(s: Saisie): { texte: string | null; telephone: string | null } {
  if (s.reponse === "transferer") return { texte: null, telephone: null };
  const texte = s.texte.trim() ? erreurTexteFerme(s.texte.trim()) : null;
  if (s.reponse === "non_fait") return { texte, telephone: null };
  const tel = s.telephone.trim();
  const telephone = tel && !numeroEnInternational(tel) ? ERREUR_NUMERO_FERME : null;
  if (!s.texte.trim() && !tel) return { texte: ERREUR_ORIENTER_VIDE, telephone };
  return { texte, telephone };
}

function versStocke(s: Saisie): ExamenFerme {
  if (s.reponse === "transferer") return { reponse: "transferer" };
  const texte = s.texte.trim();
  if (s.reponse === "non_fait")
    return texte ? { reponse: "non_fait", texte } : { reponse: "non_fait" };
  const telephone = s.telephone.trim()
    ? (numeroEnInternational(s.telephone) ?? undefined)
    : undefined;
  return {
    reponse: "orienter",
    ...(texte ? { texte } : {}),
    ...(telephone ? { telephone } : {}),
  };
}

export default function ExamensFermesAuRobotCard({
  userProductId,
  readOnly,
  examsAccepted,
}: {
  userProductId: number;
  readOnly: boolean;
  examsAccepted: Partial<Record<ExamKey, boolean>>;
}) {
  const { valeur, erreurChargement } = useTextesTalk(userProductId);
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const [initial, setInitial] = useState<string>("{}");
  const [ajoutees, setAjoutees] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ExamenMapping[] | null>(null);
  const [mappingIllisible, setMappingIllisible] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistreA, setEnregistreA] = useState<number | null>(null);

  useEffect(() => {
    if (!valeur) return;
    const s = lire(valeur);
    setSaisies(s);
    setInitial(JSON.stringify(s));
  }, [valeur]);

  // La correspondance des examens : les codes non réservables, et la liste où
  // choisir un examen précis.
  useEffect(() => {
    if (!userProductId) return;
    let vivant = true;
    fetch(`/api/configuration/get/mapping?userProductId=${userProductId}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (!vivant) return;
        const rows: any[] = Array.isArray(json) ? json : Object.values(json ?? {});
        setMapping(
          rows
            .filter((r) => typeof r?.codeExamen === "string" && r.codeExamen)
            .map((r) => {
              const libelle = (r.libelle ?? "").trim() || r.codeExamen;
              return {
                codeExamen: r.codeExamen,
                typeExamen: r.typeExamen ?? "",
                libelle,
                affiche: (r.libelleClient ?? "").trim() || libelle,
                performed: r.performed !== false,
              };
            }),
        );
      })
      .catch(() => {
        if (vivant) {
          setMapping([]);
          setMappingIllisible(true);
        }
      });
    return () => {
      vivant = false;
    };
  }, [userProductId]);

  const parCode = useMemo(() => {
    const m = new Map<string, ExamenMapping>();
    for (const e of mapping ?? []) m.set(e.codeExamen, e);
    return m;
  }, [mapping]);

  const lignes = useMemo<Ligne[]>(() => {
    const out: Ligne[] = [];
    const vues = new Set<string>();
    const pousser = (l: Ligne) => {
      if (vues.has(l.cle)) return;
      vues.add(l.cle);
      out.push(l);
    };
    const type = (code: string) => EXAMENS_CONSIGNE.find((x) => x.code === code);
    const precis = (code: string, pourquoi: string | null, ajoutee: boolean) => {
      const e = parCode.get(code);
      pousser({
        cle: code,
        titre: e?.affiche ?? code,
        parle: examenAvecArticle(e?.libelle ?? "") || "cet examen",
        pourquoi,
        ajoutee,
      });
    };

    // 1. Les types décochés dans « Examens acceptés ».
    for (const [k, code] of Object.entries(CODE_DU_TYPE) as [ExamKey, string][]) {
      if (examsAccepted[k]) continue;
      const t = type(code)!;
      pousser({
        cle: code,
        titre: t.libelle,
        parle: t.parle,
        pourquoi: "Décoché dans Examens acceptés",
        ajoutee: false,
      });
    }
    // 2. Les examens non réservables de la correspondance.
    for (const e of mapping ?? []) {
      if (!e.performed) precis(e.codeExamen, "Non réservable dans la correspondance", false);
    }
    // 3. Ceux déjà réglés, puis ceux ajoutés à la main.
    for (const cle of [...Object.keys(saisies), ...ajoutees]) {
      const t = type(cle);
      if (t)
        pousser({ cle, titre: t.libelle, parle: t.parle, pourquoi: null, ajoutee: true });
      else precis(cle, null, true);
    }
    return out;
  }, [examsAccepted, mapping, parCode, saisies, ajoutees]);

  const options = useMemo(() => {
    const prises = new Set(lignes.map((l) => l.cle));
    const types = EXAMENS_CONSIGNE.filter((t) => !prises.has(t.code)).map((t) => ({
      cle: t.code,
      libelle: `${t.libelle} (tous les examens)`,
    }));
    const examens = (mapping ?? [])
      .filter((e) => !prises.has(e.codeExamen))
      .map((e) => ({ cle: e.codeExamen, libelle: e.affiche }))
      .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
    return [...types, ...examens];
  }, [lignes, mapping]);

  const saisie = (cle: string) => saisies[cle] ?? DEFAUT;
  const changer = (cle: string, partiel: Partial<Saisie>) =>
    setSaisies((p) => ({ ...p, [cle]: { ...(p[cle] ?? DEFAUT), ...partiel } }));
  const retirer = (cle: string) => {
    setSaisies((p) => {
      const n = { ...p };
      delete n[cle];
      return n;
    });
    setAjoutees((p) => p.filter((c) => c !== cle));
  };

  /**
   * Ce qui part au serveur : chaque ligne qui ne fait pas « passer l'appel », et
   * les lignes ajoutées à la main même à « passer l'appel » (un examen précis qui
   * transfère quand son type oriente).
   */
  const aStocker = useMemo(() => {
    const deja = new Set(Object.keys(JSON.parse(initial) as object));
    const out: Record<string, Saisie> = {};
    for (const l of lignes) {
      const s = saisies[l.cle];
      if (!s) {
        if (l.ajoutee) out[l.cle] = DEFAUT;
        continue;
      }
      if (s.reponse !== "transferer" || l.ajoutee || deja.has(l.cle))
        out[l.cle] = s;
    }
    return out;
  }, [lignes, saisies, initial]);

  const modifie = JSON.stringify(aStocker) !== initial;
  const reglees = Object.values(aStocker).filter(
    (s) => s.reponse !== "transferer",
  ).length;
  const bloque = Object.values(aStocker).some((s) => {
    const e = erreursDe(s);
    return Boolean(e.texte || e.telephone);
  });

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const stocke: Record<string, ExamenFerme> = {};
      for (const [cle, s] of Object.entries(aStocker)) stocke[cle] = versStocke(s);
      const v = await enregistrerTextesTalk(userProductId, {
        [CLE_EXAMEN_FERME]: Object.keys(stocke).length ? stocke : null,
      });
      const s = lire(v);
      setSaisies(s);
      setAjoutees([]);
      setInitial(JSON.stringify(s));
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
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Typography variant="h6">Examens que le robot ne prend pas</Typography>
          <Chip
            size="small"
            label={
              reglees > 0
                ? `${reglees} réponse${reglees > 1 ? "s" : ""} réglée${reglees > 1 ? "s" : ""}`
                : "Passés au secrétariat"
            }
            sx={{
              bgcolor: reglees > 0 ? "rgba(var(--accent-rgb), 0.15)" : "rgba(0,0,0,0.06)",
              color: reglees > 0 ? "var(--accent-deep)" : "text.secondary",
              fontWeight: 700,
            }}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {erreurChargement ? (
          <Alert severity="error">{erreurChargement}</Alert>
        ) : !valeur || mapping === null ? (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={24} sx={{ color: "var(--accent)" }} />
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              Pour chaque examen que vous ne confiez pas au robot, choisissez ce
              qu&apos;il répond au patient. Si le patient demande plusieurs
              examens à la fois, le robot passe l&apos;appel au secrétariat.
            </Typography>

            {mappingIllisible && (
              <Alert severity="warning">
                La correspondance des examens n&apos;a pas pu être lue : les
                examens non réservables ne sont pas listés. Rechargez la page.
              </Alert>
            )}

            {lignes.length === 0 && (
              <Alert severity="info">
                Le robot prend tous vos examens. Ajoutez un examen ci-dessous
                pour régler sa réponse quand même.
              </Alert>
            )}

            {lignes.map((l) => {
              const s = saisie(l.cle);
              const e = erreursDe(s);
              return (
                <Box
                  key={l.cle}
                  sx={{
                    p: { xs: 1.5, sm: 2 },
                    borderRadius: 2,
                    border: "1px solid rgba(0,0,0,0.12)",
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="flex-start"
                    justifyContent="space-between"
                    spacing={1}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle1" sx={{ overflowWrap: "anywhere" }}>
                        {l.titre}
                      </Typography>
                      {l.pourquoi && (
                        <Typography variant="caption" color="text.secondary">
                          {l.pourquoi}
                        </Typography>
                      )}
                    </Box>
                    {l.ajoutee && !readOnly && (
                      <Tooltip title="Retirer cet examen de la liste" arrow>
                        <IconButton
                          size="small"
                          aria-label={`Retirer ${l.titre}`}
                          onClick={() => retirer(l.cle)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>

                  <RadioGroup
                    value={s.reponse}
                    onChange={(_, v) => changer(l.cle, { reponse: v as ReponseExamenFerme })}
                    sx={{ mt: 1 }}
                  >
                    {REPONSES_EXAMEN_FERME.map((r) => (
                      <FormControlLabel
                        key={r.valeur}
                        value={r.valeur}
                        control={<Radio size="small" />}
                        label={r.libelle}
                        disabled={readOnly}
                      />
                    ))}
                  </RadioGroup>

                  {s.reponse !== "transferer" && (
                    <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                      <ChampAvecVariables
                        label={
                          s.reponse === "orienter"
                            ? "Phrase dite au patient"
                            : "Phrase ajoutée (facultatif)"
                        }
                        valeur={s.texte}
                        onChange={(v) => changer(l.cle, { texte: v })}
                        variables={VARIABLES_EXAMEN_FERME}
                        placeholder={
                          s.reponse === "orienter"
                            ? "Par exemple : Les mammographies se prennent au centre du Parc."
                            : "Par exemple : Vous pouvez vous adresser à l'hôpital."
                        }
                        aide={
                          s.reponse === "orienter"
                            ? "Le robot lit cette phrase au patient. Mettez le numéro dans le champ Numéro : il sera dit chiffre par chiffre."
                            : `${s.texte.length} / ${MAX_TEXTE_EXAMEN_FERME} caractères`
                        }
                        erreur={e.texte}
                        desactive={readOnly}
                        minRows={1}
                        maxLength={MAX_TEXTE_EXAMEN_FERME + 50}
                      />
                      {s.reponse === "orienter" && (
                        <TextField
                          size="small"
                          label="Numéro"
                          placeholder="01 23 45 67 89"
                          value={s.telephone}
                          onChange={(ev) => changer(l.cle, { telephone: ev.target.value })}
                          error={Boolean(e.telephone)}
                          helperText={e.telephone || "Facultatif si la phrase suffit."}
                          disabled={readOnly}
                          inputProps={{ inputMode: "tel", maxLength: 20 }}
                          InputLabelProps={{ shrink: true }}
                          sx={{ maxWidth: 260 }}
                        />
                      )}
                    </Stack>
                  )}

                  <Box
                    sx={{
                      mt: 1.5,
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: "rgba(var(--accent-rgb), 0.07)",
                      border: "1px solid rgba(var(--accent-rgb), 0.25)",
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Ce que le patient entend
                    </Typography>
                    <Typography
                      variant="body2"
                      color={e.texte || e.telephone ? "text.secondary" : undefined}
                      sx={{ lineHeight: 1.7 }}
                    >
                      {e.texte || e.telephone
                        ? "Corrigez la réponse ci-dessus pour voir la phrase."
                        : phraseExamenFerme(versStocke(s), l.parle)}
                    </Typography>
                  </Box>
                </Box>
              );
            })}

            {!readOnly && (
              <Autocomplete
                size="small"
                options={options}
                value={null}
                blurOnSelect
                getOptionLabel={(o) => o.libelle}
                isOptionEqualToValue={(a, b) => a.cle === b.cle}
                onChange={(_, o) => {
                  if (o) setAjoutees((p) => [...p, o.cle]);
                }}
                noOptionsText="Aucun examen trouvé"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Ajouter un examen précis"
                    placeholder="Ostéodensitométrie, IRM du genou…"
                    InputLabelProps={{ shrink: true }}
                  />
                )}
                sx={{ maxWidth: 480 }}
              />
            )}

            {erreur && <Alert severity="error">{erreur}</Alert>}

            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
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
                {enregistrement ? "Enregistrement…" : "Enregistrer les réponses"}
              </Button>
            </Stack>
          </Stack>
        )}

        <Retour
          ouvert={enregistreA !== null}
          message={<>Réponses enregistrées.</>}
          gravite={"success"}
          onFermer={() => setEnregistreA(null)}
        />
      </AccordionDetails>
    </Accordion>
  );
}
