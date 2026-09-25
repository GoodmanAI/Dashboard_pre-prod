"use client";

import { useConfirmation } from "@/components/shared/DialogConfirmation";
import Retour from "@/components/shared/Retour";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Portal,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  IconArrowLeft,
  IconCircleCheck,
  IconClock,
  IconSearch,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { useDroitPage } from "@/hooks/useDroitPage";
import { PAGES } from "@/lib/permissions";
import { useTalkBasePath } from "@/utils/talkRoutes";
import ExamTypeBadge, {
  EXAM_TYPE_SHORT,
} from "@/components/shared/ExamTypeBadge";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import ImportExportMapping, {
  CHAMPS_TALK,
} from "@/components/mapping/ImportExportMapping";
import {
  CarteMapping,
  CaseMapping,
  CelluleCodeLibelle,
  CelluleExamen,
  CelluleInjection,
  CelluleType,
  EnTeteMapping,
  OPTIONS_SEUIL,
  RangeeChamp,
  SEUIL_FICHES,
} from "@/components/mapping/cellules";
import {
  INK,
  INK_MUTED,
  BORDER,
  SURFACE,
  SURFACE_MUTED,
  SURFACE_HOVER,
  BRAND,
  BRAND_DARK,
  DANGER,
  WARNING,
} from "@/lib/jetons";

/**
 * Correspondance des examens (refonte design 2026-08-06).
 * -----------------------------------------------------------------------------
 * Refonte totale de l'UI :
 * - Table MUI stylisee (avant : <table> HTML brute avec <input> natifs).
 * - Filtres : recherche full-text + filtre par type d'examen + filtre attribue.
 * - Badge de type d'examen colore par modalite (RX/US/CT/MR/MG/USMAM).
 * - Compteur de modifications non sauvegardees + sticky save bar en bas.
 * - Sticky toolbar en haut.
 * - Layout pleine largeur (coherent avec les autres pages du dashboard).
 * -----------------------------------------------------------------------------
 * Logique data inchangee : GET /api/configuration/get/mapping,
 * POST /api/configuration/mapping. Meme structure de row.
 * -----------------------------------------------------------------------------
 * CONVERGENCE AVEC L'ECRAN DE LYRAEKONNECT (14/09/2026), a la demande du client.
 *
 * Ce qui vient de Konnect : la case « attribue a Lyrae » ouvre la ligne sous forme
 * de case a cocher (c'etait un interrupteur, a droite), la ligne s'estompe quand
 * elle est decochee, et les champs du client s'y desactivent. On coche d'abord, on
 * saisit ensuite.
 *
 * Ce qui reste de LyraeTalk, et que les deux ecrans adoptent : le code du RIS et le
 * libelle patient l'un AU-DESSUS de l'autre, dans une seule colonne.
 *
 * Ce qui est nouveau des deux cotes : la colonne « Type » propose les types que ce
 * client a deja saisis (`typesClient`), et « Injecte » est une case qui ouvre le
 * champ du code d'injection. Ici cette case n'est qu'un volet d'affichage : la
 * verite de LyraeTalk est la presence d'un code, il n'y a pas de booleen a stocker.
 *
 * Ce qui reste propre a cet ecran : la colonne « Creneau horaire ».
 *
 * Les cellules communes vivent dans `components/mapping/cellules.tsx`. La LIGNE,
 * elle, reste ici, et c'est delibere : une ligne partagee aurait du connaitre les
 * colonnes des deux produits, donc leurs invariants, ce qui est exactement l'erreur
 * qui a bloque dix centres le meme jour.
 */

const SURFACE_DISABLED = "#EEF2F5";

const INJECTABLE_TYPES = new Set(["CT", "MR"]);
const ROWS_PER_PAGE = 25;

interface HoraireConfig {
  enabled: boolean;
  position: "below" | "above";
  time: string;
}

interface ExamRow {
  codeExamen: string;
  libelle: string;
  typeExamen: string;
  codeExamenClient: string;
  libelleClient: string;
  typeExamenClient: string;
  performed: boolean;
  codeExamenClientInject: string | null;
  horaire: HoraireConfig;
  [k: string]: any;
}

type AttribFilter = "all" | "yes" | "no";

/**
 * Le code RIS est-il rempli ? C'est l'axe qui manquait, et c'est LA question qu'on se
 * pose devant 287 lignes à compléter : « lesquelles me restent ? ».
 *
 * ⚠️ DISTINCT DE `AttribFilter`, et il faut garder les deux. « Attribué à Lyrae »
 * (`performed`) veut dire que le centre confie cet examen au robot ; avoir un code RIS
 * est autre chose. Chez LyraeKonnect, le mot « attribué » désigne justement le code
 * RIS : même mot, deux sens selon le produit. On ne les fond donc pas.
 */
