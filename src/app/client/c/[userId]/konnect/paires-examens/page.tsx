"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useDroitPage } from "@/hooks/useDroitPage";
import { PAGES } from "@/lib/permissions";
import { useSuiviModifications } from "@/hooks/useSuiviModifications";

/**
 * Examens faits dans la même visite.
 *
 * LES COMBINAISONS RÉSERVABLES EN LIGNE (17/09/2026, plan
 * `lyrae/plans/2026-09-konnect-multi-examens.md`). Le centre coche les couples de
 * modalités qu'un patient peut réserver ensemble (une radio et une échographie) et
 * l'attente maximale entre les deux rendez-vous. Elles partent dans la même valeur de
 * domaine, clé `combinaisons` : `[{ modalite_a, modalite_b, ecart_max_minutes }]`,
 * paire rangée par ordre alphabétique des codes. Une combinaison absente n'est pas
 * autorisée : Konnect envoie alors le patient au rappel, comme pour trois examens ou
 * plus. C'est ce réglage qui décide, et plus la case « Bilan à deux examens » du
 * paramétrage, qui ouvrait le bilan à n'importe quelle paire sans aucune contrainte
 * entre les deux créneaux.
 *
 * LES RÉGLAGES PAR PAIRE, PLUS BAS, NE SONT PAS APPLIQUÉS. Ils descendent dans
 * `combo_examen`, que seul un moteur jamais branché à un écran lit. L'écran le dit.
 * L'historique ci-dessous reste vrai pour ce qu'ils enregistrent.
 *
 * ---- Historique : les paires (lot D, `combo_examen`) ----
 *
 * Une ordonnance demande souvent deux examens à enchaîner. Il faut placer deux
 * rendez-vous qui se suivent correctement : ni collés au point de rendre le second
 * infaisable, ni séparés par trois heures d'attente. Le portail savait déjà le
 * faire ; personne ne pouvait lui dire comment. `multiExamenActif` activait la
 * fonction, et le cabinet héritait de valeurs (10 / 25 / 75 minutes) qui n'avaient
 * pas été choisies pour lui.
 *
 * L'ORDRE DE SAISIE EST CELUI DU CLIENT. `combo_examen` impose
 * `examen_a < examen_b` en ordre alphabétique, pour qu'une paire ne dépende pas de
 * l'ordre d'écriture. Cette contrainte ne remonte pas jusqu'ici : Konnect trie, et
 * bascule `ordre_impose` en conséquence. Le client voit ses deux examens dans
 * l'ordre où il les a mis, ce qui est la seule chose qui ait du sens pour lui.
 *
 * DEUX RÉGLAGES NE SONT PAS EXPOSÉS, et c'est délibéré :
 *
 * - `meme_site_obligatoire` est non modifiable en V1. L'écran le dit plutôt que de
 *   le taire, sinon un centre multi-sites cherchera longtemps pourquoi ses deux
 *   examens ne se placent jamais sur deux sites.
 * - `mode_couplage` distingue la paire assemblée par le moteur du protocole que le
 *   RIS porte déjà comme un seul type de créneau. C'est une propriété du logiciel
 *   du centre, pas une préférence : l'exposer en toutes lettres à une secrétaire
 *   ferait un réglage incompréhensible, dont le mauvais choix casse la
 *   planification. Il reste sur `paire_dynamique`.
 *
 * UNE PAIRE PEUT NE PAS S'APPLIQUER. Konnect ne sait apparier que les examens que
 * son moteur de reconnaissance connaît (107 codes sur les 266 du référentiel au
 * 08/09/2026). Un réglage portant sur un autre examen est ignoré, et la paire
 * retombe sur les écarts par défaut : elle reste réservable, elle n'est pas réglée.
 * Le Dashboard ne sait pas lesquels sont concernés tant qu'il n'interroge pas
 * Konnect (lot E) : d'ici là, l'écran le dit franchement plutôt que de laisser
 * croire que tout réglage prend effet.
 */

const DOMAINE = "konnect.paires-examens";

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";

type Examen = { code: string; libelle: string };

/** Les modalités combinables, dans l'ordre où une secrétaire les cite. */
const MODALITES: { code: string; libelle: string; dansPhrase: string; deux: string }[] = [
  { code: "RX", libelle: "Radiographie", dansPhrase: "radiographie", deux: "Deux radiographies" },
  { code: "US", libelle: "Échographie", dansPhrase: "échographie", deux: "Deux échographies" },
  { code: "MG", libelle: "Mammographie", dansPhrase: "mammographie", deux: "Deux mammographies" },
  { code: "CT", libelle: "Scanner", dansPhrase: "scanner", deux: "Deux scanners" },
  { code: "MR", libelle: "IRM", dansPhrase: "IRM", deux: "Deux IRM" },
];

