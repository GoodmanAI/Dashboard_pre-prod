"use client";

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
  Snackbar,
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
} from "@mui/material";
import {
  IconArrowLeft,
  IconCircleCheck,
  IconClock,
  IconDeviceFloppy,
  IconInfoCircle,
  IconSearch,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTalkBasePath } from "@/utils/talkRoutes";
import ExamTypeBadge, {
  EXAM_TYPE_SHORT,
} from "@/components/shared/ExamTypeBadge";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

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
 */

const BRAND = "#48C8AF";
const BRAND_DARK = "#2C9B85";
const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";
const SURFACE_MUTED = "#F7FAFB";
const SURFACE_HOVER = "#F5FBFA";
const SURFACE_DISABLED = "#EEF2F5";
const DANGER = "#E1573B";
const WARNING = "#F5A623";

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

interface TalkPageProps {
  params: { id: string };
}

export default function MappingExam({ params }: TalkPageProps) {
  const router = useRouter();
  const userProductId = Number(params.id);
  const basePath = useTalkBasePath(userProductId);
  const { data: sessionData } = useSession();
  const readOnly = !!sessionData?.user?.isSecretary;

  const [data, setData] = useState<ExamRow[]>([]);
  const [originalData, setOriginalData] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  // Filtres UI
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [attribFilter, setAttribFilter] = useState<AttribFilter>("all");
  const [page, setPage] = useState(0);

  // ---- Fetch initial ----
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/configuration/get/mapping?userProductId=${userProductId}`
        );
        let rows: ExamRow[] = [];
        if (res.ok) {
          const json = await res.json();
          const formatted = Array.isArray(json) ? json : Object.values(json);
          rows = formatted.map((row: any) => ({
            ...row,
            typeExamenClient: row.typeExamenClient ?? "",
            performed: row.performed ?? true,
            codeExamenClientInject: row.codeExamenClientInject ?? null,
            horaire: row.horaire ?? { enabled: false, position: "below", time: "" },
          }));
        } else if (res.status === 404) {
          const fallbackRes = await fetch("/api/data/exams");
          rows = await fallbackRes.json();
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

  // ---- Filtrage ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((row) => {
      if (typeFilter !== "all" && row.typeExamen !== typeFilter) return false;
      if (attribFilter === "yes" && !row.performed) return false;
      if (attribFilter === "no" && row.performed) return false;
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
  }, [data, search, typeFilter, attribFilter]);

  const pageRows = useMemo(
    () => filtered.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE),
    [filtered, page]
  );

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [search, typeFilter, attribFilter]);

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
  const attribCount = useMemo(() => data.filter((r) => r.performed).length, [data]);

  // ---- Guard : previens l'utilisateur qui navigue avec des modifs non sauvees
  const guard = useUnsavedChangesGuard(dirtyCount > 0, {
    message: `Vous avez ${dirtyCount} modification${
      dirtyCount > 1 ? "s" : ""
    } non enregistrée${dirtyCount > 1 ? "s" : ""}. Voulez-vous vraiment quitter cette page sans sauvegarder ?`,
  });

  // ---- Handlers ----
  const handleChange = useCallback((codeExamen: string, key: string, value: any) => {
    setData((prev) =>
      prev.map((row) =>
        row.codeExamen === codeExamen ? { ...row, [key]: value } : row
      )
    );
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/configuration/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProductId, data }),
      });
      if (!response.ok) throw new Error("Failed to save");
      setOriginalData(JSON.parse(JSON.stringify(data)));
      setSnack({
        open: true,
        message: `${dirtyCount} modification${
          dirtyCount > 1 ? "s" : ""
        } enregistrée${dirtyCount > 1 ? "s" : ""}`,
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

  const handleReset = () => {
    if (!confirm(`Annuler les ${dirtyCount} modifications non sauvegardées ?`)) return;
    setData(JSON.parse(JSON.stringify(originalData)));
  };

  return (
    <Box sx={{ pb: 12, px: { xs: 2, sm: 3 }, py: 3 }}>
      {/* -------- Header -------- */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <IconButton
          onClick={() => {
            if (dirtyCount > 0) {
              const ok = confirm(
                `Vous avez ${dirtyCount} modification${
                  dirtyCount > 1 ? "s" : ""
                } non enregistrée${dirtyCount > 1 ? "s" : ""}. Quitter sans sauvegarder ?`
              );
              if (!ok) return;
            }
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
          Mode lecture seule — votre compte secrétaire ne permet pas de modifier
          la correspondance des examens.
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
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", md: "center" }}
        >
          {/* Recherche */}
          <TextField
            size="small"
            placeholder="Rechercher un examen, un code, un libellé…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              flex: 1,
              minWidth: { md: 320 },
              "& .MuiOutlinedInput-root": {
                bgcolor: SURFACE_MUTED,
                "& fieldset": { borderColor: BORDER },
                "&:hover fieldset": { borderColor: BRAND },
                "&.Mui-focused fieldset": { borderColor: BRAND, borderWidth: 2 },
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
                    <Typography variant="body2">{EXAM_TYPE_SHORT[t] ?? t}</Typography>
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
                textTransform: "none",
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
        </Stack>

        {/* KPIs ligne */}
        <Stack
          direction="row"
          spacing={2}
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
          <TableContainer sx={{ maxHeight: "none" }}>
            <Table stickyHeader size="small" sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow>
                  <HeaderCell width="26%">Examen (Neuracorp)</HeaderCell>
                  <HeaderCell width="18%">Code / Libellé côté client</HeaderCell>
                  <HeaderCell width="10%">Type client</HeaderCell>
                  <HeaderCell width="10%" align="center">
                    Attribué à Lyrae
                  </HeaderCell>
                  <HeaderCell width="16%">Code avec injection</HeaderCell>
                  <HeaderCell width="20%">Créneau horaire</HeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map((row) => (
                  <ExamTableRow
                    key={row.codeExamen}
                    row={row}
                    disabled={readOnly}
                    onChange={handleChange}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filtered.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={ROWS_PER_PAGE}
            rowsPerPageOptions={[ROWS_PER_PAGE]}
            labelDisplayedRows={({ from, to, count }) =>
              `${from}–${to} sur ${count}`
            }
            sx={{
              borderTop: `1px solid ${BORDER}`,
              bgcolor: SURFACE_MUTED,
              "& .MuiTablePagination-toolbar": { minHeight: 44 },
            }}
          />
        </Box>
      )}

      {/* -------- Sticky action bar en bas -------- */}
      <Box
        sx={{
          position: "fixed",
          bottom: 16,
          right: 24,
          zIndex: 10,
          display: "flex",
          gap: 1.5,
          bgcolor: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 3,
          px: 2,
          py: 1.25,
          boxShadow: "0 10px 30px rgba(15, 42, 63, 0.10)",
          alignItems: "center",
        }}
      >
        {dirtyCount > 0 && !readOnly && (
          <>
            <Typography variant="body2" sx={{ color: INK_MUTED, fontWeight: 500 }}>
              {dirtyCount} modif.
            </Typography>
            <Button
              onClick={handleReset}
              disabled={saving}
              size="small"
              sx={{
                textTransform: "none",
                color: INK_MUTED,
                "&:hover": { color: DANGER },
              }}
            >
              Annuler
            </Button>
          </>
        )}

        <Button
          size="small"
          variant="outlined"
          startIcon={<IconSettings size={15} />}
          onClick={() => {
            // router.push() est programmatique -> pas intercepte par le guard.
            // On confirme manuellement puis on disable() pour eviter un double
            // prompt lors de l'unmount.
            if (dirtyCount > 0) {
              const ok = confirm(
                `Vous avez ${dirtyCount} modification${
                  dirtyCount > 1 ? "s" : ""
                } non enregistrée${dirtyCount > 1 ? "s" : ""}. Continuer sans sauvegarder ?`
              );
              if (!ok) return;
            }
            guard.disable();
            router.push(`${basePath}/parametrage/mapping_exam/type_exam`);
          }}
          disabled={saving}
          sx={{
            textTransform: "none",
            borderColor: BORDER,
            color: INK,
            "&:hover": { borderColor: BRAND, color: BRAND, bgcolor: SURFACE_HOVER },
          }}
        >
          {readOnly ? "Types d'examens" : "Modifier types"}
        </Button>

        {!readOnly && (
          <Button
            size="small"
            variant="contained"
            startIcon={
              saving ? (
                <CircularProgress size={14} sx={{ color: "#fff" }} />
              ) : (
                <IconDeviceFloppy size={15} />
              )
            }
            onClick={handleSave}
            disabled={saving || dirtyCount === 0}
            disableElevation
            sx={{
              bgcolor: BRAND,
              color: "#fff",
              fontWeight: 600,
              textTransform: "none",
              px: 2.5,
              "&:hover": { bgcolor: BRAND_DARK },
              "&.Mui-disabled": { bgcolor: "#D5DFE5", color: "#8FA0AE" },
            }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        )}
      </Box>

      <Portal>
        <Snackbar
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          open={snack.open}
          autoHideDuration={3000}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          <Alert
            severity={snack.severity}
            variant="filled"
            sx={{
              fontWeight: 500,
              bgcolor: snack.severity === "error" ? DANGER : BRAND_DARK,
            }}
          >
            {snack.message}
          </Alert>
        </Snackbar>
      </Portal>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Header cell (stylee)
// ---------------------------------------------------------------------------
function HeaderCell({
  children,
  width,
  align = "left",
}: {
  children: React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
}) {
  return (
    <TableCell
      align={align}
      sx={{
        bgcolor: SURFACE_MUTED,
        color: INK_MUTED,
        fontWeight: 600,
        fontSize: 11.5,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        borderBottom: `1px solid ${BORDER}`,
        width,
        py: 1.25,
      }}
    >
      {children}
    </TableCell>
  );
}

// ---------------------------------------------------------------------------
// Ligne de la table (memo-friendly)
// ---------------------------------------------------------------------------
interface ExamRowProps {
  row: ExamRow;
  disabled: boolean;
  onChange: (codeExamen: string, key: string, value: any) => void;
}

function ExamTableRow({ row, disabled, onChange }: ExamRowProps) {
  const isInjectable = INJECTABLE_TYPES.has(row.typeExamen);

  return (
    <TableRow
      hover
      sx={{
        "&:nth-of-type(odd)": { bgcolor: "#FBFDFC" },
        "&:hover": { bgcolor: SURFACE_HOVER + " !important" },
        "& > td": { borderBottom: `1px solid ${BORDER}`, py: 1 },
      }}
    >
      {/* Examen NEURACORP */}
      <TableCell sx={{ verticalAlign: "top" }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ExamTypeBadge type={row.typeExamen} />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: 13,
                color: INK,
                lineHeight: 1.3,
              }}
            >
              {row.libelle}
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                color: INK_MUTED,
                fontFamily: "monospace",
                mt: 0.25,
              }}
            >
              {row.codeExamen}
            </Typography>
          </Box>
        </Stack>
      </TableCell>

      {/* Code / Libelle client (2 champs stackes) */}
      <TableCell sx={{ verticalAlign: "top" }}>
        <Stack spacing={0.75}>
          <CompactInput
            placeholder="Code"
            value={row.codeExamenClient ?? ""}
            onChange={(v) => onChange(row.codeExamen, "codeExamenClient", v)}
            disabled={disabled}
            monospace
          />
          <CompactInput
            placeholder="Libellé"
            value={row.libelleClient ?? ""}
            onChange={(v) => onChange(row.codeExamen, "libelleClient", v)}
            disabled={disabled}
          />
        </Stack>
      </TableCell>

      {/* Type client */}
      <TableCell sx={{ verticalAlign: "top" }}>
        <CompactInput
          placeholder="Ex : RX"
          value={row.typeExamenClient ?? ""}
          onChange={(v) => onChange(row.codeExamen, "typeExamenClient", v)}
          disabled={disabled}
          monospace
        />
      </TableCell>

      {/* Attribue a Lyrae */}
      <TableCell align="center" sx={{ verticalAlign: "top", pt: 1.5 }}>
        <Switch
          size="small"
          checked={!!row.performed}
          onChange={(e) => onChange(row.codeExamen, "performed", e.target.checked)}
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
      </TableCell>

      {/* Code avec injection */}
      <TableCell sx={{ verticalAlign: "top" }}>
        {isInjectable ? (
          <CompactInput
            placeholder="Code injection"
            value={row.codeExamenClientInject ?? ""}
            onChange={(v) =>
              onChange(row.codeExamen, "codeExamenClientInject", v === "" ? null : v)
            }
            disabled={disabled}
            monospace
          />
        ) : (
          <Tooltip
            title="L'injection ne s'applique qu'aux scanners (CT) et IRM (MR)"
            arrow
          >
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.75}
              sx={{
                bgcolor: SURFACE_DISABLED,
                border: `1px dashed ${BORDER}`,
                borderRadius: 1,
                px: 1,
                py: 0.75,
                color: INK_MUTED,
              }}
            >
              <IconInfoCircle size={13} />
              <Typography sx={{ fontSize: 12 }}>
                Non applicable
              </Typography>
            </Stack>
          </Tooltip>
        )}
      </TableCell>

      {/* Creneau horaire */}
      <TableCell sx={{ verticalAlign: "top" }}>
        <HoraireCell
          horaire={row.horaire}
          disabled={disabled}
          onChange={(next) => onChange(row.codeExamen, "horaire", next)}
        />
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Input compact stylise (tres dense pour tenir dans la table)
// ---------------------------------------------------------------------------
function CompactInput({
  value,
  onChange,
  placeholder,
  disabled,
  monospace = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  monospace?: boolean;
}) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      size="small"
      fullWidth
      disabled={disabled}
      variant="outlined"
      sx={{
        "& .MuiOutlinedInput-root": {
          bgcolor: SURFACE,
          fontSize: 13,
          ...(monospace && { fontFamily: "monospace" }),
          "& fieldset": { borderColor: BORDER },
          "&:hover fieldset": { borderColor: "#B9C7CE" },
          "&.Mui-focused fieldset": { borderColor: BRAND, borderWidth: 1.5 },
          "&.Mui-disabled": { bgcolor: SURFACE_DISABLED },
        },
        "& .MuiOutlinedInput-input": {
          py: 0.75,
          px: 1,
        },
      }}
    />
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
              onChange({ ...horaire, position: e.target.value as "below" | "above" })
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
            <MenuItem value="below" sx={{ fontSize: 12 }}>Avant</MenuItem>
            <MenuItem value="above" sx={{ fontSize: 12 }}>Après</MenuItem>
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
                "&.Mui-focused fieldset": { borderColor: BRAND, borderWidth: 1.5 },
              },
              "& .MuiOutlinedInput-input": { py: 0.75, px: 0.5 },
            }}
          />
        </Stack>
      )}
    </Stack>
  );
}
