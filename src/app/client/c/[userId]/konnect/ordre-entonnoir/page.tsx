"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { IconArrowUp, IconArrowDown, IconPinnedOff } from "@tabler/icons-react";
import AddIcon from "@mui/icons-material/Add";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import ExamTypeBadge, {
  EXAM_TYPE_LABELS,
  toExamTypeCode,
} from "@/components/shared/ExamTypeBadge";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useSuiviModifications } from "@/hooks/useSuiviModifications";

/**
 * Ordre d'affichage de l'entonnoir patient (lot E).
 *
 * L'entonnoir demande d'abord une modalité, puis un examen. Cet écran règle
 * l'ordre des boutons : celui des modalités, et les examens que le centre veut
 * voir remonter en tête.
 *
 * Il ne masque jamais rien. Un examen non épinglé reste proposé, à sa place
 * habituelle. C'est purement de la mise en avant, et c'est ce qui rend l'écran
 * sans risque : au pire l'ordre est bancal, jamais un examen ne disparaît.
 *
 * Passe par le socle générique (`/api/product-config`), donc sans table ni route
 * dédiées. Konnect traduit les codes d'examens en identifiants de son référentiel
 * à la synchronisation : le Dashboard n'en voit jamais.
 */

const DOMAINE = "konnect.entonnoir-ordre";

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";

/** Ordre de repli du portail (`pivot/service.py`, `_MODALITE_ORDRE`). */
const MODALITES_DEFAUT = ["RX", "US", "MR", "CT", "MG", "OT"];

type Item = { portee: string; cle: string; rang: number };
type Examen = { code: string; libelle: string; type: string | null };

