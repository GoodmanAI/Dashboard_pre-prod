"use client";

import Retour from "@/components/shared/Retour";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
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
 * Mots propres au cabinet (lot B, `cabinet_synonyme`).
 *
 * Un même examen a plusieurs noms : le médecin écrit un terme savant, le patient en
 * connaît un autre, le cabinet en emploie un troisième. Quand le patient tape un mot
 * que le moteur ne connaît pas, il ne conclut pas que le moteur est limité : il
 * conclut que le centre ne fait pas cet examen, et il s'en va.
 *
 * CE QUE `cible` EST. Konnect en prend les mots et cherche avec eux à la place de ce
 * que le patient a tapé : c'est une réécriture de recherche.
 *
 * LA CIBLE SE CHOISIT, ELLE NE SE TAPE PLUS (17/09/2026). Elle se saisissait à la main,
 * et rien ne disait qu'elle ne menait nulle part. C'est ce qui est arrivé au premier
 * mot réglé sur la démonstration : « scanner cardiaque sans injection » visait
 * « score calcique », un examen présent au catalogue mais sans code RIS, donc jamais
 * proposé au patient. La règle était juste et ne produisait rien.
 *
 * On choisit donc l'examen dans une liste, avec recherche, qui ne contient QUE les
 * examens pratiqués ET munis d'un code : une cible qui ne mène à rien ne peut plus se
 * créer. On enregistre son libellé NEURACORP comme `cible` (c'est ce que Konnect sait
 * rapprocher de son référentiel) et son code comme `code`, que Konnect ignore mais qui
 * permet de revérifier la cible plus tard. Les mots saisis avant ce changement restent
 * tels quels, et sont signalés s'ils ne désignent aucun examen proposé.
 *
 * Le cabinet est prioritaire sur le référentiel : un terme réglé ici l'emporte sur
 * le synonyme national de même nom (`_charger_synonymes`, cabinet écrase pivot).
 *
 * Le transport existait déjà des deux côtés du pont (`konnect.synonymes`,
 * `DOMAINES_TABLES`) : cet écran est la seule pièce qui manquait.
 */

const DOMAINE = "konnect.synonymes";

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";

/** Miroir de `_normaliser_synonyme` : au-delà, Konnect tronque en silence. */
const MAX_TERME = 200;
const MAX_CIBLE = 200;

type Mot = { terme: string; cible: string; code?: string };

/** Un examen du catalogue, tel que la route le rend à l'écran. */
type ExamenCatalogue = {
  codeExamen: string;
  typeExamen: string | null;
  libelle: string | null;
  libelleClient: string;
  codeExamenClient: string;
  performed: boolean;
};

