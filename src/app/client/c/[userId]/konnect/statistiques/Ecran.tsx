"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Grid,
  Paper,
  Popover,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  Description as IconDemandes,
  EventAvailable as IconRdv,
  ExpandMore as IconDeplier,
  FactCheck as IconQuestionnaires,
  HourglassBottom as IconDelai,
  MarkEmailRead as IconConfirmations,
  NightsStay as IconHorsHeures,
  PendingActions as IconRappels,
  PersonAdd as IconNouveaux,
  PhoneDisabled as IconAppels,
  SupportAgent as IconSecretariat,
  TaskAlt as IconReservees,
  Timer as IconTemps,
} from "@mui/icons-material";
import { IconDownload } from "@tabler/icons-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  endOfDay,
  format,
  startOfDay,
  startOfISOWeek,
  subDays,
} from "date-fns";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import DateRangePresets from "@/components/DateRangePresets";
import {
  ChartSkeleton,
  StatTile,
  StatTileSkeleton,
} from "@/components/shared/stats/StatTile";
import { Heatmap } from "@/components/shared/stats/Heatmap";
import TuileChiffre from "@/components/shared/TuileChiffre";
import { EXAM_TYPE_LABELS } from "@/components/shared/ExamTypeBadge";
import { computeDelta, computePreviousRange } from "@/lib/deltaCompare";
import { downloadCsv, isoDateForFilename, rowsToCsv } from "@/lib/csvExport";
import { useFiltresRecherche } from "@/lib/recherche/integre";
import { plageDePeriode } from "@/lib/recherche/periode";
import { useRechargement, styleRechargement } from "@/hooks/useRechargement";
import BarreRechargement from "@/components/shared/stats/BarreRechargement";
import { INK, INK_MUTED, BORDER, PERDU } from "@/lib/jetons";
import {
  JOURS_COURTS,
  MINUTES_PAR_APPEL_EVITE,
  MOTIFS_SECRETARIAT,
  TRANCHES_DELAI,
  TRANCHES_DUREE,
  dureeLisible,
  horsHeures,
  parPrefixe,
  sommer,
  trancheMediane,
  type LigneJour,
} from "@/lib/konnectStatistiques";

/**
 * Statistiques du portail Konnect (refonte du 14/11/2026, plan workspace
 * `2026-11-statistiques-konnect.md`, lot 2).
 *
 * SUR LE MODÈLE DE TALK : les grands chiffres d'abord, avec leur évolution par rapport à
 * la période précédente, puis les graphiques. Le funnel, qui ouvrait l'écran depuis le
 * lot F, descend tout en bas et se replie : c'est surtout notre outil, le centre veut
 * d'abord savoir ce que le portail lui rapporte.
 *
 * LA DONNÉE : des comptes par jour que Konnect remonte chaque nuit (`KonnectStatJour`,
 * C-STAT.1 et C-STAT.2), plus ce que le Dashboard sait déjà (demandes de rappel, file
 * d'attente). Tout arrive par `/api/konnect-statistiques`, en une lecture.
 *
 * HORS DES HEURES D'OUVERTURE : Konnect remonte l'heure de chaque réservation ; l'écran y
 * applique les horaires de LyraeTalk du centre s'il en a, sinon du lundi au vendredi de
 * 8 h à 18 h (décision d'Enzo du 14/11/2026).
 */

type Examen = {
  code: string;
  cle: string;
  libelle: string;
  type: string | null;
};
type Site = { siteId: string; cle: string; libelle: string };
type Etape = { libelle: string; atteint: number; taux: number; perdus: number };
type Funnel = {
  fenetre_jours: number;
  demandes: number;
  conversion_globale: number;
  abandons: number;
  sorties_humaines: number;
  rappels_non_transmis?: number;
  etapes: Etape[];
};
type Donnees = {
  lignes: LigneJour[];
  horaires: { source: "talk" | "defaut"; ouvert: boolean[][] };
  examens: Examen[];
  sites: Site[];
  rappels: {
    recues: number;
    rappelees: number;
    sansSuite: number;
    delaiMedianHeures: number | null;
    enAttente: number;
    recuesAvant: number | null;
  };
  file: {
    inscrits: number;
    propositions: number;
    prises: number;
    enFile: number;
  };
  funnel: Funnel | null;
  recuAt: string | null;
};

const COULEURS = {
  demandes: "#94A3B8",
  rdv: "#2FB9A6",
  secretariat: "#D2A237",
  horsHeures: "#6237D2",
};
const COULEURS_TYPES = [
  "#1976D2",
  "#2FB9A6",
  "#D25A37",
  "#6237D2",
  "#D237C2",
  "#9AD237",
  "#838383",
];
const COULEURS_DELAI = ["#2FB9A6", "#7CCFB3", "#D2A237", "#E07B53", "#B91C1C"];

/** Sur téléphone, le taux se masque : trois colonnes de chiffres écrasaient le nom de
 *  l'examen (vu à 390 px le 14/11/2026). */
