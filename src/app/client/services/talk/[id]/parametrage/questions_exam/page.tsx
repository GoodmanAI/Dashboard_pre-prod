"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Typography,
  Pagination,
  Snackbar,
  Portal,
  Alert
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";

interface PageProps {
  params: { id: string };
}

type Exam = {
  codeExamen: string;
  libelle: string;
  Interrogatoire: string[];
};

function parseStringArray(value?: string): string[] {
  if (!value || typeof value !== "string") return [];

  try {
    // transforme ['a', 'b'] → ["a", "b"]
    const json = value
      .trim()
      .replace(/^\[/, "[")
      .replace(/\]$/, "]")
      .replace(/,\s*'/g, ', "')
      .replace(/'\s*,/g, '",')
      .replace(/^\['/, '["')
      .replace(/'\]$/, '"]')
      .replace(/'\s*:/g, '":')
      .replace(/:\s*'/g, ': "');

    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to parse string array:", value);
    return [];
  }
}

export default function EditExamQuestions({ params }: PageProps) {
  const userProductId = Number(params.id);
  const router = useRouter();

  const [exams, setExams] = useState<Record<string, Exam>>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  const rowsPerPage = 20;

  const handleDeleteQuestion = (code: string, index: number) => {
    setExams((prev) => {
      const updated = prev[code].Interrogatoire.filter((_, i) => i !== index);

      return {
        ...prev,
        [code]: {
          ...prev[code],
          Interrogatoire: updated,
        },
      };
    });
  };

  // Chargement des exams
  useEffect(() => {
    const fetchExams = async () => {
      const res = await fetch(
        `/api/configuration/exam?userProductId=${userProductId}`
      );
      const data = await res.json();

      const normalized: Record<string, Exam> = {};

      Object.entries(data).forEach(([code, exam]: any) => {
        normalized[code] = {
          ...exam,
          Interrogatoire: Array.isArray(exam.Interrogatoire)
            ? exam.Interrogatoire
            : parseStringArray(exam.Interrogatoire),
        };
      });

      setExams(normalized);
    };

    fetchExams();
  }, [userProductId]);


  // Reset page quand on cherche
  useEffect(() => {
    setPage(1);
  }, [search]);

  // Filtrage
  const filtered = Object.entries(exams).filter(([_, exam]) =>
    `${exam.codeExamen} ${exam.libelle}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filtered.length / rowsPerPage);

  const paginated = filtered.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  // Handlers
  const handleAddQuestion = (code: string) => {
    setExams((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        Interrogatoire: [...prev[code].Interrogatoire, ""],
      },
    }));
  };

  const handleChangeQuestion = (
    code: string,
    index: number,
    value: string
  ) => {
    setExams((prev) => {
      const updated = [...prev[code].Interrogatoire];
      updated[index] = value;

      return {
        ...prev,
        [code]: {
          ...prev[code],
          Interrogatoire: updated,
        },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/configuration/exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProductId,
          exams,
        }),
      });

      if (!res.ok) throw new Error("Erreur sauvegarde");

      setSnack({
        open: true,
        message: "Configuration enregistrée.",
        severity: "success",
      });
    } catch (e) {
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
    <main>
      <Box p={3}>
        {/* Retour */}
        <Button
          variant="contained"
          startIcon={<ArrowBackIosIcon />}
          onClick={() => router.back()}
          sx={{
            backgroundColor: "#48C8AF",
            "&:hover": { backgroundColor: "#3bb49d" },
            mb: 3,
          }}
        >
          Retour
        </Button>

        {/* Titre */}
        <Typography variant="h5" fontWeight="bold" mb={3}>
          Configuration des interrogatoires par examen
        </Typography>

        {/* Recherche */}
        <TextField
          fullWidth
          placeholder="Rechercher par code ou libellé..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 3 }}
        />

        {/* Table */}
        <TableContainer component={Paper} sx={{ mb: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: "rgba(230,230,230,0.6)" }}>
                <TableCell sx={{ fontSize: 16}}>
                  Libellé examen
                </TableCell>
                <TableCell sx={{ fontSize: 16}}>
                  Questions
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {paginated.map(([code, exam]) => (
                <TableRow key={code}>
                  {/* Code */}
                  <TableCell sx={{ verticalAlign: "top", width: 220 }}>
                    {exam.libelle}
                  </TableCell>

                  {/* Questions */}
                  <TableCell>
                    <Stack spacing={1.5}>
                      {exam.Interrogatoire.map((q, idx) => (
                        <Stack key={idx} direction="row" spacing={1} alignItems="center">
                          <TextField
                            fullWidth
                            size="small"
                            value={q}
                            onChange={(e) =>
                              handleChangeQuestion(code, idx, e.target.value)
                            }
                            placeholder={`Question ${idx + 1}`}
                          />
                          <Button
                            size="small"
                            color="error"
                            onClick={() => handleDeleteQuestion(code, idx)}
                          >
                            Supprimer
                          </Button>
                        </Stack>
                      ))}

                      <Button
                        size="small"
                        onClick={() => handleAddQuestion(code)}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        + Ajouter une question
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        {totalPages > 1 && (
          <Stack alignItems="center" mt={3}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, value) => setPage(value)}
              color="primary"
            />
          </Stack>
        )}

        {/* Barre sticky */}
        <Box
          sx={{
            position: "sticky",
            bottom: 0,
            backgroundColor: "rgba(248,248,248,0.9)",
            backdropFilter: "blur(6px)",
            py: 2,
            px: 2,
            mt: 3,
            borderTop: "1px solid #eee",
            display: "flex",
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
        </Box>
      </Box>
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
