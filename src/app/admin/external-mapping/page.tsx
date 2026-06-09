"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

interface Code {
  id: number;
  externalCenterCode: string;
}

interface Row {
  userProductId: number;
  userId: number;
  userName: string | null;
  productName: string;
  codes: Code[];
}

export default function ExternalMappingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/external-center-mapping");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows(data.rows);
    } catch (e: any) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addCode(row: Row) {
    const value = (drafts[row.userProductId] ?? "").trim();
    if (!value) return;
    setBusyId(row.userProductId);
    setError(null);
    try {
      const res = await fetch("/api/external-center-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProductId: row.userProductId,
          externalCenterCode: value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows((prev) =>
        prev.map((r) =>
          r.userProductId === row.userProductId
            ? {
                ...r,
                codes: [
                  ...r.codes,
                  { id: data.id, externalCenterCode: data.externalCenterCode },
                ].sort((a, b) =>
                  a.externalCenterCode.localeCompare(b.externalCenterCode)
                ),
              }
            : r
        )
      );
      setDrafts((d) => ({ ...d, [row.userProductId]: "" }));
      setToast(`Code ajouté : ${data.externalCenterCode}`);
    } catch (e: any) {
      setError(e.message || "Erreur d'ajout");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCode(row: Row, code: Code) {
    setBusyId(row.userProductId);
    setError(null);
    try {
      const res = await fetch(
        `/api/external-center-mapping?id=${code.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows((prev) =>
        prev.map((r) =>
          r.userProductId === row.userProductId
            ? { ...r, codes: r.codes.filter((c) => c.id !== code.id) }
            : r
        )
      );
      setToast(`Code supprimé : ${code.externalCenterCode}`);
    } catch (e: any) {
      setError(e.message || "Erreur de suppression");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" sx={{ mb: 1, color: "#34495E", fontWeight: 600 }}>
        Mapping centres externes
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Pour chaque service, ajoute les codes utilisés par ton logiciel métier
        (externalCenterCode). Un service peut avoir plusieurs codes ; chaque
        code est unique au global et identifie un service précis.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ p: 0 }}>
        {loading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 200 }}>Centre</TableCell>
                <TableCell sx={{ width: 160 }}>Service</TableCell>
                <TableCell>Codes externes</TableCell>
                <TableCell sx={{ width: 280 }}>Ajouter un code</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.userProductId}>
                  <TableCell>{row.userName ?? `User #${row.userId}`}</TableCell>
                  <TableCell>{row.productName}</TableCell>
                  <TableCell>
                    {row.codes.length === 0 ? (
                      <Typography variant="caption" color="text.secondary">
                        Aucun code
                      </Typography>
                    ) : (
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {row.codes.map((c) => (
                          <Chip
                            key={c.id}
                            label={c.externalCenterCode}
                            onDelete={() => deleteCode(row, c)}
                            disabled={busyId === row.userProductId}
                            sx={{ backgroundColor: "#E8F8F4" }}
                          />
                        ))}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <TextField
                        size="small"
                        value={drafts[row.userProductId] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.userProductId]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addCode(row);
                        }}
                        placeholder="Nouveau code"
                        disabled={busyId === row.userProductId}
                      />
                      <Button
                        variant="contained"
                        size="small"
                        disabled={
                          !(drafts[row.userProductId] ?? "").trim() ||
                          busyId === row.userProductId
                        }
                        onClick={() => addCode(row)}
                        sx={{
                          backgroundColor: "#48C8AF",
                          textTransform: "none",
                          ":hover": { backgroundColor: "#3AB19B" },
                        }}
                      >
                        Ajouter
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography variant="body2" color="text.secondary">
                      Aucun service trouvé.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <Snackbar
        open={toast !== null}
        autoHideDuration={2000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" variant="filled">
          {toast}
        </Alert>
      </Snackbar>
    </Box>
  );
}