const COLONNES_EXAMENS = {
  xs: "minmax(0, 1fr) 64px 64px",
  sm: "minmax(0, 1fr) 84px 84px 64px",
};
const jourIso = (d: Date) => format(d, "yyyy-MM-dd");
const pct = (n: number, sur: number) =>
  sur > 0 ? Math.round((n / sur) * 100) : 0;
const ou = (t: Record<string, number>, c: string) => t[c] ?? 0;

/** Une barre horizontale avec son libellé et sa valeur, pour les listes courtes. */
function Barre({
  libelle,
  valeur,
  max,
  detail,
}: {
  libelle: string;
  valeur: number;
  max: number;
  detail?: string;
}) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
        <Typography
          sx={{ fontSize: 13, color: INK, flex: 1, minWidth: 0 }}
          noWrap
        >
          {libelle}
        </Typography>
        {detail && (
          <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
            {detail}
          </Typography>
        )}
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 700,
            color: INK,
            minWidth: 28,
            textAlign: "right",
          }}
        >
          {valeur}
        </Typography>
      </Stack>
      <Box
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: "rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            width: `${max > 0 ? Math.max(2, (valeur / max) * 100) : 0}%`,
            height: "100%",
            bgcolor: "var(--accent)",
          }}
        />
      </Box>
    </Box>
  );
}

/** Une carte de graphique : titre, phrase d'aide, contenu (même gabarit que Talk). */
function Carte({
  id,
  titre,
  aide,
  children,
  action,
}: {
  id: string;
  titre: string;
  aide: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Paper
      id={id}
      sx={{ p: 2, height: "100%", minWidth: 0, scrollMarginTop: 96 }}
    >
      <Box sx={{ mb: 1.5, minWidth: 0 }}>
        <Typography variant="h6" fontWeight={700}>
          {titre}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {aide}
        </Typography>
      </Box>
      {/* Sous le titre, sur toute la largeur : à côté, des onglets serrent l'aide et se
          coupent (vu à 1440 px le 14/11/2026). */}
      {action && (
        <Box sx={{ mb: 1.5, borderBottom: `1px solid ${BORDER}` }}>
          {action}
        </Box>
      )}
      {children}
    </Paper>
  );
}