const ECART_DEFAUT = 30;
const ECART_PLAFOND = 240;

type Combinaison = { modalite_a: string; modalite_b: string; ecart_max_minutes: number };

/** La clé d'une combinaison, indépendante de l'ordre : « CT|MR ». */
function cleCombinaison(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Les quinze couples possibles, même modalité comprise, dans l'ordre d'affichage. */
const COUPLES: { a: (typeof MODALITES)[number]; b: (typeof MODALITES)[number] }[] =
  MODALITES.flatMap((a, i) => MODALITES.slice(i).map((b) => ({ a, b })));

function libelleCouple(a: (typeof MODALITES)[number], b: (typeof MODALITES)[number]): string {
  return a.code === b.code ? a.deux : `${a.libelle} et ${b.dansPhrase}`;
}

type Paire = {
  code_a: string;
  code_b: string;
  ecart_min_minutes: number;
  ecart_ideal_minutes: number;
  ecart_max_minutes: number;
  ordre_impose: "aucun" | "a_puis_b" | "b_puis_a";
  strategie_radiologue:
    | "indifferent"
    | "meme_radiologue_obligatoire"
    | "radiologues_differents_autorises"
    | "radiologues_differents_imposes";
  actif: boolean;
};

/** Les défauts de `combo_examen`, repris tels quels : une paire ajoutée ici se
 *  comporte comme avant d'être réglée, tant que rien n'est touché. */
const PAIRE_VIDE: Paire = {
  code_a: "",
  code_b: "",
  ecart_min_minutes: 10,
  ecart_ideal_minutes: 25,
  ecart_max_minutes: 75,
  ordre_impose: "aucun",
  strategie_radiologue: "indifferent",
  actif: true,
};

const STRATEGIES: { valeur: Paire["strategie_radiologue"]; libelle: string }[] = [
  { valeur: "indifferent", libelle: "Peu importe" },
  { valeur: "meme_radiologue_obligatoire", libelle: "Le même radiologue pour les deux" },
  { valeur: "radiologues_differents_autorises", libelle: "Deux radiologues, si besoin" },
  { valeur: "radiologues_differents_imposes", libelle: "Deux radiologues, obligatoirement" },
];

function Minutes({
  label,
  valeur,
  erreur,
  onChange,
}: {
  label: string;
  valeur: number;
  erreur?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <TextField
      size="small"
      type="number"
      label={label}
      value={valeur}
      error={erreur}
      onChange={(e) => onChange(Math.max(0, Math.min(480, Number(e.target.value) || 0)))}
      inputProps={{ min: 0, max: 480, step: 5 }}
      sx={{ width: 150 }}
    />
  );
}

export default function PairesExamensKonnect() {
  // Lecture seule : l'ecran doit le DIRE, pas laisser decouvrir le refus
  // apres la saisie. La garde serveur reste seule responsable du refus reel.
  const { raisonLectureSeule } = useDroitPage(PAGES.KONNECT_PAIRES);
  const { userProductId } = useCentreProduit();

  const [paires, setPaires] = useState<Paire[]>([]);
  const [initial, setInitial] = useState<Paire[]>([]);
  // Combinaisons cochées, par clé rangée. Absente = non autorisée.
  const [combinaisons, setCombinaisons] = useState<Record<string, number>>({});
  const [combinaisonsInitiales, setCombinaisonsInitiales] = useState<Record<string, number>>({});
  // Les autres clés de la valeur du domaine, renvoyées telles quelles à l'enregistrement.
  const [autresCles, setAutresCles] = useState<Record<string, unknown>>({});
  const [examens, setExamens] = useState<Examen[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const [rDomaine, rExamens] = await Promise.all([
          fetch(`/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`),
          fetch(`/api/konnect-examens?userProductId=${userProductId}`),
        ]);
        if (!rDomaine.ok) throw new Error("Chargement impossible.");
        const d = await rDomaine.json();
        if (annule) return;

        const brutes = Array.isArray(d?.valeur?.items) ? d.valeur.items : [];
        const chargees: Paire[] = brutes
          .filter((p: any) => p?.code_a && p?.code_b)
          .map((p: any) => ({
            ...PAIRE_VIDE,
            ...p,
            code_a: String(p.code_a),
            code_b: String(p.code_b),
          }));
        setPaires(chargees);
        setInitial(chargees);

        const valeur = d?.valeur && typeof d.valeur === "object" ? d.valeur : {};
        const { items: _items, combinaisons: brutesCombi, ...reste } = valeur;
        setAutresCles(reste);
        const cochees: Record<string, number> = {};
        (Array.isArray(brutesCombi) ? brutesCombi : []).forEach((c: any) => {
          if (typeof c?.modalite_a !== "string" || typeof c?.modalite_b !== "string") return;
          const ecart = Number(c.ecart_max_minutes);
          cochees[cleCombinaison(c.modalite_a, c.modalite_b)] =
            Number.isFinite(ecart) && ecart >= 0 && ecart <= ECART_PLAFOND ? ecart : ECART_DEFAUT;
        });
        setCombinaisons(cochees);
        setCombinaisonsInitiales(cochees);

        if (rExamens.ok) {
          const dEx = await rExamens.json();
          const brut: any[] = Array.isArray(dEx.examens) ? dEx.examens : [];
          setExamens(
            brut
              .filter((e) => e?.performed !== false && String(e?.codeExamen ?? "").trim())
              .map((e) => ({
                code: String(e.codeExamen).trim(),
                libelle:
                  String(e.libelleClient ?? "").trim() ||
                  String(e.libelle ?? "").trim() ||
                  String(e.codeExamen).trim(),
              }))
          );
        }

      } catch {
        if (!annule) setErreur("Impossible de charger les paires d'examens.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const libelleExamen = useMemo(() => {
    const m = new Map(examens.map((e) => [e.code, e.libelle]));
    return (code: string) => m.get(code) ?? code;
  }, [examens]);

  const etatSuivi = useMemo(() => {
    const out: Record<string, unknown> = {};
    paires.forEach((p, i) => {
      out[`paire:${i}`] = p;
    });
    COUPLES.forEach(({ a, b }) => {
      const cle = cleCombinaison(a.code, b.code);
      out[`combinaison:${cle}`] = combinaisons[cle] ?? null;
    });
    return out;
  }, [paires, combinaisons]);

  const basculerCombinaison = (cle: string, cochee: boolean) =>
    setCombinaisons((prec) => {
      const suivant = { ...prec };
      if (cochee) suivant[cle] = prec[cle] ?? ECART_DEFAUT;
      else delete suivant[cle];
      return suivant;
    });

  const { modifications, marquerEnregistre } = useSuiviModifications(etatSuivi, !chargement);

  const maj = <K extends keyof Paire>(index: number, champ: K, valeur: Paire[K]) =>
    setPaires((prec) => prec.map((p, i) => (i === index ? { ...p, [champ]: valeur } : p)));

  // La même paire réglée deux fois, ce sont deux configurations concurrentes pour
  // un seul couple : Konnect n'en garderait qu'une, sans dire laquelle.
  const doublons = useMemo(() => {
    const vus = new Map<string, number>();
    const enDouble = new Set<number>();
    paires.forEach((p, i) => {
      if (!p.code_a || !p.code_b) return;
      const cle = [p.code_a, p.code_b].sort().join("|");
      const premier = vus.get(cle);
      if (premier !== undefined) {
        enDouble.add(premier);
        enDouble.add(i);
      } else vus.set(cle, i);
    });
    return enDouble;
  }, [paires]);

  const probleme = useMemo(() => {
    if (doublons.size > 0) return "La même paire est réglée deux fois. Gardez-en une.";
    const i = paires.findIndex((p) => !p.code_a || !p.code_b);
    if (i >= 0) return `La paire ${i + 1} doit désigner deux examens.`;
    const j = paires.findIndex((p) => p.code_a === p.code_b);
    if (j >= 0) return `La paire ${j + 1} désigne deux fois le même examen.`;
    const k = paires.findIndex((p) => p.ecart_min_minutes > p.ecart_max_minutes);
    if (k >= 0) return `Paire ${k + 1} : le minimum dépasse le maximum.`;
    return null;
  }, [paires, doublons]);

  async function enregistrer() {
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valeur: {
              ...autresCles,
              items: paires,
              combinaisons: Object.entries(combinaisons).map(([cle, ecart]) => {
                const [modalite_a, modalite_b] = cle.split("|");
                return { modalite_a, modalite_b, ecart_max_minutes: ecart };
              }),
            },
          }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setInitial(paires);
      setCombinaisonsInitiales(combinaisons);
      marquerEnregistre();
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <PageContainer title="Examens qui vont ensemble" description="Deux examens, une visite">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Examens qui vont ensemble" description="Deux examens, une visite">
      <Box>
        <SectionHeader
          title="Examens qui vont ensemble"
          subtitle="Deux examens à faire dans la même visite, et le temps à laisser entre les deux"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5, maxWidth: 760 }}>
          Cochez les examens qu&apos;un patient peut réserver ensemble sur le portail. Il
          prend alors ses deux rendez-vous le même jour, dans le même centre, avec au plus
          l&apos;attente que vous fixez entre la fin du premier et le début du second.
          Pour une combinaison non cochée, ou pour trois examens ou plus, le patient laisse
          son numéro et la demande arrive dans vos demandes de rappel.
        </Typography>

        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 3 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: INK, mb: 1.5 }}>
            Réservables ensemble en ligne
          </Typography>
          <Stack spacing={0.5}>
            {COUPLES.map(({ a, b }) => {
              const cle = cleCombinaison(a.code, b.code);
              const cochee = cle in combinaisons;
              return (
                <Stack
                  key={cle}
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ minHeight: 44 }}
                >
                  <Checkbox
                    size="small"
                    checked={cochee}
                    onChange={(e) => basculerCombinaison(cle, e.target.checked)}
                    inputProps={{ "aria-label": libelleCouple(a, b) }}
                  />
                  <Typography sx={{ fontSize: 13.5, color: INK, flex: 1, minWidth: 180 }}>
                    {libelleCouple(a, b)}
                  </Typography>
                  {cochee && (
                    <TextField
                      size="small"
                      type="number"
                      label="Attente au plus (min)"
                      value={combinaisons[cle]}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(ECART_PLAFOND, Number(e.target.value) || 0));
                        setCombinaisons((prec) => ({ ...prec, [cle]: v }));
                      }}
                      inputProps={{ min: 0, max: ECART_PLAFOND, step: 5 }}
                      sx={{ width: 170 }}
                    />
                  )}
                </Stack>
              );
            })}
          </Stack>
          <Typography sx={{ fontSize: 12, color: INK_MUTED, mt: 1.5 }}>
            Deux examens avec injection, comme deux scanners injectés, passent toujours par
            le rappel : le portail ne sait pas encore espacer deux injections.
          </Typography>
        </Paper>

        <Typography sx={{ fontSize: 14, fontWeight: 600, color: INK, mb: 1 }}>
          Réglages par paire d&apos;examens
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Ces réglages sont enregistrés, mais le portail ne les applique pas encore à la
          réservation en ligne. C&apos;est l&apos;attente maximale de la combinaison cochée
          ci-dessus qui compte.
        </Alert>

        {examens.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Aucun examen dans votre mapping. Complétez le mapping d&apos;examens
            d&apos;abord : c&apos;est là que se choisissent les examens à apparier.
          </Alert>
        )}

        {paires.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{ borderColor: BORDER, borderRadius: 2, p: 3, textAlign: "center" }}
          >
            <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
              Aucune paire réglée.
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={2}>
            {paires.map((p, i) => (
              <Paper
                key={i}
                variant="outlined"
                sx={{
                  borderColor: doublons.has(i) ? "#E1573B" : BORDER,
                  borderRadius: 2,
                  p: 2,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <Chip
                    label={`Paire ${i + 1}`}
                    size="small"
                    sx={{ height: 22, fontSize: 11.5 }}
                  />
                  <Box sx={{ flexGrow: 1 }} />
                  <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                    {p.actif ? "Appliquée" : "En pause"}
                  </Typography>
                  <Switch
                    size="small"
                    checked={p.actif}
                    onChange={(e) => maj(i, "actif", e.target.checked)}
                  />
                  <IconButton
                    size="small"
                    aria-label={`Supprimer la paire ${i + 1}`}
                    onClick={() => setPaires((prec) => prec.filter((_, j) => j !== i))}
                  >
                    <IconTrash size={17} />
                  </IconButton>
                </Stack>

                <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
                  <Select
                    size="small"
                    fullWidth
                    displayEmpty
                    value={p.code_a}
                    error={!p.code_a}
                    onChange={(e) => maj(i, "code_a", e.target.value)}
                    sx={{ fontSize: 13, bgcolor: SURFACE }}
                  >
                    <MenuItem value="" disabled>
                      Premier examen
                    </MenuItem>
                    {examens.map((e) => (
                      <MenuItem key={e.code} value={e.code}>
                        {e.libelle}
                      </MenuItem>
                    ))}
                  </Select>
                  <Select
                    size="small"
                    fullWidth
                    displayEmpty
                    value={p.code_b}
                    error={!p.code_b || p.code_a === p.code_b}
                    onChange={(e) => maj(i, "code_b", e.target.value)}
                    sx={{ fontSize: 13, bgcolor: SURFACE }}
                  >
                    <MenuItem value="" disabled>
                      Second examen
                    </MenuItem>
                    {examens.map((e) => (
                      <MenuItem key={e.code} value={e.code}>
                        {e.libelle}
                      </MenuItem>
                    ))}
                  </Select>
                </Stack>

                <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mb: 0.75 }}>
                  Temps entre la fin du premier et le début du second
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                  <Minutes
                    label="Au moins (min)"
                    valeur={p.ecart_min_minutes}
                    erreur={p.ecart_min_minutes > p.ecart_max_minutes}
                    onChange={(v) => maj(i, "ecart_min_minutes", v)}
                  />
                  <Minutes
                    label="Idéalement (min)"
                    valeur={p.ecart_ideal_minutes}
                    onChange={(v) => maj(i, "ecart_ideal_minutes", v)}
                  />
                  <Minutes
                    label="Au plus (min)"
                    valeur={p.ecart_max_minutes}
                    erreur={p.ecart_min_minutes > p.ecart_max_minutes}
                    onChange={(v) => maj(i, "ecart_max_minutes", v)}
                  />
                </Stack>

                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mb: 0.75 }}>
                      Ordre de passage
                    </Typography>
                    <Select
                      size="small"
                      fullWidth
                      value={p.ordre_impose}
                      onChange={(e) =>
                        maj(i, "ordre_impose", e.target.value as Paire["ordre_impose"])
                      }
                      sx={{ fontSize: 13, bgcolor: SURFACE }}
                    >
                      <MenuItem value="aucun">Peu importe</MenuItem>
                      <MenuItem value="a_puis_b" disabled={!p.code_a}>
                        {p.code_a ? `${libelleExamen(p.code_a)} d'abord` : "Le premier d'abord"}
                      </MenuItem>
                      <MenuItem value="b_puis_a" disabled={!p.code_b}>
                        {p.code_b ? `${libelleExamen(p.code_b)} d'abord` : "Le second d'abord"}
                      </MenuItem>
                    </Select>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mb: 0.75 }}>
                      Radiologue
                    </Typography>
                    <Select
                      size="small"
                      fullWidth
                      value={p.strategie_radiologue}
                      onChange={(e) =>
                        maj(
                          i,
                          "strategie_radiologue",
                          e.target.value as Paire["strategie_radiologue"]
                        )
                      }
                      sx={{ fontSize: 13, bgcolor: SURFACE }}
                    >
                      {STRATEGIES.map((s) => (
                        <MenuItem key={s.valeur} value={s.valeur}>
                          {s.libelle}
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}

        <Button
          size="small"
          startIcon={<IconPlus size={16} />}
          disabled={examens.length === 0}
          onClick={() => setPaires((prec) => [...prec, { ...PAIRE_VIDE }])}
          sx={{ textTransform: "none", mt: 2 }}
        >
          Ajouter une paire
        </Button>

        <Box sx={{ mt: 3, p: 2, bgcolor: "#F7FAFB", borderRadius: 2 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: INK, mb: 0.5 }}>
            Bon à savoir
          </Typography>
          <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
            Les deux rendez-vous sont toujours posés sur le même site : un patient qui
            enchaîne deux examens ne change pas d&apos;adresse entre les deux. La réservation
            de deux examens en ligne se fait quand le patient choisit ses examens dans le
            portail. S&apos;il envoie une ordonnance qui en porte plusieurs, le centre le
            rappelle.
          </Typography>
        </Box>

        {probleme && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {probleme}
          </Alert>
        )}

        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <BarreEnregistrement
          modifications={modifications}
          enregistrement={enregistrement}
          onEnregistrer={enregistrer}
          blocage={raisonLectureSeule}
          onAnnuler={() => {
            setPaires(initial);
            setCombinaisons(combinaisonsInitiales);
          }}
          libelle="Enregistrer"
        />

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Réglages enregistrés. Le portail patient les reprend à sa prochaine
            synchronisation.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
