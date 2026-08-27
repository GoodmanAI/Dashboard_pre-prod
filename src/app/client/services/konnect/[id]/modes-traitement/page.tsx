"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import { useParams } from "next/navigation";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

/**
 * Mode de traitement des demandes d'un centre LyraeKonnect (lot D).
 *
 * Deux niveaux : un réglage par famille d'examens, et des exceptions par examen
 * précis, qui priment. Ne rien régler laisse le patient réserver seul.
 *
 * Les examens de la liste d'exceptions viennent du mapping du centre : on ne
 * propose que ce que le client a effectivement attribué, pour qu'aucune exception
 * ne porte sur un code que son logiciel ne connaît pas.
 *
 * Même direction artistique que les écrans mapping et sites.
 */

const BRAND = "var(--accent)";
const BRAND_DARK = "var(--accent-press)";
const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";
const SURFACE_MUTED = "#F7FAFB";

const DEFAUT = "__defaut__";

/** Miroir de `FamilleExamen` côté Konnect. L'ordre est celui de l'écran. */
const FAMILLES: { cle: string; libelle: string }[] = [
  { cle: "irm", libelle: "IRM" },
  { cle: "scanner", libelle: "Scanner" },
  { cle: "radio", libelle: "Radiographie" },
  { cle: "echo", libelle: "Échographie" },
  { cle: "autre", libelle: "Autres examens" },
];

/** Miroir de `ModeTraitement` côté Konnect, dit dans les mots du client. */
const MODES: { cle: string; libelle: string; aide: string }[] = [
  {
    cle: "autonome",
    libelle: "Le patient réserve seul",
    aide: "Il choisit son créneau et le rendez-vous est posé tout de suite.",
  },
  {
    cle: "relecture",
    libelle: "Le patient réserve, vous relisez après",
    aide: "Le rendez-vous est posé, et le dossier arrive dans votre file de relecture.",
  },
  {
    cle: "orientation_directe",
    libelle: "Vous rappelez le patient",
    aide: "Aucun créneau ne lui est proposé. Sa demande vous est transmise.",
  },
];

type Ligne = { portee: string; cle: string; mode: string };
type Examen = { code: string; libelle: string };

function couleurMode(mode: string): { bg: string; fg: string } {
  if (mode === "relecture") return { bg: "#FFF4E0", fg: "#8A5A00" };
  if (mode === "orientation_directe") return { bg: "#FDE8E8", fg: "#9B2226" };
  return { bg: "#E8F5EE", fg: "#186A3B" };
}

function EnTete({
  children,
  aide,
  largeur,
}: {
  children: React.ReactNode;
  aide: string;
  largeur?: number;
}) {
  return (
    <Tooltip title={aide} placement="top">
      <TableCell
        sx={{
          bgcolor: SURFACE_MUTED,
          color: INK_MUTED,
          fontWeight: 600,
          fontSize: 11.5,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          borderBottom: `1px solid ${BORDER}`,
          width: largeur,
          whiteSpace: "nowrap",
          py: 1.25,
        }}
      >
        {children}
      </TableCell>
    </Tooltip>
  );
}

function ChoixMode({
  valeur,
  onChange,
  avecDefaut,
}: {
  valeur: string;
  onChange: (v: string) => void;
  avecDefaut: boolean;
}) {
  return (
    <Select
      size="small"
      fullWidth
      value={valeur}
      onChange={(e) => onChange(String(e.target.value))}
      sx={{ fontSize: 13, bgcolor: SURFACE }}
    >
      {avecDefaut && (
        <MenuItem value={DEFAUT}>
          <Box>
            <Typography sx={{ fontSize: 13 }}>Le patient réserve seul</Typography>
            <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>
              Le réglage par défaut, rien n&apos;est enregistré.
            </Typography>
          </Box>
        </MenuItem>
      )}
      {MODES.map((m) => (
        <MenuItem key={m.cle} value={m.cle}>
          <Box>
            <Typography sx={{ fontSize: 13 }}>{m.libelle}</Typography>
            <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>{m.aide}</Typography>
          </Box>
        </MenuItem>
      ))}
    </Select>
  );
}