/** Minuscules, sans accents ni ligatures, ponctuation ramenée à des espaces. */
function normaliser(texte: string): string {
  return texte
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * L'examen que désigne un mot, parmi ceux qui ont un code. `null` = il ne mène à rien.
 *
 * Un mot enregistré depuis ce sélecteur porte son `code` : on le retrouve par là, et
 * s'il a perdu son code entre-temps, il ne mène plus à rien. Un mot saisi à la main
 * avant le 17/09/2026 n'a qu'un texte : on le rapproche comme Konnect le fait, chaque
 * mot de la cible devant figurer dans le libellé. S'il en désigne plusieurs, on ne
 * choisit pas à sa place : il est signalé.
 */
function examenDuMot(mot: Mot, examens: ExamenCatalogue[]): ExamenCatalogue | null {
  if (mot.code) return examens.find((e) => e.codeExamen === mot.code) ?? null;
  const cible = normaliser(mot.cible);
  if (!cible) return null;
  const exact = examens.find((e) => normaliser(e.libelle ?? "") === cible);
  if (exact) return exact;
  const motsCible = cible.split(" ");
  const candidats = examens.filter((e) => {
    const motsLibelle = new Set(normaliser(e.libelle ?? "").split(" "));
    return motsCible.every((m) => motsLibelle.has(m));
  });
  return candidats.length === 1 ? candidats[0] : null;
}

/** Une ligne vide est le geste d'ajout : on ne l'enregistre jamais telle quelle. */
const LIGNE_VIDE: Mot = { terme: "", cible: "" };

export default function MotsCabinetKonnect() {

  // Lecture seule : l'ecran doit le DIRE, pas laisser decouvrir le refus
  // apres la saisie. La garde serveur reste seule responsable du refus reel.
  const { raisonLectureSeule } = useDroitPage(PAGES.KONNECT_MOTS);
  const { userProductId } = useCentreProduit();

  const [mots, setMots] = useState<Mot[]>([]);
  const [initial, setInitial] = useState<Mot[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  // `null` tant que non chargé ou en échec : l'écran retombe alors sur la saisie libre
  // plutôt que de se bloquer.
  const [examens, setExamens] = useState<ExamenCatalogue[] | null>(null);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch(`/api/konnect-examens?userProductId=${userProductId}`);
        if (!r.ok) throw new Error();
        const d = await r.json();
        const lignes: ExamenCatalogue[] = Array.isArray(d?.examens) ? d.examens : [];
        // SEULS les examens pratiqués ET munis d'un code sont proposables : ce sont les
        // seuls que le portail patient offre. C'est tout l'objet du sélecteur.
        const codes = lignes
          .filter((e) => e.performed && (e.codeExamenClient ?? "").trim() !== "")
          .sort((a, b) => (a.libelle ?? "").localeCompare(b.libelle ?? "", "fr"));
        if (!annule) setExamens(codes);
      } catch {
        if (!annule) setExamens(null);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`
        );
        if (!r.ok) throw new Error("Chargement impossible.");
        const d = await r.json();
        if (annule) return;
        const bruts = Array.isArray(d?.valeur?.items) ? d.valeur.items : [];
        const charges: Mot[] = bruts
          .map((i: any) => ({
            terme: typeof i?.terme === "string" ? i.terme : "",
            cible: typeof i?.cible === "string" ? i.cible : "",
            ...(typeof i?.code === "string" && i.code ? { code: i.code } : {}),
          }))
          .filter((m: Mot) => m.terme.trim() !== "");
        setMots(charges);
        setInitial(charges);
      } catch {
        if (!annule) setErreur("Impossible de charger les mots du cabinet.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  // Une entrée par ligne, indexée par position : c'est la convention des autres
  // écrans de liste (`regles-fusion`). Le hook attend un dictionnaire, pas un
  // tableau.
  const etatSuivi = useMemo(() => {
    const out: Record<string, unknown> = {};
    mots.forEach((m, i) => {
      out[`mot:${i}`] = m;
    });
    return out;
  }, [mots]);

  const { modifications, marquerEnregistre } = useSuiviModifications(etatSuivi, !chargement);

  // Deux fois le même terme, ce sont deux réécritures concurrentes pour la même
  // recherche : Konnect en garderait une, sans dire laquelle.
  const doublons = useMemo(() => {
    const vus = new Map<string, number>();
    const en_double = new Set<number>();
    mots.forEach((m, i) => {
      const cle = m.terme.trim().toLowerCase();
      if (cle === "") return;
      const premier = vus.get(cle);
      if (premier !== undefined) {
        en_double.add(premier);
        en_double.add(i);
      } else {
        vus.set(cle, i);
      }
    });
    return en_double;
  }, [mots]);

  const incompletes = useMemo(
    () =>
      mots.some(
        (m) =>
          (m.terme.trim() === "") !== (m.cible.trim() === "") // l'un rempli, l'autre non
      ),
    [mots]
  );

  // Les mots remplis qui ne désignent aucun examen proposé au patient. Calculé seulement
  // quand le catalogue est là : sans lui, on ne peut rien affirmer.
  const sansCible = useMemo(() => {
    if (examens === null) return new Set<number>();
    const out = new Set<number>();
    mots.forEach((m, i) => {
      if (m.terme.trim() !== "" && examenDuMot(m, examens) === null) out.add(i);
    });
    return out;
  }, [mots, examens]);

  const majLigne = (index: number, champ: keyof Mot, valeur: string) =>
    setMots((prec) => prec.map((m, i) => (i === index ? { ...m, [champ]: valeur } : m)));

  const choisirExamen = (index: number, examen: ExamenCatalogue | null) =>
    setMots((prec) =>
      prec.map((m, i) =>
        i !== index
          ? m
          : examen
            ? { ...m, cible: examen.libelle ?? examen.codeExamen, code: examen.codeExamen }
            : { terme: m.terme, cible: "" }
      )
    );

  const supprimer = (index: number) =>
    setMots((prec) => prec.filter((_, i) => i !== index));

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      // Les lignes entièrement vides partent sans bruit : c'est un ajout que
      // l'utilisateur n'a pas rempli, pas une erreur à lui signaler.
      const aEnvoyer: Mot[] = mots
        .map((m) => ({
          terme: m.terme.trim(),
          cible: m.cible.trim(),
          ...(m.code ? { code: m.code } : {}),
        }))
        .filter((m) => m.terme !== "" && m.cible !== "");

      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: { items: aEnvoyer } }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setMots(aEnvoyer);
      setInitial(aEnvoyer);
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
      <PageContainer title="Mots du cabinet" description="Les mots que vos patients emploient">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Mots du cabinet" description="Les mots que vos patients emploient">
      <Box>
        <SectionHeader
          title="Mots du cabinet"
          subtitle="Ce que vos patients tapent, et ce qu'il faut chercher à la place"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5, maxWidth: 720 }}>
          Quand un patient cherche un examen avec un mot que le portail ne connaît pas,
          il n&apos;obtient aucun résultat et pense que vous ne faites pas cet examen.
          Ajoutez ici les mots qu&apos;on emploie chez vous, avec ce qu&apos;il faut
          chercher à leur place. Ce que vous mettez ici passe avant le vocabulaire
          général du portail.
        </Typography>

        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2 }}>
          {mots.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: INK_MUTED, py: 2, textAlign: "center" }}>
              Aucun mot pour l&apos;instant. Le portail utilise son vocabulaire général.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={2} sx={{ px: 0.5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: INK, flex: 1 }}>
                  Le mot tapé par le patient
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: INK, flex: 1 }}>
                  Ce qu&apos;il faut chercher à la place
                </Typography>
                <Box sx={{ width: 40 }} />
              </Stack>

              {mots.map((m, i) => (
                <Stack key={i} direction="row" spacing={2} alignItems="flex-start">
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="arthro genou"
                    value={m.terme}
                    error={doublons.has(i)}
                    helperText={doublons.has(i) ? "Ce mot est déjà dans la liste." : " "}
                    inputProps={{ maxLength: MAX_TERME }}
                    onChange={(e) => majLigne(i, "terme", e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  {examens === null ? (
                    // Repli : le catalogue n'a pas pu être lu. On garde la saisie libre
                    // plutôt que de bloquer l'écran.
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="arthroscanner genou"
                      value={m.cible}
                      error={m.terme.trim() !== "" && m.cible.trim() === ""}
                      helperText={
                        m.terme.trim() !== "" && m.cible.trim() === ""
                          ? "Sans ça, la recherche ne mène nulle part."
                          : " "
                      }
                      inputProps={{ maxLength: MAX_CIBLE }}
                      onChange={(e) => majLigne(i, "cible", e.target.value)}
                      sx={{ flex: 1 }}
                    />
                  ) : (
                    <Autocomplete
                      size="small"
                      fullWidth
                      sx={{ flex: 1 }}
                      options={examens}
                      value={examenDuMot(m, examens)}
                      onChange={(_, examen) => choisirExamen(i, examen)}
                      getOptionLabel={(e) => e.libelle ?? e.codeExamen}
                      isOptionEqualToValue={(a, b) => a.codeExamen === b.codeExamen}
                      noOptionsText="Aucun examen avec un code ne correspond."
                      renderOption={(props, e) => (
                        <li {...props} key={e.codeExamen}>
                          <Box>
                            <Typography sx={{ fontSize: 13.5 }}>
                              {e.libelle ?? e.codeExamen}
                            </Typography>
                            <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>
                              {e.typeExamen ? `${e.typeExamen} · ` : ""}code{" "}
                              {e.codeExamenClient}
                            </Typography>
                          </Box>
                        </li>
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder="Chercher l'examen visé"
                          error={sansCible.has(i)}
                          helperText={
                            sansCible.has(i)
                              ? m.cible.trim()
                                ? `« ${m.cible} » ne correspond à aucun examen proposé. Choisissez-le dans la liste.`
                                : "Choisissez l'examen visé."
                              : " "
                          }
                        />
                      )}
                    />
                  )}
                  <IconButton
                    size="small"
                    onClick={() => supprimer(i)}
                    aria-label={`Supprimer le mot ${m.terme || "vide"}`}
                    sx={{ mt: 0.5 }}
                  >
                    <IconTrash size={17} />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          )}

          <Button
            size="small"
            startIcon={<IconPlus size={16} />}
            onClick={() => setMots((prec) => [...prec, { ...LIGNE_VIDE }])}
            sx={{ textTransform: "none", mt: mots.length === 0 ? 0 : 1 }}
          >
            Ajouter un mot
          </Button>
        </Paper>

        {examens !== null && examens.length === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Aucun de vos examens n&apos;a encore de code. Renseignez-les d&apos;abord dans
            l&apos;écran Examens : seuls les examens avec un code peuvent être visés ici.
          </Alert>
        )}

        {sansCible.size > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {sansCible.size === 1
              ? "Un mot ne mène à aucun examen proposé au patient."
              : `${sansCible.size} mots ne mènent à aucun examen proposé au patient.`}{" "}
            Tant que ce n&apos;est pas corrigé, le patient qui les tape ne trouve rien.
            Choisissez l&apos;examen visé dans la liste.
          </Alert>
        )}

        {doublons.size > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Deux lignes portent le même mot. Gardez-en une : sinon le portail en
            choisit une, et vous ne saurez pas laquelle.
          </Alert>
        )}

        {incompletes && doublons.size === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Une ligne n&apos;est remplie qu&apos;à moitié. Elle ne sera pas enregistrée.
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
          onAnnuler={() => setMots(initial)}
          libelle="Enregistrer les mots"
        />

        <Retour
          ouvert={succes}
          message={<>Mots enregistrés. Le portail patient les appliquera dans la minute.</>}
          gravite={"success"}
          onFermer={() => setSucces(false)}
        />
      </Box>
    </PageContainer>
  );
}