function Vide({ texte }: { texte: string }) {
  return (
    <Box
      sx={{
        py: 5,
        display: "grid",
        placeItems: "center",
        border: "1px dashed #e5e7eb",
        borderRadius: 2,
        textAlign: "center",
        px: 2,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {texte}
      </Typography>
    </Box>
  );
}

export default function EcranStatistiquesKonnect({
  userProductId,
}: {
  userProductId: number | null;
}) {
  const filtresRecherche = useFiltresRecherche();

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const plage = plageDePeriode(filtresRecherche.periode);
    if (plage) return plage;
    const aujourdhui = new Date();
    return {
      from: startOfDay(subDays(aujourdhui, 29)),
      to: endOfDay(aujourdhui),
    };
  });
  const [brouillon, setBrouillon] = useState<DateRange>(dateRange);
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  const [typeExamen, setTypeExamen] = useState<string>(
    () => filtresRecherche.type ?? "tous",
  );
  const [toutVoir, setToutVoir] = useState(false);

  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [chargement, setChargement] = useState(true);
  const { premier: premierChargement, recharge } = useRechargement(chargement);
  const [erreur, setErreur] = useState<string | null>(null);

  const precedente = useMemo(
    () => computePreviousRange(dateRange.from, dateRange.to),
    [dateRange.from, dateRange.to],
  );
  const from = jourIso(dateRange.from);
  const to = jourIso(dateRange.to);
  const prevFrom = precedente ? jourIso(precedente.from) : null;
  const prevTo = precedente ? jourIso(precedente.to) : null;
  const libellePrecedente = precedente?.label ?? "";

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    const params = new URLSearchParams({
      userProductId: String(userProductId),
      from,
      to,
    });
    if (prevFrom && prevTo) {
      params.set("prevFrom", prevFrom);
      params.set("prevTo", prevTo);
    }
    setChargement(true);
    (async () => {
      try {
        const r = await fetch(`/api/konnect-statistiques?${params.toString()}`);
        if (!r.ok) throw new Error();
        const d = (await r.json()) as Donnees;
        if (!annule) {
          setDonnees(d);
          setErreur(null);
        }
      } catch {
        if (!annule)
          setErreur(
            "Les statistiques n'ont pas pu être chargées. Rechargez la page.",
          );
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId, from, to, prevFrom, prevTo]);

  const calcul = useMemo(() => {
    if (!donnees) return null;
    const { lignes, horaires } = donnees;
    const cur = sommer(lignes, from, to);
    const prev = prevFrom && prevTo ? sommer(lignes, prevFrom, prevTo) : null;
    const hh = horsHeures(lignes, from, to, horaires.ouvert);
    const hhPrev =
      prevFrom && prevTo
        ? horsHeures(lignes, prevFrom, prevTo, horaires.ouvert)
        : null;

    // Évolution : un point par jour jusqu'à 45 jours, par semaine au-delà.
    const nbJours =
      Math.round(
        (dateRange.to.getTime() - dateRange.from.getTime()) / 86_400_000,
      ) + 1;
    const parSemaine = nbJours > 45;
    const points = new Map<
      string,
      { demandes: number; rdv: number; secretariat: number }
    >();
    for (
      let d = new Date(dateRange.from);
      d <= dateRange.to;
      d = new Date(d.getTime() + 86_400_000)
    ) {
      const cle = parSemaine ? jourIso(startOfISOWeek(d)) : jourIso(d);
      if (!points.has(cle))
        points.set(cle, { demandes: 0, rdv: 0, secretariat: 0 });
    }
    for (const l of lignes) {
      if (l.jour < from || l.jour > to) continue;
      const [a, m, j] = l.jour.split("-").map(Number);
      const cle = parSemaine
        ? jourIso(startOfISOWeek(new Date(a, m - 1, j)))
        : l.jour;
      const p = points.get(cle);
      if (!p) continue;
      if (l.cle === "demandes_deposees") p.demandes += l.valeur;
      else if (l.cle === "rdv_crees") p.rdv += l.valeur;
      else if (l.cle === "sorties_secretariat") p.secretariat += l.valeur;
    }
    const evolution = [...points.entries()].map(([cle, v]) => {
      const [a, m, j] = cle.split("-").map(Number);
      const date = new Date(a, m - 1, j);
      return {
        libelle: parSemaine
          ? `Sem. du ${format(date, "dd/MM")}`
          : format(date, "dd/MM"),
        ...v,
      };
    });

    const parHeure = Array.from({ length: 24 }, (_, h) => {
      const hh2 = String(h).padStart(2, "0");
      return {
        heure: `${hh2}h`,
        demandes: ou(cur, `demande_heure.${hh2}`),
        rdv: ou(cur, `rdv_heure.${hh2}`),
      };
    });

    return { cur, prev, hh, hhPrev, evolution, parSemaine, parHeure };
  }, [donnees, from, to, prevFrom, prevTo, dateRange.from, dateRange.to]);

  // Examens demandés et réservés, par code du centre.
  const examens = useMemo(() => {
    if (!donnees || !calcul) return { lignes: [], types: [] as string[] };
    const parCle = new Map(donnees.examens.map((e) => [e.cle, e]));
    const lignes = new Map<
      string,
      { libelle: string; type: string; demandes: number; rdv: number }
    >();
    const ajouter = (cle: string, champ: "demandes" | "rdv", n: number) => {
      const ex = parCle.get(cle);
      const libelle =
        cle === "_non_reconnu"
          ? "Examen non reconnu sur l'ordonnance"
          : (ex?.libelle ?? cle);
      const type = ex?.type ?? "autre";
      const l = lignes.get(cle) ?? { libelle, type, demandes: 0, rdv: 0 };
      l[champ] += n;
      lignes.set(cle, l);
    };
    for (const [cle, n] of parPrefixe(calcul.cur, "demande_examen."))
      ajouter(cle, "demandes", n);
    for (const [cle, n] of parPrefixe(calcul.cur, "rdv_examen."))
      ajouter(cle, "rdv", n);
    const toutes = [...lignes.values()].sort(
      (a, b) => b.demandes + b.rdv - (a.demandes + a.rdv),
    );
    const types = [...new Set(toutes.map((l) => l.type))].filter(
      (t) => t !== "autre",
    );
    return { lignes: toutes, types };
  }, [donnees, calcul]);

  const exporterCsv = () => {
    if (!calcul || !donnees) return;
    const jours = [
      ...new Set(
        donnees.lignes
          .filter((l) => l.jour >= from && l.jour <= to)
          .map((l) => l.jour),
      ),
    ].sort();
    const par = (jour: string, cle: string) =>
      donnees.lignes.find((l) => l.jour === jour && l.cle === cle)?.valeur ?? 0;
    const lignes = [
      [
        "Jour",
        "Demandes reçues",
        "RDV pris en ligne",
        "Passées au secrétariat",
        "Abandons",
        "Questionnaires remplis",
      ],
      ...jours.map((j) => [
        j,
        par(j, "demandes_deposees"),
        par(j, "rdv_crees"),
        par(j, "sorties_secretariat"),
        par(j, "abandons"),
        par(j, "questionnaires_remplis"),
      ]),
    ];
    downloadCsv(
      `statistiques-konnect-${isoDateForFilename(dateRange.from)}-${isoDateForFilename(dateRange.to)}.csv`,
      rowsToCsv(lignes),
    );
  };

  const barreOutils = (
    <Box
      sx={{
        mb: 2,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        flexWrap: "wrap",
      }}
    >
      <DateRangePresets range={dateRange} onChange={setDateRange} douzeMois />
      <Button
        variant="outlined"
        onClick={(e) => {
          setBrouillon(dateRange);
          setAncre(e.currentTarget);
        }}
      >
        Du {dateRange.from.toLocaleDateString("fr-FR")} au{" "}
        {dateRange.to.toLocaleDateString("fr-FR")}
      </Button>
      <Popover
        open={Boolean(ancre)}
        anchorEl={ancre}
        onClose={() => setAncre(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        PaperProps={{
          sx: { borderRadius: 2, boxShadow: "0 12px 32px rgba(0,0,0,0.12)" },
        }}
      >
        <Box sx={{ p: 2.5, pb: 1 }}>
          <Typography
            variant="overline"
            sx={{
              fontWeight: 700,
              letterSpacing: 1,
              display: "block",
              mb: 1.5,
            }}
          >
            Choisir une période
          </Typography>
          <DateRangePicker value={brouillon} onChange={setBrouillon} />
        </Box>
        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            display: "flex",
            justifyContent: "flex-end",
            gap: 1,
            borderTop: "1px solid #f0f0f0",
          }}
        >
          <Button
            variant="text"
            onClick={() => setAncre(null)}
            sx={{ color: "text.secondary" }}
          >
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setDateRange(brouillon);
              setAncre(null);
            }}
            sx={{
              bgcolor: "var(--accent)",
              fontWeight: 600,
              "&:hover": { bgcolor: "var(--accent-press)" },
            }}
          >
            Appliquer
          </Button>
        </Box>
      </Popover>
      <Button
        variant="outlined"
        startIcon={<IconDownload size={16} />}
        onClick={exporterCsv}
        disabled={chargement || !donnees || donnees.lignes.length === 0}
      >
        Télécharger CSV
      </Button>
    </Box>
  );

  const c = calcul?.cur ?? {};
  const p = calcul?.prev ?? null;
  const delta = (
    cle: string,
    sens:
      "higher_is_better" | "lower_is_better" | "neutral" = "higher_is_better",
  ) => (p ? computeDelta(ou(c, cle), ou(p, cle), sens) : undefined);

  const rdv = ou(c, "rdv_crees");
  const demandes = ou(c, "demandes_deposees");
  const nbDelais = TRANCHES_DELAI.reduce(
    (n, t) => n + ou(c, `rdv_delai.${t.cle}`),
    0,
  );
  const delaiMoyen = nbDelais > 0 ? ou(c, "rdv_delai_jours") / nbDelais : null;
  const delaiMedian = trancheMediane(c, "rdv_delai.", TRANCHES_DELAI);
  const dureeMediane = trancheMediane(c, "parcours_duree.", TRANCHES_DUREE);
  const connus = ou(c, "rdv_patient.connu");
  const nouveaux = ou(c, "rdv_patient.nouveau");
  const confEnvoyees = Object.entries(c)
    .filter(([k]) => k.startsWith("confirmation.") && k.endsWith(".envoyee"))
    .reduce((n, [, v]) => n + v, 0);
  const confEchec = Object.entries(c)
    .filter(([k]) => k.startsWith("confirmation.") && k.endsWith(".echec"))
    .reduce((n, [, v]) => n + v, 0);
  const premierPris = ou(c, "creneau.premier_pris");
  const premierAutre = ou(c, "creneau.autre");
  const rappels = donnees?.rappels;

  const types = parPrefixe(c, "rdv_type.").map(([t, n]) => ({
    nom: EXAM_TYPE_LABELS[t] ?? t,
    valeur: n,
  }));
  const delaisParType = [
    ...new Set(
      Object.keys(c)
        .filter((k) => k.startsWith("rdv_delai_type."))
        .map((k) => k.split(".")[1]),
    ),
  ].map((t) => {
    const ligne: Record<string, string | number> = {
      type: EXAM_TYPE_LABELS[t] ?? t,
    };
    for (const tr of TRANCHES_DELAI)
      ligne[tr.cle] = ou(c, `rdv_delai_type.${t}.${tr.cle}`);
    return ligne;
  });
  const creneauxJour = JOURS_COURTS.map((j, i) => ({
    jour: j,
    rdv: ou(c, `rdv_creneau_jour.${i + 1}`),
  }));
  const creneauxHeure = Array.from({ length: 13 }, (_, i) => i + 7).map(
    (h) => ({
      heure: `${h}h`,
      rdv: ou(c, `rdv_creneau_heure.${String(h).padStart(2, "0")}`),
    }),
  );
  const parSite = parPrefixe(c, "rdv_site.").map(([cle, n]) => ({
    libelle: donnees?.sites.find((s) => s.cle === cle)?.libelle ?? cle,
    valeur: n,
  }));
  const motifs = parPrefixe(c, "sortie.");
  const examensVisibles = examens.lignes.filter(
    (l) => typeExamen === "tous" || l.type === typeExamen,
  );

  const funnel = donnees?.funnel;
  const pireEtape = funnel?.etapes?.reduce<Etape | null>(
    (pire, e) => (pire === null || e.perdus > pire.perdus ? e : pire),
    null,
  );

  return (
    <PageContainer
      title="Statistiques"
      description="Ce que le portail fait pour votre centre"
    >
      <Box sx={styleRechargement(recharge)} aria-busy={chargement}>
        <BarreRechargement visible={recharge} />
        <SectionHeader
          title="Statistiques du portail"
          subtitle="Ce que la prise de rendez-vous en ligne a fait pour votre centre, sur la période de votre choix."
        />
        {barreOutils}

        {erreur && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {erreur}
          </Alert>
        )}
        {!chargement && donnees && donnees.lignes.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Le portail n&apos;a encore rien transmis sur cette période. Les
            statistiques apparaissent le lendemain des premières demandes en
            ligne.
          </Alert>
        )}

        {/* Rangée 1 : ce que le portail rapporte */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {premierChargement || !calcul ? (
            Array.from({ length: 6 }, (_, i) => (
              <Grid item xs={12} sm={6} md={4} xl={2} key={i}>
                <StatTileSkeleton />
              </Grid>
            ))
          ) : (
            <>
              <Grid item xs={12} sm={6} md={4} xl={2} id="rdv_en_ligne">
                <StatTile
                  title="RDV pris en ligne"
                  value={rdv}
                  icon={<IconRdv />}
                  delta={delta("rdv_crees")}
                  previousLabel={libellePrecedente}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} xl={2} id="hors_heures">
                <StatTile
                  title="Hors des heures d'ouverture"
                  value={calcul.hh.hors}
                  subDetail={`${pct(calcul.hh.hors, calcul.hh.total)} % des RDV`}
                  icon={<IconHorsHeures />}
                  delta={
                    calcul.hhPrev
                      ? computeDelta(calcul.hh.hors, calcul.hhPrev.hors)
                      : undefined
                  }
                  previousLabel={libellePrecedente}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} xl={2} id="demandes">
                <StatTile
                  title="Demandes reçues"
                  value={demandes}
                  subDetail="ordonnances déposées"
                  icon={<IconDemandes />}
                  delta={delta("demandes_deposees")}
                  previousLabel={libellePrecedente}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} xl={2} id="reservees_en_ligne">
                <StatTile
                  title="Réservées de bout en bout"
                  value={`${pct(rdv, demandes)} %`}
                  subDetail={`${rdv} sur ${demandes}`}
                  icon={<IconReservees />}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} xl={2} id="transmises">
                <StatTile
                  title="Transmises au secrétariat"
                  value={ou(c, "sorties_secretariat")}
                  subDetail={
                    rappels ? `dont ${rappels.recues} rappels` : undefined
                  }
                  icon={<IconSecretariat />}
                  delta={delta("sorties_secretariat", "lower_is_better")}
                  previousLabel={libellePrecedente}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} xl={2} id="appels_evites">
                <StatTile
                  title="Temps gagné au téléphone"
                  value={dureeLisible(rdv * MINUTES_PAR_APPEL_EVITE)}
                  subDetail={`${rdv} appels de ${MINUTES_PAR_APPEL_EVITE} min évités`}
                  icon={<IconAppels />}
                  delta={delta("rdv_crees")}
                  previousLabel={libellePrecedente}
                />
              </Grid>
            </>
          )}
        </Grid>

        {/* Rangée 2 : la qualité du service */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {premierChargement || !calcul ? (
            Array.from({ length: 6 }, (_, i) => (
              <Grid item xs={12} sm={6} md={4} xl={2} key={i}>
                <StatTileSkeleton />
              </Grid>
            ))
          ) : (
            <>
              <Grid item xs={12} sm={6} md={4} xl={2} id="delai_rdv">
                <StatTile
                  title="Délai jusqu'au RDV"
                  value={
                    delaiMoyen === null
                      ? "Pas encore"
                      : `${delaiMoyen.toFixed(1).replace(".", ",")} j`
                  }
                  subDetail={
                    delaiMedian
                      ? `médiane : ${delaiMedian.libelle}`
                      : "en moyenne"
                  }
                  icon={<IconDelai />}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} xl={2} id="temps_reservation">
                <StatTile
                  title="Temps pour réserver"
                  value={dureeMediane ? dureeMediane.libelle : "Pas encore"}
                  subDetail="en médiane"
                  icon={<IconTemps />}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} xl={2} id="nouveaux_patients">
                <StatTile
                  title="Nouveaux patients"
                  value={`${pct(nouveaux, connus + nouveaux)} %`}
                  subDetail={`${nouveaux} sans dossier`}
                  icon={<IconNouveaux />}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} xl={2} id="rappels_attente">
                <StatTile
                  title="Rappels en attente"
                  value={rappels?.enAttente ?? 0}
                  subDetail={
                    rappels?.delaiMedianHeures != null
                      ? `traités en ${dureeLisible(rappels.delaiMedianHeures * 60)}`
                      : "à traiter"
                  }
                  icon={<IconRappels />}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} xl={2} id="confirmations">
                <StatTile
                  title="Confirmations envoyées"
                  value={`${pct(confEnvoyees, confEnvoyees + confEchec)} %`}
                  subDetail={`${confEchec} non envoyée${confEchec > 1 ? "s" : ""}`}
                  icon={<IconConfirmations />}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} xl={2} id="questionnaires">
                <StatTile
                  title="Questionnaires remplis"
                  value={ou(c, "questionnaires_remplis")}
                  subDetail="avant le RDV"
                  icon={<IconQuestionnaires />}
                  delta={delta("questionnaires_remplis")}
                  previousLabel={libellePrecedente}
                />
              </Grid>
            </>
          )}
        </Grid>

        <Grid
          container
          spacing={2}
          sx={{ "& > .MuiGrid-item": { minWidth: 0 } }}
        >
          <Grid item xs={12}>
            <Carte
              id="evolution"
              titre="Évolution"
              aide={
                calcul?.parSemaine
                  ? "Semaine par semaine : les demandes reçues, les RDV pris en ligne et ce qui est passé par le secrétariat."
                  : "Jour par jour : les demandes reçues, les RDV pris en ligne et ce qui est passé par le secrétariat."
              }
            >
              {premierChargement || !calcul ? (
                <ChartSkeleton />
              ) : (
                <Box sx={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={calcul.evolution}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="libelle" minTickGap={12} />
                      <YAxis allowDecimals={false} />
                      <ReTooltip />
                      <Legend />
                      <Bar
                        isAnimationActive={false}
                        dataKey="demandes"
                        name="Demandes reçues"
                        fill={COULEURS.demandes}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="rdv"
                        name="RDV pris en ligne"
                        fill={COULEURS.rdv}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="secretariat"
                        name="Passées au secrétariat"
                        fill={COULEURS.secretariat}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Carte>
          </Grid>

          <Grid item xs={12}>
            <Carte
              id="horaires"
              titre="Quand les patients réservent"
              aide={
                donnees?.horaires.source === "talk"
                  ? "RDV pris en ligne par jour et par heure. Les cases encadrées sont vos heures d'ouverture, celles de votre réglage LyraeTalk."
                  : "RDV pris en ligne par jour et par heure. Les cases encadrées sont les heures d'ouverture retenues : du lundi au vendredi, de 8 h à 18 h."
              }
            >
              {premierChargement || !calcul ? (
                <ChartSkeleton />
              ) : calcul.hh.total === 0 ? (
                <Vide texte="Aucun RDV pris en ligne sur cette période." />
              ) : (
                <Heatmap
                  matrix={calcul.hh.matrice}
                  max={Math.max(...calcul.hh.matrice.flat())}
                  colorRgb="98, 55, 210"
                  metricLabel="RDV"
                  ouvert={donnees?.horaires.ouvert}
                  legendeOuvert="Heures d'ouverture"
                />
              )}
            </Carte>
          </Grid>

          <Grid item xs={12} md={6}>
            <Carte
              id="heures"
              titre="Heure de la demande et de la réservation"
              aide="Sur les 24 heures, quand les ordonnances arrivent et quand les RDV se prennent."
            >
              {premierChargement || !calcul ? (
                <ChartSkeleton />
              ) : (
                <Box sx={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={calcul.parHeure}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="heure"
                        interval="preserveStartEnd"
                        minTickGap={12}
                      />
                      <YAxis allowDecimals={false} />
                      <ReTooltip />
                      <Legend />
                      <Bar
                        isAnimationActive={false}
                        dataKey="demandes"
                        name="Demandes"
                        fill={COULEURS.demandes}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="rdv"
                        name="RDV pris"
                        fill={COULEURS.horsHeures}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Carte>
          </Grid>

          <Grid item xs={12} md={6}>
            <Carte
              id="types"
              titre="RDV par type d'examen"
              aide="La part de chaque type dans les RDV pris en ligne."
            >
              {premierChargement || !calcul ? (
                <ChartSkeleton />
              ) : types.length === 0 ? (
                <Vide texte="Aucun RDV pris en ligne sur cette période." />
              ) : (
                <Box sx={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        isAnimationActive={false}
                        data={types}
                        dataKey="valeur"
                        nameKey="nom"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {types.map((_, i) => (
                          <Cell
                            key={i}
                            fill={COULEURS_TYPES[i % COULEURS_TYPES.length]}
                          />
                        ))}
                      </Pie>
                      <ReTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Carte>
          </Grid>

          <Grid item xs={12}>
            <Carte
              id="examens"
              titre="Examens demandés et réservés"
              aide="Demandés : l'examen de l'ordonnance validée par le patient. Réservés : les RDV pris en ligne. Un examen très demandé et peu réservé manque de créneaux en ligne ou passe par le secrétariat."
              action={
                examens.types.length > 0 ? (
                  <Tabs
                    value={
                      examens.types.includes(typeExamen) ? typeExamen : "tous"
                    }
                    onChange={(_, v) => setTypeExamen(v as string)}
                    variant="scrollable"
                    scrollButtons="auto"
                    allowScrollButtonsMobile
                    sx={{
                      maxWidth: "100%",
                      minHeight: 36,
                      "& .MuiTab-root": { minHeight: 36, fontWeight: 600 },
                    }}
                  >
                    <Tab value="tous" label="Tous" />
                    {examens.types.map((t) => (
                      <Tab key={t} value={t} label={EXAM_TYPE_LABELS[t] ?? t} />
                    ))}
                  </Tabs>
                ) : undefined
              }
            >
              {premierChargement || !calcul ? (
                <ChartSkeleton />
              ) : examensVisibles.length === 0 ? (
                <Vide texte="Aucun examen demandé ni réservé sur cette période. Le détail par examen commence avec la dernière mise à jour du portail." />
              ) : (
                <Box>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: COLONNES_EXAMENS,
                      gap: 1,
                      px: 1,
                      pb: 1,
                      borderBottom: `1px solid ${BORDER}`,
                    }}
                  >
                    {["Examen", "Demandés", "Réservés", "Taux"].map((t, i) => (
                      <Typography
                        key={t}
                        sx={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: INK_MUTED,
                          textAlign: i ? "right" : "left",
                          display:
                            i === 3 ? { xs: "none", sm: "block" } : "block",
                        }}
                      >
                        {t}
                      </Typography>
                    ))}
                  </Box>
                  {(toutVoir
                    ? examensVisibles
                    : examensVisibles.slice(0, 12)
                  ).map((l) => (
                    <Box
                      key={l.libelle}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: COLONNES_EXAMENS,
                        gap: 1,
                        px: 1,
                        py: 1,
                        borderBottom: `1px solid ${BORDER}`,
                      }}
                    >
                      <Typography
                        sx={{ fontSize: 13.5, color: INK }}
                        noWrap
                        title={l.libelle}
                      >
                        {l.libelle}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 13.5,
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {l.demandes}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 13.5,
                          textAlign: "right",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {l.rdv}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 13.5,
                          textAlign: "right",
                          color:
                            l.demandes > 0 && l.rdv < l.demandes / 2
                              ? PERDU
                              : INK_MUTED,
                          fontVariantNumeric: "tabular-nums",
                          display: { xs: "none", sm: "block" },
                        }}
                      >
                        {l.demandes > 0
                          ? `${pct(Math.min(l.rdv, l.demandes), l.demandes)} %`
                          : ""}
                      </Typography>
                    </Box>
                  ))}
                  {examensVisibles.length > 12 && (
                    <Button
                      size="small"
                      onClick={() => setToutVoir((v) => !v)}
                      sx={{ mt: 1 }}
                    >
                      {toutVoir
                        ? "Voir moins"
                        : `Voir les ${examensVisibles.length} examens`}
                    </Button>
                  )}
                </Box>
              )}
            </Carte>
          </Grid>

          <Grid item xs={12} md={6}>
            <Carte
              id="delai_par_type"
              titre="Délai jusqu'au RDV, par type d'examen"
              aide="Dans combien de temps le patient obtient son RDV. Une longue barre rouge signale un examen qui manque de place."
            >
              {premierChargement || !calcul ? (
                <ChartSkeleton />
              ) : delaisParType.length === 0 ? (
                <Vide texte="Pas encore de délai par type sur cette période. Il commence avec la dernière mise à jour du portail." />
              ) : (
                <Box
                  sx={{
                    width: "100%",
                    height: Math.max(180, 48 * delaisParType.length + 80),
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={delaisParType}
                      layout="vertical"
                      margin={{ left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="type" width={96} />
                      <ReTooltip />
                      <Legend />
                      {TRANCHES_DELAI.map((t, i) => (
                        <Bar
                          isAnimationActive={false}
                          key={t.cle}
                          dataKey={t.cle}
                          name={t.libelle}
                          stackId="d"
                          fill={COULEURS_DELAI[i]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Carte>
          </Grid>

          <Grid item xs={12} md={6}>
            <Carte
              id="creneaux"
              titre="Les créneaux choisis"
              aide={
                premierPris + premierAutre > 0
                  ? `Le jour des RDV pris en ligne. ${pct(premierPris, premierPris + premierAutre)} % des patients ont pris le premier créneau proposé.`
                  : "Le jour des RDV pris en ligne."
              }
            >
              {premierChargement || !calcul ? (
                <ChartSkeleton />
              ) : rdv === 0 ? (
                <Vide texte="Aucun RDV pris en ligne sur cette période." />
              ) : (
                <Stack spacing={1}>
                  <Box sx={{ width: "100%", height: 150 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={creneauxJour}>
                        <XAxis dataKey="jour" />
                        <YAxis allowDecimals={false} width={28} />
                        <ReTooltip />
                        <Bar
                          isAnimationActive={false}
                          dataKey="rdv"
                          name="RDV"
                          fill={COULEURS.rdv}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                  <Box sx={{ width: "100%", height: 150 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={creneauxHeure}>
                        <XAxis dataKey="heure" interval={1} />
                        <YAxis allowDecimals={false} width={28} />
                        <ReTooltip />
                        <Bar
                          isAnimationActive={false}
                          dataKey="rdv"
                          name="RDV"
                          fill={COULEURS.rdv}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Stack>
              )}
            </Carte>
          </Grid>

          <Grid item xs={12} md={6}>
            <Carte
              id="motifs"
              titre="Pourquoi des patients passent par le secrétariat"
              aide="Chaque demande compte une fois, le jour où elle vous arrive."
            >
              {premierChargement || !calcul ? (
                <ChartSkeleton />
              ) : motifs.length === 0 ? (
                <Vide texte="Aucune demande passée par le secrétariat sur cette période." />
              ) : (
                motifs.map(([m, n]) => (
                  <Barre
                    key={m}
                    libelle={MOTIFS_SECRETARIAT[m] ?? m}
                    valeur={n}
                    max={motifs[0][1]}
                  />
                ))
              )}
            </Carte>
          </Grid>

          <Grid item xs={12} md={6}>
            <Carte
              id="sites"
              titre="RDV par site"
              aide="Où ont lieu les RDV pris en ligne."
            >
              {premierChargement || !calcul ? (
                <ChartSkeleton />
              ) : parSite.length === 0 ? (
                <Vide texte="Aucun RDV pris en ligne sur cette période." />
              ) : (
                parSite.map((s) => (
                  <Barre
                    key={s.libelle}
                    libelle={s.libelle}
                    valeur={s.valeur}
                    max={parSite[0].valeur}
                  />
                ))
              )}
            </Carte>
          </Grid>

          <Grid item xs={12} md={6}>
            <Carte
              id="file_attente"
              titre="File d'attente"
              aide="Les patients inscrits faute de créneau, et les places que la file leur a proposées."
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 1.5,
                }}
              >
                <TuileChiffre
                  libelle="Inscrits sur la période"
                  valeur={donnees?.file.inscrits ?? 0}
                />
                <TuileChiffre
                  libelle="Places proposées"
                  valeur={donnees?.file.propositions ?? 0}
                />
                <TuileChiffre
                  libelle="RDV pris par la file"
                  valeur={donnees?.file.prises ?? 0}
                />
                <TuileChiffre
                  libelle="Encore en attente"
                  valeur={donnees?.file.enFile ?? 0}
                />
              </Box>
            </Carte>
          </Grid>

          <Grid item xs={12}>
            <Accordion
              id="parcours"
              disableGutters
              elevation={1}
              sx={{
                borderRadius: 1,
                "&:before": { display: "none" },
                scrollMarginTop: 96,
              }}
            >
              <AccordionSummary expandIcon={<IconDeplier />}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    Où les patients s&apos;arrêtent
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Le parcours étape par étape, sur les 30 derniers jours.
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {!funnel || !Array.isArray(funnel.etapes) ? (
                  <Vide texte="Le portail n'a pas encore assez de demandes pour montrer le parcours." />
                ) : (
                  <Box>
                    {(funnel.rappels_non_transmis ?? 0) > 0 && (
                      <Alert severity="error" sx={{ mb: 2 }}>
                        {funnel.rappels_non_transmis} patient
                        {funnel.rappels_non_transmis! > 1 ? "s ont" : " a"} lu «
                        le secrétariat vous rappelle » sans que la demande
                        n&apos;arrive ici. Si le chiffre monte, prévenez le
                        support.
                      </Alert>
                    )}
                    {pireEtape && pireEtape.perdus > 0 && (
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        C&apos;est juste avant « {pireEtape.libelle} » que vous
                        perdez le plus de monde : {pireEtape.perdus} patient
                        {pireEtape.perdus > 1 ? "s" : ""} s&apos;arrêtent là.
                      </Alert>
                    )}
                    {funnel.etapes.map((e, i) => (
                      <Box
                        key={e.libelle}
                        sx={{ mb: i === funnel.etapes.length - 1 ? 0 : 2 }}
                      >
                        <Stack
                          direction="row"
                          alignItems="baseline"
                          spacing={1}
                          sx={{ mb: 0.5 }}
                        >
                          <Typography
                            sx={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: INK,
                              flex: 1,
                            }}
                          >
                            {e.libelle}
                          </Typography>
                          <Typography sx={{ fontSize: 13, color: INK }}>
                            {e.atteint}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: 12,
                              color: INK_MUTED,
                              minWidth: 46,
                              textAlign: "right",
                            }}
                          >
                            {Math.round(e.taux * 100)} %
                          </Typography>
                        </Stack>
                        <Box
                          sx={{
                            height: 10,
                            borderRadius: 5,
                            bgcolor: "rgba(0,0,0,0.06)",
                            overflow: "hidden",
                          }}
                        >
                          <Box
                            sx={{
                              width: `${Math.max(0, Math.min(100, e.taux * 100))}%`,
                              height: "100%",
                              bgcolor: "var(--accent)",
                            }}
                          />
                        </Box>
                        {i > 0 && e.perdus > 0 && (
                          <Typography
                            sx={{ fontSize: 11.5, color: PERDU, mt: 0.5 }}
                          >
                            {e.perdus} patient{e.perdus > 1 ? "s" : ""} perdu
                            {e.perdus > 1 ? "s" : ""} à cette étape
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          </Grid>
        </Grid>

        <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mt: 2 }}>
          {donnees?.recuAt
            ? `Les chiffres de la veille arrivent chaque nuit. Dernier relevé du portail : ${new Date(donnees.recuAt).toLocaleString("fr-FR")}.`
            : "Les chiffres de la veille arrivent chaque nuit."}
        </Typography>
      </Box>
    </PageContainer>
  );
}
