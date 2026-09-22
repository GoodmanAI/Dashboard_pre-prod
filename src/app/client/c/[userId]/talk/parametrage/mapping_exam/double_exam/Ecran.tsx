"use client";

import { useTalkBasePath } from "@/utils/talkRoutes";
import SectionHeader from "@/components/admin/SectionHeader";
import { useState, useEffect } from "react";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import {
  Button,
  Snackbar,
  Alert,
  Portal,
  Switch,
  Select,
  MenuItem,
  Box,
} from "@mui/material";
import { useSession } from "next-auth/react";

import { useDroitPage } from "@/hooks/useDroitPage";
import { PAGES } from "@/lib/permissions";

interface DoubleExamPageProps {
  params: {
    id: string;
  };
}

const doubleExams = [
  { key: "echographie_mammographie", label: "Echographie + Mammographie" },
  { key: "echographie_radio", label: "Echographie + Radio" },
  { key: "echographie_irm", label: "Echographie + IRM" },
  { key: "echographie_scanner", label: "Echographie + Scanner" },
  { key: "echographie_echographie", label: "Echographie + Echographie" },
  { key: "mammographie_radio", label: "Mammographie + Radio" },
  { key: "mammographie_irm", label: "Mammographie + IRM" },
  { key: "mammographie_scanner", label: "Mammographie + Scanner" },
  { key: "mammographie_echomammaire", label: "Mammographie + Echographie Mammaire" },
  { key: "radio_radio", label: "Radio + Radio" }, 
  { key: "radio_irm", label: "Radio + IRM" },
  { key: "radio_scanner", label: "Radio + Scanner" },
  { key: "irm_scanner", label: "IRM + Scanner" },
];

export default function DoubleExamPage({ params }: DoubleExamPageProps) {
  const userProductId = Number(params.id);
  const basePath = useTalkBasePath(userProductId);
  // Lecture seule, revue le 15/09/2026 : elle se lisait sur le seul booleen
  // herite `isSecretary`, donc un sous-compte moderne cree avec cette page en
  // lecture voyait tous ses champs actifs et decouvrait le refus a
  // l'enregistrement. `useDroitPage` couvre les deux cas.
  const { peutEcrire, raisonLectureSeule } = useDroitPage(PAGES.MAPPING_EXAM);
  const readOnly = !peutEcrire;

  const [mapping, setMapping] = useState<
    Record<string, { enabled: boolean; mode: "single" | "double" }>
  >({});
  // Ce que le serveur connaît : sert à compter les lignes modifiées.
  const [initial, setInitial] = useState<typeof mapping>({});

  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({
    open: false,
    message: "",
    severity: "success" as "success" | "error",
  });

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch(
        `/api/configuration/mapping/double_exam?userProductId=${userProductId}`
      );
      const data = await res.json();

      const formatted: any = {};
      doubleExams.forEach((exam) => {
        formatted[exam.key] = {
          enabled: data?.[exam.key]?.enabled ?? false,
          mode: data?.[exam.key]?.mode ?? "single",
        };
      });

      setMapping(formatted);
      setInitial(formatted);
    };

    fetchData();
  }, [userProductId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/configuration/mapping/double_exam?userProductId=${userProductId}`,
        {
          method: "POST",
          body: JSON.stringify(mapping),
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) throw new Error("Save failed");
      setInitial(mapping);

      setSnack({
        open: true,
        message: "Configuration enregistrée.",
        severity: "success",
      });
    } catch {
      setSnack({
        open: true,
        message: "Erreur lors de la sauvegarde.",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const modifications = Object.keys(mapping).filter(
    (k) =>
      mapping[k].enabled !== initial[k]?.enabled ||
      mapping[k].mode !== initial[k]?.mode
  ).length;

  return (
    <main>
      <SectionHeader
        title="Multi examens"
        subtitle="Quand un patient demande deux examens dans le même appel : LyraeTalk les réserve ensemble, ou un seul."
        retour={{
          libelle: "Retour à la correspondance des examens",
          href: `${basePath}/parametrage/mapping_exam`,
        }}
      />

      {readOnly && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {raisonLectureSeule}
        </Alert>
      )}

      <Box
        component="fieldset"
        disabled={readOnly}
        sx={{
          border: "none",
          padding: 0,
          margin: 0,
          minWidth: 0,
          "&:disabled": { opacity: 0.7 },
        }}
      >
      <table
        style={{
          width: "100%",
          padding: "0 50px",
          borderCollapse: "collapse",
          textAlign: "left",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "rgba(230, 230, 230, 0.6)" }}>
            <th style={{ padding: "10px", border: "1px solid black" }}>
              Double examen
            </th>
            <th style={{ padding: "10px", border: "1px solid black" }}>
              Activé
            </th>
            <th style={{ padding: "10px", border: "1px solid black" }}>
              Mode Xplore
            </th>
          </tr>
        </thead>

        <tbody>
          {doubleExams.map((exam) => (
            <tr key={exam.key}>
              <td style={{ padding: "20px 10px", border: "1px solid black" }}>
                {exam.label}
              </td>

              <td style={{ padding: "20px 10px", border: "1px solid black" }}>
                <Switch
                  checked={mapping[exam.key]?.enabled ?? false}
                  onChange={(e) =>
                    setMapping((prev) => ({
                      ...prev,
                      [exam.key]: {
                        ...prev[exam.key],
                        enabled: e.target.checked,
                      },
                    }))
                  }
                />
              </td>

              <td style={{ padding: "20px 10px", border: "1px solid black" }}>
                <Select
                  value={mapping[exam.key]?.mode ?? "single"}
                  size="small"
                  onChange={(e) =>
                    setMapping((prev) => ({
                      ...prev,
                      [exam.key]: {
                        ...prev[exam.key],
                        mode: e.target.value as "single" | "double",
                      },
                    }))
                  }
                >
                  <MenuItem value="single">
                    Single (1 examen Xplore + commentaire)
                  </MenuItem>
                  <MenuItem value="double">
                    Double (2 examens distincts Xplore)
                  </MenuItem>
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      </Box>

      <BarreEnregistrement
        modifications={modifications}
        enregistrement={saving}
        onEnregistrer={handleSave}
        onAnnuler={() => setMapping(initial)}
        lectureSeule={readOnly}
      />

      <Portal>
        <Snackbar
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          open={snack.open}
          autoHideDuration={3000}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          <Alert severity={snack.severity}>{snack.message}</Alert>
        </Snackbar>
      </Portal>
    </main>
  );
}