/** Une ligne déplaçable, avec ses deux flèches et son libellé. */
function LigneOrdonnee({
  children,
  premier,
  dernier,
  onMonter,
  onDescendre,
  onRetirer,
}: {
  children: React.ReactNode;
  premier: boolean;
  dernier: boolean;
  onMonter: () => void;
  onDescendre: () => void;
  onRetirer?: () => void;
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        px: 1.5,
        py: 1,
        borderBottom: `1px solid ${BORDER}`,
        "&:last-of-type": { borderBottom: "none" },
        "&:nth-of-type(odd)": { bgcolor: "#FBFDFC" },
      }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>{children}</Box>
      <Tooltip title="Monter">
        <span>
          <IconButton size="small" disabled={premier} onClick={onMonter}>
            <IconArrowUp size={16} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Descendre">
        <span>
          <IconButton size="small" disabled={dernier} onClick={onDescendre}>
            <IconArrowDown size={16} />
          </IconButton>
        </span>
      </Tooltip>
      {onRetirer && (
        <Tooltip title="Ne plus mettre en avant">
          <IconButton size="small" onClick={onRetirer}>
            <IconPinnedOff size={16} />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

function deplacer<T>(liste: T[], index: number, delta: number): T[] {
  const cible = index + delta;
  if (cible < 0 || cible >= liste.length) return liste;
  const copie = [...liste];
  [copie[index], copie[cible]] = [copie[cible], copie[index]];
  return copie;
}

export default function OrdreEntonnoirKonnect() {
  const { userProductId } = useCentreProduit();

  const [modalites, setModalites] = useState<string[]>(MODALITES_DEFAUT);
  const [epingles, setEpingles] = useState<string[]>([]);
  const [initial, setInitial] = useState<{ modalites: string[]; epingles: string[] } | null>(
    null
  );
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
        const [rConfig, rExamens] = await Promise.all([
          fetch(`/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`),
          fetch(`/api/konnect-examens?userProductId=${userProductId}`),
        ]);
        if (!rConfig.ok) throw new Error("Chargement impossible.");
        const dConfig = await rConfig.json();
        if (annule) return;

        const items: Item[] = Array.isArray(dConfig?.valeur?.items) ? dConfig.valeur.items : [];
        const tries = [...items].sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));

        // Les modalités enregistrées d'abord, puis celles que le centre n'a jamais
        // ordonnées : aucune ne doit disparaître de l'écran.
        const enregistrees = tries
          .filter((i) => i.portee === "modalite" && MODALITES_DEFAUT.includes(i.cle))
          .map((i) => i.cle);
        const mods = [
          ...enregistrees,
          ...MODALITES_DEFAUT.filter((m) => !enregistrees.includes(m)),
        ];
        const pins = tries.filter((i) => i.portee === "examen_pivot").map((i) => i.cle);

        setModalites(mods);
        setEpingles(pins);
        setInitial({ modalites: mods, epingles: pins });

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
                type:
                  toExamTypeCode(String(e.typeExamenClient ?? "").trim()) ??
                  toExamTypeCode(String(e.typeExamen ?? "").trim()),
              }))
          );
        }
      } catch {
        if (!annule) setErreur("Impossible de charger l'ordre de l'entonnoir.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const infoExamen = useMemo(() => {
    const m = new Map(examens.map((e) => [e.code, e]));
    return (code: string): Examen => m.get(code) ?? { code, libelle: code, type: null };
  }, [examens]);

  const disponibles = useMemo(
    () => examens.filter((e) => !epingles.includes(e.code)),
    [examens, epingles]
  );

  const etatSuivi = useMemo(() => {
    const out: Record<string, unknown> = {};
    modalites.forEach((m, i) => {
      out[`modalite:${m}`] = i;
    });
    epingles.forEach((c, i) => {
      out[`examen:${c}`] = i;
    });
    return out;
  }, [modalites, epingles]);

  const { modifications, marquerEnregistre } = useSuiviModifications(etatSuivi, !chargement);

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      // Rangs espacés de 10 : on peut réinsérer une entrée entre deux sans tout
      // renuméroter. Les examens démarrent après les modalités, les deux portées
      // étant classées séparément par le portail.
      const items: Item[] = [
        ...modalites.map((cle, i) => ({ portee: "modalite", cle, rang: (i + 1) * 10 })),
        ...epingles.map((cle, i) => ({ portee: "examen_pivot", cle, rang: (i + 1) * 10 })),
      ];
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: { items } }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setInitial({ modalites, epingles });
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
      <PageContainer title="Ordre de l'entonnoir" description="L'ordre des boutons patient">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Ordre de l'entonnoir" description="L'ordre des boutons patient">
      <Box>
        <SectionHeader
          title="Ordre de l'entonnoir"
          subtitle="Ce que le patient voit en premier quand il cherche son examen"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5 }}>
          Le patient choisit d&apos;abord un type d&apos;examen, puis l&apos;examen
          lui-même. Vous réglez ici l&apos;ordre des boutons, et vous pouvez mettre en
          avant les examens que vous faites le plus souvent. Rien n&apos;est masqué :
          un examen non mis en avant reste proposé, à sa place habituelle.
        </Typography>

        <SectionHeader title="Types d'examens" subtitle="Du premier bouton au dernier" />
        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, mb: 4 }}>
          {modalites.map((m, i) => (
            <LigneOrdonnee
              key={m}
              premier={i === 0}
              dernier={i === modalites.length - 1}
              onMonter={() => setModalites((p) => deplacer(p, i, -1))}
              onDescendre={() => setModalites((p) => deplacer(p, i, 1))}
            >
              <Stack direction="row" alignItems="center" spacing={1.25}>
                <Typography sx={{ fontSize: 12, color: INK_MUTED, minWidth: 18 }}>
                  {i + 1}
                </Typography>
                <ExamTypeBadge type={m} variant="compact" />
                <Typography sx={{ fontSize: 13, color: INK }}>
                  {EXAM_TYPE_LABELS[m] ?? m}
                </Typography>
              </Stack>
            </LigneOrdonnee>
          ))}
        </Paper>

        <SectionHeader
          title="Examens mis en avant"
          subtitle="Ceux qui remontent en tête de liste"
        />

        {examens.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Aucun examen dans votre mapping. Complétez le mapping d&apos;examens pour
            pouvoir en mettre en avant.
          </Alert>
        )}

        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2 }}>
          {epingles.map((code, i) => {
            const ex = infoExamen(code);
            return (
              <LigneOrdonnee
                key={code}
                premier={i === 0}
                dernier={i === epingles.length - 1}
                onMonter={() => setEpingles((p) => deplacer(p, i, -1))}
                onDescendre={() => setEpingles((p) => deplacer(p, i, 1))}
                onRetirer={() => setEpingles((p) => p.filter((c) => c !== code))}
              >
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Typography sx={{ fontSize: 12, color: INK_MUTED, minWidth: 18 }}>
                    {i + 1}
                  </Typography>
                  {ex.type ? (
                    <ExamTypeBadge type={ex.type} variant="compact" />
                  ) : (
                    <Box sx={{ width: 26 }} />
                  )}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, color: INK }}>{ex.libelle}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>{code}</Typography>
                  </Box>
                </Stack>
              </LigneOrdonnee>
            );
          })}
          {epingles.length === 0 && (
            <Box sx={{ py: 4, textAlign: "center" }}>
              <Typography variant="body2" sx={{ color: INK_MUTED }}>
                Aucun examen mis en avant. Le portail garde son ordre habituel.
              </Typography>
            </Box>
          )}
        </Paper>

        <Stack direction="row" sx={{ mt: 2 }}>
          <Select
            size="small"
            displayEmpty
            value=""
            disabled={disponibles.length === 0}
            onChange={(ev) => {
              const code = String(ev.target.value);
              if (code) setEpingles((p) => [...p, code]);
            }}
            sx={{ minWidth: 380, fontSize: 13, bgcolor: SURFACE }}
            renderValue={() => (
              <Stack direction="row" alignItems="center" spacing={1}>
                <AddIcon fontSize="small" />
                <span>
                  {disponibles.length === 0
                    ? "Tous les examens sont déjà mis en avant"
                    : "Mettre un examen en avant"}
                </span>
              </Stack>
            )}
          >
            {disponibles.map((e) => (
              <MenuItem key={e.code} value={e.code}>
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  {e.type ? (
                    <ExamTypeBadge type={e.type} variant="compact" />
                  ) : (
                    <Box sx={{ width: 26 }} />
                  )}
                  <Box>
                    <Typography sx={{ fontSize: 13 }}>{e.libelle}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>{e.code}</Typography>
                  </Box>
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </Stack>

        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <BarreEnregistrement
          modifications={modifications}
          enregistrement={enregistrement}
          onEnregistrer={enregistrer}
          onAnnuler={
            initial
              ? () => {
                  setModalites(initial.modalites);
                  setEpingles(initial.epingles);
                }
              : undefined
          }
          libelle="Enregistrer l'ordre"
        />

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Ordre enregistré. Le portail patient l&apos;appliquera dans la minute.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