type CodeRisFilter = "all" | "yes" | "no";

interface TalkPageProps {
  params: { id: string };
}

export default function MappingExam({ params }: TalkPageProps) {
  const router = useRouter();
  const userProductId = Number(params.id);
  const basePath = useTalkBasePath(userProductId);

  // Lecture seule, revue le 15/09/2026. Elle se lisait sur le seul booléen hérité
  // `isSecretary`, donc un sous-compte moderne créé avec « Mapping examens » en
  // lecture voyait tous ses champs actifs et découvrait le refus à l'enregistrement.
  // `useDroitPage` couvre les deux : il passe par `hasPermission`, qui applique le
  // préréglage hérité des comptes secrétaire ET le JSON de permissions.
  const { peutEcrire, raisonLectureSeule } = useDroitPage(PAGES.MAPPING_EXAM);
  const readOnly = !peutEcrire;

  /**
   * En dessous du seuil, chaque examen devient une fiche : tous ses champs visibles
   * d'un coup, au lieu d'un tableau qu'il faudrait pousser vers la gauche pour
   * atteindre la colonne qu'on remplit. Voir `SEUIL_FICHES`.
   */
  const theme = useTheme();
  const enFiches = useMediaQuery(
    theme.breakpoints.down(SEUIL_FICHES),
    OPTIONS_SEUIL,
  );

  const [data, setData] = useState<ExamRow[]>([]);
  const [originalData, setOriginalData] = useState<ExamRow[]>([]);
  // Empreinte du mapping au chargement, renvoyée à l'enregistrement : la route refuse
  // (409) si un collègue a enregistré entre-temps. Sans elle, un onglet ouvert la veille
  // a effacé 21 lignes chez GH Pontivy le 25/09/2026 (voir `src/lib/versionMapping.ts`).
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { confirmer, dialogue } = useConfirmation();
  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  // Filtres UI
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [attribFilter, setAttribFilter] = useState<AttribFilter>("all");
  const [codeRisFilter, setCodeRisFilter] = useState<CodeRisFilter>("all");
  const [page, setPage] = useState(0);

  // ---- Fetch initial ----
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/configuration/get/mapping?userProductId=${userProductId}`,
        );
        let rows: ExamRow[] = [];
        // `X-Mapping-Version`, posé par la route même en l'absence de mapping enregistré.
        setVersion(res.headers.get("X-Mapping-Version"));
        if (res.ok) {
          const json = await res.json();
          const formatted = Array.isArray(json) ? json : Object.values(json);
          rows = formatted.map((row: any) => ({
            ...row,
            typeExamenClient: row.typeExamenClient ?? "",
            performed: row.performed ?? true,
            codeExamenClientInject: row.codeExamenClientInject ?? null,
            horaire: row.horaire ?? {
              enabled: false,
              position: "below",
              time: "",
            },
          }));
        } else if (res.status === 404) {
          // CENTRE JAMAIS CONFIGURÉ : on amorce depuis le référentiel.
          //
          // Ce repli appelait `/api/data/exams`, qui renvoie du **CSV** : le `.json()`
          // levait, le `catch` affichait « Erreur de chargement des examens », et un
          // nouveau client se retrouvait devant un tableau vide. Il n'a jamais
          // fonctionné, indépendamment d'Azure. Personne ne l'avait vu parce qu'il ne
          // s'emprunte que sur un centre sans `TalkSettings`, donc à l'installation.
          //
          // `/api/referentiel-examens` sert du JSON à la forme d'`ExamRow`, et tire du
          // référentiel en base plutôt que du blob (corrigé le 11/09/2026, Q35).
          const amorce = await fetch(
            `/api/referentiel-examens?userProductId=${userProductId}`,
          );
          if (amorce.ok) {
            const json = await amorce.json();
            rows = Array.isArray(json?.examens) ? json.examens : [];
            if (rows.length === 0 && json?.motif) {
              // `error` et pas `warning` : le composant ne connaît que deux tons,
              // et un amorçage vide empêche bel et bien de configurer le centre.
              setSnack({ open: true, message: json.motif, severity: "error" });
            }
          }
        }
        setData(rows);
        setOriginalData(JSON.parse(JSON.stringify(rows)));
      } catch (err) {
        console.error(err);
        setSnack({
          open: true,
          message: "Erreur de chargement des examens",
          severity: "error",
        });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userProductId]);

  // ---- Types uniques presents dans le dataset ----
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r) => r.typeExamen && set.add(r.typeExamen));
    return Array.from(set).sort();
  }, [data]);

  /**
   * Les types que CE client a déjà saisis, proposés dans la colonne « Type ».
   *
   * Distincts d'`availableTypes`, qui sont les modalités de notre référentiel et
   * servent au filtre. Un centre emploie trois ou quatre codes de type pour ses 287
   * examens : les proposer évite la faute de frappe qui casse le couple (type, code)
   * attendu par le RIS sans lever la moindre erreur.
   */
  const typesClient = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r) => {
      const t = (r.typeExamenClient ?? "").trim();
      if (t) set.add(t);
    });
    return Array.from(set).sort();
  }, [data]);

  // ---- Filtrage ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((row) => {
      if (typeFilter !== "all" && row.typeExamen !== typeFilter) return false;
      if (attribFilter === "yes" && !row.performed) return false;
      if (attribFilter === "no" && row.performed) return false;
      const aUnCodeRis = Boolean((row.codeExamenClient ?? "").trim());
      if (codeRisFilter === "yes" && !aUnCodeRis) return false;
      if (codeRisFilter === "no" && aUnCodeRis) return false;
      if (!q) return true;
      const hay = [
        row.libelle,
        row.codeExamen,
        row.codeExamenClient,
        row.libelleClient,
        row.typeExamenClient,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, typeFilter, attribFilter, codeRisFilter]);

  const pageRows = useMemo(
    () => filtered.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE),
    [filtered, page],
  );

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [search, typeFilter, attribFilter, codeRisFilter]);

  // ---- Compteur de modifications ----
  const dirtyCount = useMemo(() => {
    if (originalData.length !== data.length) return data.length;
    let n = 0;
    for (let i = 0; i < data.length; i++) {
      if (JSON.stringify(data[i]) !== JSON.stringify(originalData[i])) n++;
    }
    return n;
  }, [data, originalData]);

  // ---- KPIs ----
  const attribCount = useMemo(
    () => data.filter((r) => r.performed).length,
    [data],
  );

  /**
   * Attribué à Lyrae, mais sans code RIS : le robot ANNONCE cet examen au patient et
   * ne saura pas le réserver. C'est exactement l'état que la garde de
   * `/api/configuration/get/mapping` évite de créer toute seule (11/09/2026), mais
   * rien n'empêche de le produire à la main en cochant une ligne vide. On le compte
   * donc, et on le montre.
   */
  const attribSansCode = useMemo(
    () =>
      data.filter((r) => r.performed && !(r.codeExamenClient ?? "").trim())
        .length,
    [data],
  );

  // ---- Guard : previens l'utilisateur qui navigue avec des modifs non sauvees
  const guard = useUnsavedChangesGuard(dirtyCount > 0, {
    message: `Vos ${dirtyCount} modification${dirtyCount > 1 ? "s" : ""} non enregistrée${
      dirtyCount > 1 ? "s" : ""
    } seront perdues.`,
  });

  // ---- Handlers ----
  const handleChange = useCallback(
    (codeExamen: string, key: string, value: any) => {
      setData((prev) =>
        prev.map((row) =>
          row.codeExamen === codeExamen ? { ...row, [key]: value } : row,
        ),
      );
    },
    [],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/configuration/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProductId, data, version }),
      });
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        // La route refuse deux configurations contradictoires : un code NEURACORP en
        // double, un code RIS attribué à deux examens (14/09/2026). Elle nomme les
        // codes fautifs, donc on montre SON message : « Erreur lors de la
        // sauvegarde » obligerait à chercher la ligne à la main dans 287 lignes.
        setSnack({
          open: true,
          message: json?.error ?? "Erreur lors de la sauvegarde",
          severity: "error",
        });
        return;
      }

      setOriginalData(JSON.parse(JSON.stringify(data)));
      if (typeof json?.version === "string") setVersion(json.version);
      const enregistre = `${dirtyCount} modification${
        dirtyCount > 1 ? "s" : ""
      } enregistrée${dirtyCount > 1 ? "s" : ""}`;
      // Non bloquant à dessein (c'est l'état de départ d'un centre vierge), mais dit
      // à l'enregistrement plutôt qu'attendu dans une pastille : le robot annonce ces
      // examens au patient sans savoir les réserver. La pastille orange de la barre
      // d'outils filtre les lignes concernées.
      const sansCode = Number(json?.attribuesSansCode ?? 0);
      setSnack({
        open: true,
        message:
          sansCode > 0
            ? `${enregistre}. ${sansCode} examen${
                sansCode > 1 ? "s" : ""
              } attribué${sansCode > 1 ? "s" : ""} à Lyrae sans code RIS : le robot ${
                sansCode > 1 ? "les annonce" : "l'annonce"
              } sans savoir ${sansCode > 1 ? "les" : "le"} réserver.`
            : enregistre,
        severity: "success",
      });
    } catch {
      setSnack({
        open: true,
        message: "Erreur lors de la sauvegarde",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (
      !(await confirmer({
        titre: "Annuler les modifications ?",
        texte: `Les ${dirtyCount} modification${dirtyCount > 1 ? "s" : ""} non enregistrée${dirtyCount > 1 ? "s" : ""} seront perdues.`,
        libelleAction: "Annuler les modifications",
        destructif: true,
      }))
    )
      return;
    setData(JSON.parse(JSON.stringify(originalData)));
  };

  return (
    <Box sx={{ pb: 12, px: { xs: 2, sm: 3 }, py: 3 }}>
      {guard.dialogue}
      {/* -------- Header -------- */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <IconButton
          onClick={async () => {
            if (
              dirtyCount > 0 &&
              !(await confirmer({
                titre: "Quitter sans enregistrer ?",
                texte: `Vous avez ${dirtyCount} modification${dirtyCount > 1 ? "s" : ""} non enregistrée${dirtyCount > 1 ? "s" : ""}. Elles seront perdues.`,
                libelleAction: "Quitter sans enregistrer",
                destructif: true,
              }))
            )
              return;
            guard.disable();
            router.back();
          }}
          size="small"
          sx={{
            color: INK_MUTED,
            "&:hover": { color: INK, bgcolor: SURFACE_MUTED },
          }}
        >
          <IconArrowLeft size={18} />
        </IconButton>
        <Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              color: INK,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            Correspondance des examens
          </Typography>
          <Typography variant="body2" sx={{ color: INK_MUTED, mt: 0.25 }}>
            Associez les libellés et codes de votre système à ceux de Neuracorp,
            et indiquez quels examens sont pris en charge par Lyrae.
          </Typography>
        </Box>
      </Stack>

      {readOnly && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          {raisonLectureSeule ??
            "Vous avez cette page en lecture seule. Demandez les droits d'écriture à votre administrateur."}
        </Alert>
      )}

      {/* -------- Sticky Toolbar (recherche + filtres + KPIs) -------- */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 3,
          bgcolor: SURFACE,
          borderBottom: `1px solid ${BORDER}`,
          py: 1.5,
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        {/*
          BARRE REPLIABLE (14/09/2026). Recherche, filtre de type, deux groupes de
          bascules et deux boutons d'import font plus de 1 300 px sur une ligne :
          entre `md` et cette largeur, les boutons d'import sortaient de l'ecran.

          `useFlexGap` est indispensable : le `spacing` de Stack pose des MARGES, qui
          ne savent pas se replier proprement, la ou `gap` suit le passage a la ligne.
          Le point de bascule descend a `sm` parce qu'une colonne unique n'est utile
          qu'au telephone ; entre les deux, le repli fait mieux le travail.
        */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          useFlexGap
          flexWrap="wrap"
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          {/* Recherche */}
          <TextField
            size="small"
            placeholder="Rechercher un examen, un code, un libellé…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              flex: "1 1 280px",
              minWidth: 220,
              "& .MuiOutlinedInput-root": {
                bgcolor: SURFACE_MUTED,
                "& fieldset": { borderColor: BORDER },
                "&:hover fieldset": { borderColor: BRAND },
                "&.Mui-focused fieldset": {
                  borderColor: BRAND,
                  borderWidth: 2,
                },
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <IconSearch size={16} color={INK_MUTED} />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch("")}>
                    <IconX size={14} />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
          />

          {/* Filtre type d'examen */}
          {availableTypes.length > 0 && (
            <Select
              size="small"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              displayEmpty
              sx={{
                minWidth: 160,
                bgcolor: SURFACE_MUTED,
                "& fieldset": { borderColor: BORDER },
                "&:hover fieldset": { borderColor: BRAND },
              }}
            >
              <MenuItem value="all">Tous les types</MenuItem>
              {availableTypes.map((t) => (
                <MenuItem key={t} value={t}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <ExamTypeBadge type={t} variant="compact" />
                    <Typography variant="body2">
                      {EXAM_TYPE_SHORT[t] ?? t}
                    </Typography>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          )}

          {/* Filtre attribue */}
          <ToggleButtonGroup
            value={attribFilter}
            exclusive
            size="small"
            onChange={(_, v) => v && setAttribFilter(v as AttribFilter)}
            sx={{
              bgcolor: SURFACE_MUTED,
              "& .MuiToggleButton-root": {
                border: `1px solid ${BORDER}`,
                fontSize: 13,
                color: INK_MUTED,
                px: 1.5,
                "&.Mui-selected": {
                  bgcolor: BRAND,
                  color: "#fff",
                  "&:hover": { bgcolor: BRAND_DARK },
                },
              },
            }}
          >
            <ToggleButton value="all">Tous</ToggleButton>
            <ToggleButton value="yes">Attribués</ToggleButton>
            <ToggleButton value="no">Non attribués</ToggleButton>
          </ToggleButtonGroup>

          {/* Filtre code RIS : le seul qui reponde a « qu'est-ce qu'il me reste ? » */}
          <ToggleButtonGroup
            value={codeRisFilter}
            exclusive
            size="small"
            onChange={(_, v) => v && setCodeRisFilter(v as CodeRisFilter)}
            sx={{
              bgcolor: SURFACE_MUTED,
              "& .MuiToggleButton-root": {
                border: `1px solid ${BORDER}`,
                fontSize: 13,
                color: INK_MUTED,
                px: 1.5,
                "&.Mui-selected": {
                  bgcolor: BRAND,
                  color: "#fff",
                  "&:hover": { bgcolor: BRAND_DARK },
                },
              },
            }}
          >
            <ToggleButton value="all">Tous</ToggleButton>
            <ToggleButton value="yes">Avec code</ToggleButton>
            <ToggleButton value="no">Sans code</ToggleButton>
          </ToggleButtonGroup>

          {!readOnly && (
            <ImportExportMapping
              lignes={data}
              champs={CHAMPS_TALK}
              onAppliquer={setData}
            />
          )}
        </Stack>

        {/* KPIs ligne */}
        <Stack
          direction="row"
          spacing={2}
          useFlexGap
          sx={{ mt: 1.5, flexWrap: "wrap", alignItems: "center" }}
        >
          <Chip
            size="small"
            label={`${filtered.length} affiché${filtered.length > 1 ? "s" : ""} / ${data.length}`}
            sx={{
              bgcolor: SURFACE_MUTED,
              border: `1px solid ${BORDER}`,
              color: INK_MUTED,
              fontWeight: 500,
              fontSize: 12,
              height: 24,
            }}
          />
          <Chip
            size="small"
            icon={<IconCircleCheck size={13} />}
            label={`${attribCount} attribué${attribCount > 1 ? "s" : ""} à Lyrae`}
            sx={{
              bgcolor: BRAND,
              color: "#fff",
              fontWeight: 600,
              fontSize: 12,
              height: 24,
              "& .MuiChip-icon": { color: "#fff" },
            }}
          />
          {attribSansCode > 0 && (
            <Chip
              size="small"
              label={`${attribSansCode} attribué${
                attribSansCode > 1 ? "s" : ""
              } sans code RIS`}
              onClick={() => {
                setAttribFilter("yes");
                setCodeRisFilter("no");
              }}
              sx={{
                bgcolor: "#FFF4E5",
                color: "#B4602A",
                border: "1px solid #F5C79A",
                fontWeight: 600,
                fontSize: 12,
                height: 24,
                cursor: "pointer",
              }}
            />
          )}
          {dirtyCount > 0 && (
            <Chip
              size="small"
              label={`${dirtyCount} modification${dirtyCount > 1 ? "s" : ""} non enregistrée${
                dirtyCount > 1 ? "s" : ""
              }`}
              sx={{
                bgcolor: "#FFF4E5",
                color: "#8A5A00",
                fontWeight: 600,
                fontSize: 12,
                height: 24,
                border: `1px solid ${WARNING}`,
              }}
            />
          )}
        </Stack>
      </Box>

      {/* -------- Loading / Empty -------- */}
      {loading && (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress sx={{ color: BRAND }} />
        </Stack>
      )}

      {!loading && data.length === 0 && (
        <Box
          sx={{
            textAlign: "center",
            py: 8,
            border: `1.5px dashed ${BORDER}`,
            borderRadius: 3,
            bgcolor: SURFACE_MUTED,
            mt: 3,
          }}
        >
          <Typography sx={{ color: INK, fontWeight: 600 }}>
            Aucun examen à afficher
          </Typography>
          <Typography variant="body2" sx={{ color: INK_MUTED, mt: 1 }}>
            La liste de référence Neuracorp est vide pour ce centre.
          </Typography>
        </Box>
      )}

      {!loading && data.length > 0 && filtered.length === 0 && (
        <Box
          sx={{
            textAlign: "center",
            py: 5,
            border: `1px dashed ${BORDER}`,
            borderRadius: 2,
            bgcolor: SURFACE_MUTED,
            mt: 3,
          }}
        >
          <Typography variant="body2" sx={{ color: INK_MUTED }}>
            Aucun examen ne correspond à ces filtres.
          </Typography>
        </Box>
      )}

      {/* -------- Table -------- */}
      {!loading && filtered.length > 0 && (
        <Box
          sx={{
            mt: 3,
            border: `1px solid ${BORDER}`,
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          {enFiches ? (
            /* Écran étroit : une fiche par examen, tous ses champs visibles. */
            <Stack spacing={1.25} sx={{ p: 1.5 }}>
              {pageRows.map((row) => (
                <FicheExamen
                  key={row.codeExamen}
                  row={row}
                  disabled={readOnly}
                  onChange={handleChange}
                  typesClient={typesClient}
                />
              ))}
            </Stack>
          ) : (
            <TableContainer sx={{ maxHeight: "none" }}>
              <Table stickyHeader size="small" sx={{ minWidth: 1180 }}>
                <TableHead>
                  <TableRow>
                    <EnTeteMapping
                      aide="Le centre confie cet examen au robot. Décoché, le robot ne le propose pas au téléphone."
                      largeur={80}
                      align="center"
                    >
                      Attribué à Lyrae
                    </EnTeteMapping>
                    <EnTeteMapping aide="Notre référentiel : modalité, libellé et code internes.">
                      Examen
                    </EnTeteMapping>
                    <EnTeteMapping
                      aide="Le code de cet examen dans votre logiciel de gestion, et en dessous ce que le robot annonce au patient. Sans le code, l'examen n'est pas réservable."
                      largeur={220}
                    >
                      Code / Libellé patient
                    </EnTeteMapping>
                    <EnTeteMapping
                      aide="Le type dans votre logiciel. La liste propose ceux que vous avez déjà saisis. Facultatif."
                      largeur={130}
                    >
                      Type
                    </EnTeteMapping>
                    <EnTeteMapping
                      aide="Examen avec produit de contraste, scanners et IRM seulement. Cochez pour saisir le code de la version injectée."
                      largeur={150}
                    >
                      Injecté
                    </EnTeteMapping>
                    <EnTeteMapping
                      aide="Une consigne d'horaire annoncée avec le créneau."
                      largeur={220}
                    >
                      Créneau horaire
                    </EnTeteMapping>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageRows.map((row) => (
                    <ExamTableRow
                      key={row.codeExamen}
                      row={row}
                      disabled={readOnly}
                      onChange={handleChange}
                      typesClient={typesClient}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <TablePagination
            component="div"
            count={filtered.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={ROWS_PER_PAGE}
            rowsPerPageOptions={[ROWS_PER_PAGE]}
            labelDisplayedRows={({ from, to, count }) =>
              `${from} à ${to} sur ${count}`
            }
            sx={{
              borderTop: `1px solid ${BORDER}`,
              bgcolor: SURFACE_MUTED,
              "& .MuiTablePagination-toolbar": { minHeight: 44 },
            }}
          />
        </Box>
      )}

      <BarreEnregistrement
        modifications={dirtyCount}
        enregistrement={saving}
        onEnregistrer={handleSave}
        onAnnuler={handleReset}
        lectureSeule={readOnly}
        actions={
          <Button
            size="small"
            variant="outlined"
            startIcon={<IconSettings size={15} />}
            onClick={async () => {
              // router.push() est programmatique -> pas intercepte par le guard.
              // On confirme manuellement puis on disable() pour eviter un double
              // prompt lors de l'unmount.
              if (
                dirtyCount > 0 &&
                !(await confirmer({
                  titre: "Continuer sans enregistrer ?",
                  texte: `Vous avez ${dirtyCount} modification${dirtyCount > 1 ? "s" : ""} non enregistrée${dirtyCount > 1 ? "s" : ""}. Elles seront perdues.`,
                  libelleAction: "Continuer sans enregistrer",
                  destructif: true,
                }))
              )
                return;
              guard.disable();
              router.push(`${basePath}/parametrage/mapping_exam/type_exam`);
            }}
            disabled={saving}
            sx={{
              borderColor: BORDER,
              color: INK,
              "&:hover": {
                borderColor: BRAND,
                color: BRAND,
                bgcolor: SURFACE_HOVER,
              },
            }}
          >
            {readOnly ? "Types d'examens" : "Modifier types"}
          </Button>
        }
      />

      <Portal>
        {dialogue}
        <Retour
          ouvert={snack.open}
          message={snack.message}
          gravite={snack.severity}
          onFermer={() => setSnack((s) => ({ ...s, open: false }))}
        />
      </Portal>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Ligne de la table (memo-friendly)
// ---------------------------------------------------------------------------
/**
 * « Injecté » n'est PAS un champ de LyraeTalk, contrairement à Konnect : ici la
 * vérité est la présence d'un code d'injection. La case n'est donc qu'un volet
 * d'affichage, tenu en état local, qui ouvre le champ sur un examen qui n'a pas
 * encore de code. Cochée sans rien saisir, elle ne se retrouve pas au rechargement,
 * et c'est normal : il n'y aurait rien à enregistrer.
 *
 * Le tableau et la fiche partagent ce comportement, d'où ce bout de code commun.
 */
// Le prefixe `use` est impose par React, pas un anglicisme de confort : la regle
// `react-hooks/rules-of-hooks` ne reconnait un hook qu'a son nom. Meme convention que
// `useCentreProduit` et `useSuiviModifications` ailleurs dans le depot.
function useVoletInjection(code: string) {
  const [ouvert, setOuvert] = useState(false);
  return { injecte: ouvert || code.trim() !== "", setOuvert };
}

/** Ce que l'injection permet, et le message quand elle ne s'applique pas. */
function motifNonInjectable(typeExamen: string): string | undefined {
  return INJECTABLE_TYPES.has(typeExamen)
    ? undefined
    : "L'injection ne s'applique qu'aux scanners (CT) et IRM (MR)";
}

/**
 * L'examen en fiche, pour les écrans trop étroits pour le tableau.
 *
 * Mêmes champs, même ordre, mêmes libellés que les colonnes. C'est la même saisie,
 * dépliée : rien n'est retiré, rien n'est ajouté, et la bascule ne doit donc jamais
 * changer ce qu'on peut régler.
 */
function FicheExamen({ row, disabled, onChange, typesClient }: ExamRowProps) {
  const codeInjection = row.codeExamenClientInject ?? "";
  const { injecte, setOuvert } = useVoletInjection(codeInjection);
  const inactif = disabled || !row.performed;
  const nonApplicable = motifNonInjectable(row.typeExamen);

  return (
    <CarteMapping
      performed={!!row.performed}
      onPerformed={(v) => onChange(row.codeExamen, "performed", v)}
      typeExamen={row.typeExamen}
      libelle={row.libelle}
      codeExamen={row.codeExamen}
      disabled={disabled}
    >
      <RangeeChamp libelle="Code / Libellé">
        <CelluleCodeLibelle
          code={row.codeExamenClient ?? ""}
          libelle={row.libelleClient ?? ""}
          placeholderLibelle={row.libelle ?? ""}
          onCode={(v) => onChange(row.codeExamen, "codeExamenClient", v)}
          onLibelle={(v) => onChange(row.codeExamen, "libelleClient", v)}
          disabled={inactif}
        />
      </RangeeChamp>

      <RangeeChamp libelle="Type">
        <CelluleType
          valeur={row.typeExamenClient ?? ""}
          options={typesClient}
          onChange={(v) => onChange(row.codeExamen, "typeExamenClient", v)}
          disabled={inactif}
        />
      </RangeeChamp>

      <RangeeChamp libelle="Injecté">
        <CelluleInjection
          injecte={injecte}
          code={codeInjection}
          onInjecte={setOuvert}
          onCode={(v) =>
            onChange(
              row.codeExamen,
              "codeExamenClientInject",
              v === "" ? null : v,
            )
          }
          disabled={inactif}
          nonApplicable={nonApplicable}
        />
      </RangeeChamp>

      <RangeeChamp libelle="Créneau horaire">
        <HoraireCell
          horaire={row.horaire}
          disabled={inactif}
          onChange={(next) => onChange(row.codeExamen, "horaire", next)}
        />
      </RangeeChamp>
    </CarteMapping>
  );
}

interface ExamRowProps {
  row: ExamRow;
  disabled: boolean;
  onChange: (codeExamen: string, key: string, value: any) => void;
  /** Les types que ce client a déjà saisis, proposés dans la colonne « Type ». */
  typesClient: readonly string[];
}

/**
 * La ligne du tableau, alignée sur celle de LyraeKonnect (14/09/2026).
 *
 * Ce qui a changé, et qui vient de Konnect : la case « Attribué à Lyrae » ouvre la
 * ligne, la ligne s'estompe quand elle est décochée, et les champs du client s'y
 * désactivent. On coche d'abord, on saisit ensuite. Ce qui reste de LyraeTalk : le
 * code et le libellé l'un au-dessus de l'autre, et la colonne « Créneau horaire »,
 * qui n'existe pas chez Konnect.
 *
 * Les cellules communes vivent dans `components/mapping/cellules.tsx` ; la ligne,
 * elle, reste ici. Aucune règle de Konnect ne doit pouvoir descendre dans cet écran
 * par un composant partagé : c'est la leçon du 14/09/2026 sur le code RIS.
 */
function ExamTableRow({ row, disabled, onChange, typesClient }: ExamRowProps) {
  const codeInjection = row.codeExamenClientInject ?? "";
  const { injecte, setOuvert } = useVoletInjection(codeInjection);

  const inactif = disabled || !row.performed;

  return (
    <TableRow
      hover
      sx={{
        "&:nth-of-type(odd)": { bgcolor: "#FBFDFC" },
        "&:hover": { bgcolor: SURFACE_HOVER + " !important" },
        "& > td": { borderBottom: `1px solid ${BORDER}`, py: 1 },
        // Repris de Konnect : une ligne non confiée au robot s'efface du regard sans
        // disparaître du tableau.
        opacity: row.performed ? 1 : 0.45,
      }}
    >
      {/* Attribué à Lyrae */}
      <TableCell align="center" sx={{ verticalAlign: "top", pt: 1.25 }}>
        <CaseMapping
          coche={!!row.performed}
          onChange={(v) => onChange(row.codeExamen, "performed", v)}
          disabled={disabled}
        />
      </TableCell>

      {/* Examen NEURACORP */}
      <TableCell sx={{ verticalAlign: "top" }}>
        <CelluleExamen
          typeExamen={row.typeExamen}
          libelle={row.libelle}
          codeExamen={row.codeExamen}
        />
      </TableCell>

      {/* Code et libellé du client, l'un au-dessus de l'autre */}
      <TableCell sx={{ verticalAlign: "top" }}>
        <CelluleCodeLibelle
          code={row.codeExamenClient ?? ""}
          libelle={row.libelleClient ?? ""}
          placeholderLibelle={row.libelle ?? ""}
          onCode={(v) => onChange(row.codeExamen, "codeExamenClient", v)}
          onLibelle={(v) => onChange(row.codeExamen, "libelleClient", v)}
          disabled={inactif}
        />
      </TableCell>

      {/* Type du client */}
      <TableCell sx={{ verticalAlign: "top" }}>
        <CelluleType
          valeur={row.typeExamenClient ?? ""}
          options={typesClient}
          onChange={(v) => onChange(row.codeExamen, "typeExamenClient", v)}
          disabled={inactif}
        />
      </TableCell>

      {/* Injecté, et le code qui n'apparaît qu'une fois coché */}
      <TableCell sx={{ verticalAlign: "top" }}>
        <CelluleInjection
          injecte={injecte}
          code={codeInjection}
          onInjecte={setOuvert}
          onCode={(v) =>
            onChange(
              row.codeExamen,
              "codeExamenClientInject",
              v === "" ? null : v,
            )
          }
          disabled={inactif}
          nonApplicable={motifNonInjectable(row.typeExamen)}
        />
      </TableCell>

      {/* Créneau horaire, propre à LyraeTalk */}
      <TableCell sx={{ verticalAlign: "top" }}>
        <HoraireCell
          horaire={row.horaire}
          disabled={inactif}
          onChange={(next) => onChange(row.codeExamen, "horaire", next)}
        />
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Cellule "Creneau horaire" : bloc conditionnel compact
// ---------------------------------------------------------------------------
function HoraireCell({
  horaire,
  disabled,
  onChange,
}: {
  horaire: HoraireConfig;
  disabled: boolean;
  onChange: (next: HoraireConfig) => void;
}) {
  const enabled = !!horaire?.enabled;

  return (
    <Stack spacing={0.75}>
      <Stack direction="row" alignItems="center" spacing={0.75}>
        <Switch
          size="small"
          checked={enabled}
          onChange={(e) => onChange({ ...horaire, enabled: e.target.checked })}
          disabled={disabled}
          sx={{
            "& .MuiSwitch-switchBase.Mui-checked": { color: BRAND },
            "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
              bgcolor: BRAND,
              opacity: 1,
            },
            "& .MuiSwitch-track": { bgcolor: "#CBD5DB", opacity: 1 },
          }}
        />
        <Typography
          variant="caption"
          sx={{ color: enabled ? INK : INK_MUTED, fontWeight: 500 }}
        >
          {enabled ? "Contrainte active" : "Aucune contrainte"}
        </Typography>
      </Stack>

      {enabled && (
        <Stack direction="row" spacing={0.5}>
          <Select
            size="small"
            value={horaire.position || "below"}
            onChange={(e) =>
              onChange({
                ...horaire,
                position: e.target.value as "below" | "above",
              })
            }
            disabled={disabled}
            sx={{
              flex: 1,
              fontSize: 12,
              bgcolor: SURFACE,
              "& fieldset": { borderColor: BORDER },
              "&:hover fieldset": { borderColor: "#B9C7CE" },
              "& .MuiSelect-select": { py: 0.75, px: 1 },
            }}
          >
            <MenuItem value="below" sx={{ fontSize: 12 }}>
              Avant
            </MenuItem>
            <MenuItem value="above" sx={{ fontSize: 12 }}>
              Après
            </MenuItem>
          </Select>
          <TextField
            type="time"
            size="small"
            value={horaire.time || ""}
            onChange={(e) => onChange({ ...horaire, time: e.target.value })}
            disabled={disabled}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <IconClock size={13} color={INK_MUTED} />
                </InputAdornment>
              ),
            }}
            sx={{
              width: 116,
              "& .MuiOutlinedInput-root": {
                bgcolor: SURFACE,
                fontSize: 12,
                "& fieldset": { borderColor: BORDER },
                "&:hover fieldset": { borderColor: "#B9C7CE" },
                "&.Mui-focused fieldset": {
                  borderColor: BRAND,
                  borderWidth: 1.5,
                },
              },
              "& .MuiOutlinedInput-input": { py: 0.75, px: 0.5 },
            }}
          />
        </Stack>
      )}
    </Stack>
  );
}
