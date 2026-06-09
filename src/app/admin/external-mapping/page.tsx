"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
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

interface Row {
  userProductId: number;
  userId: number;
  userName: string | null;
  productName: string;
  externalCenterCode: string | null;
}

export default function ExternalMappingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
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
      const initialDrafts: Record<number, string> = {};
      data.rows.forEach((r: Row) => {
        initialDrafts[r.userProductId] = r.externalCenterCode ?? "";
      });
      setDrafts(initialDrafts);
    } catch (e: any) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(row: Row) {
    const value = (drafts[row.userProductId] ?? "").trim();
    setSavingId(row.userProductId);
    setError(null);
    try {
      const res = await fetch("/api/external-center-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProductId: row.userProductId,
          externalCenterCode: value || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows((prev) =>
        prev.map((r) =>
          r.userProductId === row.userProductId
            ? { ...r, externalCenterCode: data.externalCenterCode }
            : r
        )
      );
      setToast(
        data.externalCenterCode
          ? `Mapping enregistré : ${data.externalCenterCode}`
          : "Mapping supprimé"
      );
    } catch (e: any) {
      setError(e.message || "Erreur d'enregistrement");
    } finally {
      setSavingId(null);
    }
  }

  function isDirty(row: Row): boolean {
    const draft = (drafts[row.userProductId] ?? "").trim();
    const current = (row.externalCenterCode ?? "").trim();
    return draft !== current;
  }

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" sx={{ mb: 1, color: "#34495E", fontWeight: 600 }}>
        Mapping centres externes
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Associe à chaque service un code utilisé par ton logiciel métier
        (externalCenterCode). Le code est unique et sert à identifier le centre
        depuis l&apos;API métier (init de RDV, config SMS).
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
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
                <TableCell>Centre</TableCell>
                <TableCell>Service</TableCell>
                <TableCell>Code externe</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.userProductId}>
                  <TableCell>{row.userName ?? `User #${row.userId}`}</TableCell>
                  <TableCell>{row.productName}</TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      value={drafts[row.userProductId] ?? ""}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [row.userProductId]: e.target.value,
                        }))
                      }
                      placeholder="(vide = pas de mapping)"
                      disabled={savingId === row.userProductId}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="contained"
                      size="small"
                      disabled={!isDirty(row) || savingId !== null}
                      onClick={() => save(row)}
                      sx={{
                        backgroundColor: "#48C8AF",
                        textTransform: "none",
                        ":hover": { backgroundColor: "#3AB19B" },
                      }}
                    >
                      {savingId === row.userProductId
                        ? "Enregistrement…"
                        : "Enregistrer"}
                    </Button>
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
