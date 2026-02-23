"use client";

import { useState, useEffect } from "react";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import { useRouter } from "next/navigation";
import {
  Stack,
  Button,
  Snackbar,
  Alert,
  Portal,
  Switch,
  Select,
  MenuItem,
} from "@mui/material";

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

  { key: "mammographie_radio", label: "Mammographie + Radio" },
  { key: "mammographie_irm", label: "Mammographie + IRM" },
  { key: "mammographie_scanner", label: "Mammographie + Scanner" },

  { key: "radio_irm", label: "Radio + IRM" },
  { key: "radio_scanner", label: "Radio + Scanner" },

  { key: "irm_scanner", label: "IRM + Scanner" },
];

export default function DoubleExamPage({ params }: DoubleExamPageProps) {
  const userProductId = Number(params.id);
  const router = useRouter();

  const [mapping, setMapping] = useState<
    Record<string, { enabled: boolean; mode: "single" | "double" }>
  >({});

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

  return (
    <main className="p-6">
      <Button
        variant="contained"
        startIcon={<ArrowBackIosIcon />}
        onClick={() => router.back()}
        disabled={saving}
        sx={{
          backgroundColor: "#48C8AF",
          "&:hover": { backgroundColor: "#3bb49d" },
          marginBottom: "10px",
        }}
      >
        Retour
      </Button>

      <h1 className="text-xl font-bold mb-8 pl-4">
        Correspondance des Multi-Examens
      </h1>

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

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          position: "sticky",
          bottom: 0,
          bgcolor: "rgba(248,248,248,0.9)",
          backdropFilter: "blur(6px)",
          py: 1.5,
          px: 2,
          mt: 2,
          borderTop: "1px solid #eee",
          justifyContent: "flex-end",
        }}
      >
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          sx={{
            backgroundColor: "#48C8AF",
            "&:hover": { backgroundColor: "#3bb49d" },
          }}
        >
          Enregistrer
        </Button>

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
      </Stack>
    </main>
  );
}
