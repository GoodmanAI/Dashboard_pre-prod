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
import { estProduit } from "@/lib/produits";

/** Cette ligne porte-t-elle le produit LyraeKonnect ? */
const estKonnect = (nom: string) => estProduit(nom, "konnect");

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
  /** Cabinet Konnect rattaché. `null` sur toute ligne non-LyraeKonnect. */
  tenantId?: string | null;
}

/** Forme canonique d'un UUID — évite un aller-retour serveur sur une faute de frappe. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ExternalMappingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [tenantDrafts, setTenantDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * Deux sources, deux tables : `ExternalCenterMapping` (N codes → 1 centre,
   * pour AI2Xplore) et `KonnectTenantMapping` (1 ↔ 1, pour Konnect). On les
   * réunit ici pour que l'administrateur voie d'un coup d'œil TOUS les
   * identifiants d'un centre, au lieu de connaître deux écrans.
   *
   * La requête Konnect est tolérante à l'échec : si elle tombe, la page
   * continue d'afficher les codes AI2Xplore plutôt que de ne rien montrer.
   */
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [resCodes, resTenants] = await Promise.all([
        fetch("/api/external-center-mapping"),
        fetch("/api/konnect-tenant-mapping").catch(() => null),
      ]);

      const data = await resCodes.json();
      if (!resCodes.ok) throw new Error(data.error || `HTTP ${resCodes.status}`);

      let tenantParUserProduct = new Map<number, string | null>();
      if (resTenants?.ok) {
        const dataTenants = await resTenants.json();
        tenantParUserProduct = new Map(
          (dataTenants.rows ?? []).map((r: any) => [r.userProductId, r.tenantId ?? null])
        );
      }

      const fusionnees: Row[] = (data.rows ?? []).map((r: Row) => ({
        ...r,
        tenantId: tenantParUserProduct.get(r.userProductId) ?? null,
      }));
      setRows(fusionnees);
      setTenantDrafts(
        Object.fromEntries(fusionnees.map((r) => [r.userProductId, r.tenantId ?? ""]))
      );
    } catch (e: any) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  async function saveTenant(row: Row) {
    const valeur = (tenantDrafts[row.userProductId] ?? "").trim();
    setBusyId(row.userProductId);
    setError(null);
    try {
      const res = await fetch("/api/konnect-tenant-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProductId: row.userProductId, tenantId: valeur }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setToast(`Cabinet rattaché à ${row.userName ?? `#${row.userId}`}`);
      await load();
    } catch (e: any) {
      setError(e.message || "Erreur de rattachement");
    } finally {
      setBusyId(null);
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
        Identifiants externes
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Tous les identifiants sous lesquels un centre est connu des autres
        briques, réunis ici.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        <strong>Codes RIS</strong> : les codes employés par le logiciel métier
        via AI2Xplore. Un centre peut en avoir plusieurs ; chacun est unique au
        global. — <strong>Cabinet Konnect</strong> : le <code>tenant_id</code> du
        cabinet dans le portail patient. Il est <em>généré par Konnect</em>, on ne
        fait que le référencer ici ; un cabinet ne peut être rattaché qu&apos;à un
        seul centre. Le Dashboard ne peut pas vérifier qu&apos;il existe — les deux
        bases sont séparées —, alors copiez-le depuis Konnect plutôt que de le
        saisir.
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
                <TableCell sx={{ width: 180 }}>Centre</TableCell>
                <TableCell sx={{ width: 140 }}>Service</TableCell>
                <TableCell>Codes RIS (AI2Xplore)</TableCell>
                <TableCell sx={{ width: 250 }}>Ajouter un code</TableCell>
                <TableCell sx={{ width: 330 }}>Cabinet Konnect</TableCell>
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
                          backgroundColor: "var(--accent)",
                          textTransform: "none",
                          ":hover": { backgroundColor: "var(--accent-press)" },
                        }}
                      >
                        Ajouter
                      </Button>
                    </Stack>
                  </TableCell>

                  {/* Cabinet Konnect — n'a de sens que sur une ligne LyraeKonnect.
                      Le tenant_id est genere par Konnect, jamais ici : ce champ
                      enregistre une reference vers un cabinet deja provisionne. */}
                  <TableCell>
                    {row.tenantId === undefined ? null : estKonnect(row.productName) ? (
                      <Stack direction="row" spacing={1}>
                        <TextField
                          size="small"
                          fullWidth
                          value={tenantDrafts[row.userProductId] ?? ""}
                          onChange={(e) =>
                            setTenantDrafts((d) => ({
                              ...d,
                              [row.userProductId]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              UUID_RE.test((tenantDrafts[row.userProductId] ?? "").trim())
                            ) {
                              saveTenant(row);
                            }
                          }}
                          placeholder="tenant_id (UUID)"
                          disabled={busyId === row.userProductId}
                          error={
                            (tenantDrafts[row.userProductId] ?? "").trim() !== "" &&
                            !UUID_RE.test((tenantDrafts[row.userProductId] ?? "").trim())
                          }
                        />
                        <Button
                          variant="contained"
                          size="small"
                          disabled={
                            busyId === row.userProductId ||
                            !UUID_RE.test((tenantDrafts[row.userProductId] ?? "").trim()) ||
                            (tenantDrafts[row.userProductId] ?? "").trim() ===
                              (row.tenantId ?? "")
                          }
                          onClick={() => saveTenant(row)}
                          sx={{
                            backgroundColor: "var(--accent)",
                            textTransform: "none",
                            whiteSpace: "nowrap",
                            ":hover": { backgroundColor: "var(--accent-press)" },
                          }}
                        >
                          Rattacher
                        </Button>
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        —
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
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
