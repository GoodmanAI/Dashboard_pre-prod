"use client";

import { useConfirmation } from "@/components/shared/DialogConfirmation";
import Retour from "@/components/shared/Retour";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  Portal,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { IconArrowLeft, IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { useDroitPage } from "@/hooks/useDroitPage";
import { PAGES } from "@/lib/permissions";
import ExamTypeBadge, {
  EXAM_TYPE_LABELS,
} from "@/components/shared/ExamTypeBadge";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
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
 * Correspondance des Types d'examens (diminutifs) - refonte 2026-08-06.
 * -----------------------------------------------------------------------------
 * Le "diminutif" est le code court utilise par le logiciel de gestion du centre
 * pour designer un type d'examen (ex: DX pour la radio chez RIM29SUD). Il est
 * remonte dans les statistiques d'appel, ou il sert a retrouver le libelle.
 *
 * L'IDENTITE D'UNE LIGNE EST SON CODE CANONIQUE (US/MG/RX/MR/CT), jamais sa
 * position. Cet ecran indexait autrefois les libelles sur le rang de la ligne
 * renvoyee par l'API : les cinq lignes d'un centre neuf recevaient toutes le
 * libelle "Scanner", et la liste des appels affichait ensuite chaque mammo et
 * chaque echo comme un scanner (constate sur le groupe Quimper le 2026-09-04).
 * On boucle donc sur EXAM_LIST, et on ne lit plus jamais l'ordre de l'API.
 *
 * Design aligne sur /parametrage/mapping_exam (chantier UI 2026-08-06) :
 * badges couleur ExamTypeBadge partages, save bar sticky, guard modifs.
 */

// Ordre d'affichage (indice dans la reponse API mappe sur cette liste).
const EXAM_LIST: { label: string; typeCode: string; description: string }[] = [
  {
    label: "Échographie",
    typeCode: "US",
    description: "Examen par ondes ultrasonores.",
  },
  {
    label: "Mammographie",
    typeCode: "MG",
    description: "Radiographie ciblée sur le sein.",
  },
  {
    label: "Radiographie",
    typeCode: "RX",
    description: "Radiographie classique aux rayons X.",
  },
  {
    label: "IRM",
    typeCode: "MR",
    description: "Imagerie par résonance magnétique.",
  },
  {
    label: "Scanner",
    typeCode: "CT",
    description: "Scanner à rayons X (CT scan).",
  },
];

interface TalkPageProps {
  params: { id: string };
}

interface Mapping {
  [code: string]: { fr: string; diminutif: string };
}

export default function EditTypeExam({ params }: TalkPageProps) {
  const userProductId = Number(params.id);
  const router = useRouter();
  // Lecture seule, revue le 15/09/2026 : elle se lisait sur le seul booleen
  // herite `isSecretary`, donc un sous-compte moderne cree avec cette page en
  // lecture voyait tous ses champs actifs et decouvrait le refus a
  // l'enregistrement. `useDroitPage` couvre les deux cas.
  const { peutEcrire, raisonLectureSeule } = useDroitPage(PAGES.MAPPING_EXAM);
  const readOnly = !peutEcrire;

  const [mapping, setMapping] = useState<Mapping>({});
  const [originalMapping, setOriginalMapping] = useState<Mapping>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { confirmer, dialogue } = useConfirmation();
  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/configuration/mapping/type_exam?userProductId=${userProductId}`,
        );
        const data = await res.json();
        // On part de EXAM_LIST, pas de ce que renvoie l'API : le type d'une
        // ligne est son code, et l'ordre de la reponse ne dit rien.
        const mapped: Mapping = Object.fromEntries(
          EXAM_LIST.map(({ typeCode, label }) => [
            typeCode,
            {
              fr: label,
              diminutif: data?.[typeCode]?.diminutif ?? typeCode,
            },
          ]),
        );
        setMapping(mapped);
        setOriginalMapping(JSON.parse(JSON.stringify(mapped)));
      } catch {
        setSnack({
          open: true,
          message:
            "Les types d'examens n'ont pas pu être chargés. Rechargez la page.",
          severity: "error",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [userProductId]);

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const code of Object.keys(mapping)) {
      if (mapping[code]?.diminutif !== originalMapping[code]?.diminutif) n++;
    }
    return n;
  }, [mapping, originalMapping]);

  const guard = useUnsavedChangesGuard(dirtyCount > 0, {
    message: `Vos ${dirtyCount} modification${dirtyCount > 1 ? "s" : ""} non enregistrée${
      dirtyCount > 1 ? "s" : ""
    } seront perdues.`,
  });

  const handleChange = (code: string, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [code]: { ...prev[code], diminutif: value.toUpperCase() },
    }));
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
    setMapping(JSON.parse(JSON.stringify(originalMapping)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/configuration/mapping/type_exam?userProductId=${userProductId}`,
        {
          method: "POST",
          body: JSON.stringify(mapping),
          headers: { "Content-Type": "application/json" },
        },
      );
      if (!response.ok) throw new Error("Save failed");
      setOriginalMapping(JSON.parse(JSON.stringify(mapping)));
      setSnack({
        open: true,
        message: `${dirtyCount} diminutif${
          dirtyCount > 1 ? "s" : ""
        } enregistré${dirtyCount > 1 ? "s" : ""}`,
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

  const entries = Object.entries(mapping);

  return (
    <Box sx={{ pb: 12, px: { xs: 2, sm: 3 }, py: 3 }}>
      {guard.dialogue}
      {/* Header */}
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
            Diminutifs des types d&apos;examens
          </Typography>
          <Typography variant="body2" sx={{ color: INK_MUTED, mt: 0.25 }}>
            Code court utilisé par le bot Lyrae pour identifier chaque modalité
            d&apos;imagerie (radiographie, échographie…). Ces diminutifs sont
            techniques et n&apos;apparaissent pas au patient.
          </Typography>
        </Box>
      </Stack>

      {readOnly && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          {raisonLectureSeule}
        </Alert>
      )}

      {/* KPI bar */}
      {!loading && dirtyCount > 0 && (
        <Box sx={{ mb: 2 }}>
          <Chip
            size="small"
            label={`${dirtyCount} modification${
              dirtyCount > 1 ? "s" : ""
            } non enregistrée${dirtyCount > 1 ? "s" : ""}`}
            sx={{
              bgcolor: "#FFF4E5",
              color: "#8A5A00",
              fontWeight: 600,
              fontSize: 12,
              height: 24,
              border: `1px solid ${WARNING}`,
            }}
          />
        </Box>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress sx={{ color: BRAND }} />
        </Stack>
      ) : entries.length === 0 ? (
        <Box
          sx={{
            textAlign: "center",
            py: 8,
            border: `1.5px dashed ${BORDER}`,
            borderRadius: 3,
            bgcolor: SURFACE_MUTED,
          }}
        >
          <Typography sx={{ color: INK, fontWeight: 600 }}>
            Aucun type d&apos;examen configuré
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.5} sx={{ maxWidth: 720 }}>
          {entries.map(([code, item]) => {
            // `code` EST le code canonique : on retrouve le type par la clé,
            // jamais par le rang de la ligne.
            const meta = EXAM_LIST.find((e) => e.typeCode === code);
            const typeCode = meta?.typeCode ?? code;
            const label = meta?.label ?? item.fr;
            const description = meta?.description ?? "";
            const original = originalMapping[code]?.diminutif ?? "";
            const changed = item.diminutif !== original;

            return (
              <Card
                key={code}
                elevation={0}
                sx={{
                  p: 2,
                  border: `1px solid ${changed ? BRAND : BORDER}`,
                  borderRadius: 2,
                  bgcolor: SURFACE,
                  transition: "all 0.15s ease",
                  "&:hover": {
                    borderColor: changed ? BRAND : "#C8D4DB",
                    bgcolor: SURFACE_HOVER,
                  },
                  ...(changed && {
                    boxShadow: `0 0 0 3px rgba(var(--accent-rgb), 0.12)`,
                  }),
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  alignItems={{ xs: "stretch", sm: "center" }}
                >
                  {/* Badge + libelle + description */}
                  <Stack
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {typeCode && (
                      <ExamTypeBadge type={typeCode} variant="large" />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontWeight: 700,
                          color: INK,
                          fontSize: 15,
                          lineHeight: 1.3,
                        }}
                      >
                        {EXAM_TYPE_LABELS[typeCode] ?? label}
                      </Typography>
                      {description && (
                        <Typography
                          variant="caption"
                          sx={{ color: INK_MUTED, display: "block", mt: 0.25 }}
                        >
                          {description}
                        </Typography>
                      )}
                    </Box>
                  </Stack>

                  {/* Input diminutif */}
                  <Box sx={{ minWidth: { sm: 220 } }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: INK_MUTED,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        display: "block",
                        mb: 0.5,
                      }}
                    >
                      Diminutif
                    </Typography>
                    <TextField
                      value={item.diminutif}
                      onChange={(e) => handleChange(code, e.target.value)}
                      disabled={readOnly}
                      size="small"
                      fullWidth
                      inputProps={{
                        maxLength: 8,
                        style: {
                          fontFamily: "monospace",
                          fontWeight: 700,
                          fontSize: 14,
                          letterSpacing: "0.05em",
                        },
                      }}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          bgcolor: SURFACE,
                          "& fieldset": { borderColor: BORDER },
                          "&:hover fieldset": { borderColor: "#B9C7CE" },
                          "&.Mui-focused fieldset": {
                            borderColor: BRAND,
                            borderWidth: 2,
                          },
                        },
                      }}
                    />
                  </Box>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Aide contextuelle */}
      {!loading && entries.length > 0 && (
        <Box sx={{ mt: 3, maxWidth: 720 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="flex-start"
            sx={{
              p: 2,
              bgcolor: "#F5FDFB",
              border: `1px solid #D0EEE7`,
              borderRadius: 2,
            }}
          >
            <IconInfoCircle
              size={18}
              color={BRAND_DARK}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
                À quoi servent ces diminutifs ?
              </Typography>
              <Typography variant="caption" sx={{ color: INK_MUTED }}>
                Le bot Lyrae les utilise en interne pour classer les demandes de
                rendez-vous par modalité. Ils doivent rester courts (2 à 8
                caractères, sans espaces) et cohérents avec ce que votre système
                RIS/PACS utilise déjà. Les valeurs par défaut (US, MG, RX, MR,
                CT) fonctionnent dans la grande majorité des cas.
              </Typography>
            </Box>
          </Stack>
        </Box>
      )}

      <BarreEnregistrement
        modifications={dirtyCount}
        enregistrement={saving}
        onEnregistrer={handleSave}
        onAnnuler={handleReset}
        lectureSeule={readOnly}
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