export default function ModesTraitementKonnect() {
  const params = useParams();
  const userProductId = Number(params?.id);

  const [familles, setFamilles] = useState<Record<string, string>>({});
  const [exceptions, setExceptions] = useState<Ligne[]>([]);
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
        const [rModes, rExamens] = await Promise.all([
          fetch(`/api/konnect-modes-traitement?userProductId=${userProductId}`),
          fetch(`/api/konnect-examens?userProductId=${userProductId}`),
        ]);
        if (!rModes.ok) throw new Error("Chargement impossible.");
        const dModes = await rModes.json();
        const lignes: Ligne[] = Array.isArray(dModes.modes) ? dModes.modes : [];

        if (annule) return;
        const parFamille: Record<string, string> = {};
        for (const f of FAMILLES) parFamille[f.cle] = DEFAUT;
        for (const l of lignes) {
          if (l.portee === "famille" && l.cle in parFamille) parFamille[l.cle] = l.mode;
        }
        setFamilles(parFamille);
        setExceptions(lignes.filter((l) => l.portee === "examen"));

        // La liste d'examens n'est pas indispensable : sans elle on garde les
        // exceptions déjà enregistrées, on ne peut simplement pas en ajouter.
        if (rExamens.ok) {
          const dEx = await rExamens.json();
          const brut: any[] = Array.isArray(dEx.examens) ? dEx.examens : [];
          setExamens(
            brut
              .filter((e) => e?.performed !== false && String(e?.codeExamenClient ?? "").trim())
              .map((e) => ({
                code: String(e.codeExamenClient).trim(),
                libelle:
                  String(e.libelleClient ?? "").trim() ||
                  String(e.libelle ?? "").trim() ||
                  String(e.codeExamenClient).trim(),
              }))
          );
        }
      } catch {
        if (!annule) setErreur("Impossible de charger les modes de traitement.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const dejaPris = useMemo(() => new Set(exceptions.map((e) => e.cle)), [exceptions]);
  const disponibles = useMemo(
    () => examens.filter((e) => !dejaPris.has(e.code)),
    [examens, dejaPris]
  );

  const libelleExamen = useMemo(() => {
    const m = new Map(examens.map((e) => [e.code, e.libelle]));
    return (code: string) => m.get(code) ?? code;
  }, [examens]);

  const incompletes = exceptions.some((e) => !e.cle.trim());

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const modes: Ligne[] = [
        ...FAMILLES.filter((f) => familles[f.cle] && familles[f.cle] !== DEFAUT).map((f) => ({
          portee: "famille",
          cle: f.cle,
          mode: familles[f.cle],
        })),
        ...exceptions.filter((e) => e.cle.trim()),
      ];
      const r = await fetch(`/api/konnect-modes-traitement?userProductId=${userProductId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modes }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <PageContainer title="Modes de traitement" description="Ce qui arrive à une demande">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: BRAND }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Modes de traitement" description="Ce qui arrive à une demande">
      <Box>
        <SectionHeader
          title="Modes de traitement"
          subtitle="Ce qui se passe quand un patient demande un rendez-vous"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5 }}>
          Par défaut le patient choisit son créneau et le rendez-vous est posé. Vous
          pouvez changer ça pour toute une famille d&apos;examens, et faire des
          exceptions sur un examen précis. L&apos;exception l&apos;emporte toujours sur
          la famille.
        </Typography>

        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ overflowX: "auto", borderColor: BORDER, borderRadius: 2 }}
        >
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead>
              <TableRow>
                <EnTete aide="La famille d'examens concernée." largeur={220}>
                  Famille d&apos;examens
                </EnTete>
                <EnTete aide="Ce qui se passe quand un patient demande un examen de cette famille.">
                  Traitement de la demande
                </EnTete>
              </TableRow>
            </TableHead>
            <TableBody>
              {FAMILLES.map((f, i) => (
                <TableRow
                  key={f.cle}
                  hover
                  sx={{
                    "&:nth-of-type(odd)": { bgcolor: "#FBFDFC" },
                    "& > td": { borderBottom: `1px solid ${BORDER}`, py: 1 },
                  }}
                >
                  <TableCell>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
                      {f.libelle}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <ChoixMode
                      valeur={familles[f.cle] ?? DEFAUT}
                      avecDefaut
                      onChange={(v) => setFamilles((p) => ({ ...p, [f.cle]: v }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ mt: 4 }}>
          <SectionHeader
            title="Exceptions par examen"
            subtitle="Pour un examen qui ne suit pas la règle de sa famille"
          />

          {examens.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Aucun examen n&apos;a encore de code renseigné dans le mapping. Complétez
              le mapping d&apos;examens pour pouvoir faire des exceptions.
            </Alert>
          )}

          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ overflowX: "auto", borderColor: BORDER, borderRadius: 2 }}
          >
            <Table size="small" sx={{ minWidth: 700 }}>
              <TableHead>
                <TableRow>
                  <EnTete aide="L'examen concerné, tel qu'il est nommé dans votre mapping." largeur={320}>
                    Examen
                  </EnTete>
                  <EnTete aide="Ce qui se passe pour cet examen, quelle que soit sa famille.">
                    Traitement de la demande
                  </EnTete>
                  <TableCell
                    sx={{ width: 56, bgcolor: SURFACE_MUTED, borderBottom: `1px solid ${BORDER}` }}
                  />
                </TableRow>
              </TableHead>
              <TableBody>
                {exceptions.map((e, i) => {
                  const c = couleurMode(e.mode);
                  return (
                    <TableRow
                      key={`${e.cle}-${i}`}
                      hover
                      sx={{
                        "&:nth-of-type(odd)": { bgcolor: "#FBFDFC" },
                        "& > td": { borderBottom: `1px solid ${BORDER}`, py: 1 },
                      }}
                    >
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography sx={{ fontSize: 13, color: INK }}>
                            {libelleExamen(e.cle)}
                          </Typography>
                          <Chip
                            label={e.cle}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: 11,
                              bgcolor: c.bg,
                              color: c.fg,
                              fontWeight: 600,
                            }}
                          />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <ChoixMode
                          valeur={e.mode}
                          avecDefaut={false}
                          onChange={(v) =>
                            setExceptions((p) =>
                              p.map((x, j) => (j === i ? { ...x, mode: v } : x))
                            )
                          }
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Retirer cette exception">
                          <IconButton
                            size="small"
                            onClick={() =>
                              setExceptions((p) => p.filter((_, j) => j !== i))
                            }
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {exceptions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 5 }}>
                      <Typography variant="body2" sx={{ color: INK_MUTED }}>
                        Aucune exception. Tous les examens suivent la règle de leur famille.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
            <Select
              size="small"
              displayEmpty
              value=""
              disabled={disponibles.length === 0}
              onChange={(ev) => {
                const code = String(ev.target.value);
                if (!code) return;
                setExceptions((p) => [
                  ...p,
                  { portee: "examen", cle: code, mode: "relecture" },
                ]);
              }}
              sx={{ minWidth: 340, fontSize: 13, bgcolor: SURFACE }}
              renderValue={() => (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <AddIcon fontSize="small" />
                  <span>
                    {disponibles.length === 0
                      ? "Tous les examens ont déjà une exception"
                      : "Ajouter une exception"}
                  </span>
                </Stack>
              )}
            >
              {disponibles.map((e) => (
                <MenuItem key={e.code} value={e.code}>
                  <Box>
                    <Typography sx={{ fontSize: 13 }}>{e.libelle}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>{e.code}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </Stack>
        </Box>

        {incompletes && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Une exception n&apos;a pas d&apos;examen. Choisissez-en un ou retirez la ligne.
          </Alert>
        )}
        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            size="large"
            onClick={enregistrer}
            disabled={enregistrement || incompletes}
            sx={{
              bgcolor: BRAND,
              fontWeight: 600,
              textTransform: "none",
              px: 3,
              "&:hover": { bgcolor: BRAND_DARK },
              "&.Mui-disabled": { bgcolor: "#D5DFE5", color: "#8FA0AE" },
            }}
          >
            {enregistrement ? "Enregistrement en cours" : "Enregistrer les modes"}
          </Button>
        </Box>

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Modes enregistrés. Le portail patient les appliquera dans la minute.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
