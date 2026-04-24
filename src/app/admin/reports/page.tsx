"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Typography,
  Box,
  TextField,
  Select,
  MenuItem,
  InputAdornment,
  Button,
  Card,
  Chip,
  Alert,
  Popover,
  FormControl,
  InputLabel,
} from "@mui/material";
import {
  IconSearch,
  IconDownload,
  IconCircleCheck,
  IconCircleX,
  IconUsers,
  IconCalendar,
} from "@tabler/icons-react";
import { format } from "date-fns";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";

/**
 * Rapport clients :
 * - Liste des clients avec colonnes : ID, nom, email, ville, rôle, produits Talk
 * - Filtres : recherche texte, date de création, rôle centre
 * - Export CSV de la vue filtrée
 * Le produit "LyraeExplain" est exclu volontairement (produit archivé).
 */

type CentreRole = "ADMIN_USER" | "USER" | null;

interface Client {
  id: number;
  name: string | null;
  email: string;
  city: string | null;
  centreRole: CentreRole;
  createdAt: string;
  updatedAt: string;
  products: {
    id: number;
    userProductId: number;
    name: string;
    assignedAt: string | null;
  }[];
}

/** Retourne le userProductId Talk d'un client (celui utilisé dans les URLs/APIs). */
function getTalkUserProductId(client: Client): number | null {
  return (
    client.products.find((p) => p.name === "LyraeTalk")?.userProductId ?? null
  );
}

interface Product {
  id: number;
  name: string;
}

type FilterKey = "id" | "name" | "city" | "product";
type RoleFilter = "all" | "ADMIN_USER" | "USER";

/** Produits volontairement masqués (archivés). */
const HIDDEN_PRODUCTS = new Set(["LyraeExplain"]);

export default function ReportsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBy, setFilterBy] = useState<FilterKey>("name");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [datePopoverAnchor, setDatePopoverAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const [clientsRes, productsRes] = await Promise.all([
          fetch("/api/admin/clients"),
          fetch("/api/products"),
        ]);
        const clientsData = await clientsRes.json();
        const productsData = await productsRes.json();

        if (clientsRes.ok && productsRes.ok) {
          setClients(
            (clientsData as Client[]).sort((a, b) => a.id - b.id) || []
          );
          setProducts(
            (productsData as Product[])
              .filter((p) => !HIDDEN_PRODUCTS.has(p.name))
              .map((p: any) => ({ id: p.id, name: p.name })) || []
          );
        } else {
          setError("Erreur lors du chargement des données.");
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Une erreur inattendue est survenue.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return clients.filter((client) => {
      // Filtre texte
      if (q) {
        const matchText = (() => {
          switch (filterBy) {
            case "id":
              return (getTalkUserProductId(client)?.toString() || "").includes(q);
            case "name":
              return (client.name || "").toLowerCase().includes(q);
            case "city":
              return (client.city || "").toLowerCase().includes(q);
            case "product":
              return client.products.some((p) =>
                (p.name || "").toLowerCase().includes(q)
              );
            default:
              return true;
          }
        })();
        if (!matchText) return false;
      }

      // Filtre rôle
      if (roleFilter !== "all") {
        if (client.centreRole !== roleFilter) return false;
      }

      // Filtre date création
      if (dateRange) {
        const d = new Date(client.createdAt);
        if (d < dateRange.from || d > dateRange.to) return false;
      }

      return true;
    });
  }, [clients, filterBy, searchQuery, roleFilter, dateRange]);

  const exportToCSV = () => {
    const headers = [
      "ID",
      "Nom",
      "Email",
      "Ville",
      "Rôle",
      "Créé le",
      ...products.map((p) => p.name),
    ];
    const rows = filteredClients.map((client) => [
      getTalkUserProductId(client) ?? "",
      client.name ?? "",
      client.email,
      client.city ?? "",
      client.centreRole ?? "",
      format(new Date(client.createdAt), "dd/MM/yyyy"),
      ...products.map((product) => {
        const cp = client.products.find((p) => p.id === product.id);
        if (!cp) return "Non";
        const date = cp.assignedAt
          ? format(new Date(cp.assignedAt), "dd/MM/yyyy")
          : "N/A";
        return `Oui (${date})`;
      }),
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) =>
            typeof cell === "string" && cell.includes(",")
              ? `"${cell.replace(/"/g, '""')}"`
              : String(cell)
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clients.csv";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  const dateLabel = dateRange
    ? `${format(dateRange.from, "dd/MM/yyyy")} – ${format(dateRange.to, "dd/MM/yyyy")}`
    : "Toutes dates";

  return (
    <PageContainer title="Rapports" description="Tableau clients">
      <Box>
        <SectionHeader
          title="Rapports"
          subtitle="Vue d'ensemble des comptes clients et de leur affectation produit"
          actions={
            <Chip
              icon={<IconUsers size={14} />}
              label={`${clients.length} clients`}
              size="small"
              sx={{ bgcolor: "rgba(72,200,175,0.15)", color: "#2a6f64", fontWeight: 600 }}
            />
          }
        />

        {/* Filtres */}
        <Card sx={{ p: 2.5, mb: 3 }} elevation={1}>
          <Box
            sx={{
              display: "flex",
              gap: 2,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <TextField
              placeholder="Rechercher…"
              variant="outlined"
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ width: 280 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <IconSearch size={18} />
                  </InputAdornment>
                ),
              }}
            />

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Filtrer par</InputLabel>
              <Select
                value={filterBy}
                label="Filtrer par"
                onChange={(e) => setFilterBy(e.target.value as FilterKey)}
              >
                <MenuItem value="id">ID</MenuItem>
                <MenuItem value="name">Nom</MenuItem>
                <MenuItem value="city">Ville</MenuItem>
                <MenuItem value="product">Produit</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Rôle centre</InputLabel>
              <Select
                value={roleFilter}
                label="Rôle centre"
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              >
                <MenuItem value="all">Tous</MenuItem>
                <MenuItem value="USER">Centre simple</MenuItem>
                <MenuItem value="ADMIN_USER">Multi-centres (admin)</MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="outlined"
              size="medium"
              startIcon={<IconCalendar size={16} />}
              onClick={(e) => setDatePopoverAnchor(e.currentTarget)}
              sx={{
                borderColor: dateRange ? "#48C8AF" : "rgba(0,0,0,0.23)",
                color: dateRange ? "#2a6f64" : "text.secondary",
                textTransform: "none",
                fontWeight: 500,
              }}
            >
              {dateLabel}
            </Button>
            {dateRange && (
              <Button
                size="small"
                variant="text"
                onClick={() => setDateRange(null)}
                sx={{ color: "text.secondary" }}
              >
                Réinitialiser
              </Button>
            )}

            <Box sx={{ flex: 1 }} />

            <Button
              variant="outlined"
              startIcon={<IconDownload size={18} />}
              onClick={exportToCSV}
              sx={{
                borderColor: "#48C8AF",
                color: "#2a6f64",
                fontWeight: 600,
                "&:hover": { borderColor: "#3BA992", bgcolor: "rgba(72,200,175,0.08)" },
              }}
            >
              Exporter CSV
            </Button>
          </Box>

          <Popover
            open={Boolean(datePopoverAnchor)}
            anchorEl={datePopoverAnchor}
            onClose={() => setDatePopoverAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          >
            <Box sx={{ p: 2 }}>
              <DateRangePicker
                value={
                  dateRange ?? {
                    from: new Date(),
                    to: new Date(),
                  }
                }
                onChange={(r) => {
                  setDateRange(r);
                  setDatePopoverAnchor(null);
                }}
              />
            </Box>
          </Popover>
        </Card>

        {/* Contenu */}
        {loading ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : clients.length === 0 ? (
          <Card sx={{ p: 3 }}>
            <Typography color="text.secondary">Aucun client enregistré.</Typography>
          </Card>
        ) : filteredClients.length === 0 ? (
          <Card sx={{ p: 3 }}>
            <Typography color="text.secondary">
              Aucun résultat pour ces filtres.
            </Typography>
          </Card>
        ) : (
          <TableContainer
            component={Paper}
            sx={{ boxShadow: 1, borderRadius: 2, overflow: "hidden" }}
            elevation={1}
          >
            <Table size="small">
              <TableHead>
                <TableRow
                  sx={{
                    "& th": {
                      bgcolor: "rgba(72,200,175,0.08)",
                      fontWeight: 700,
                      color: "#2a6f64",
                      borderBottom: "2px solid rgba(72,200,175,0.3)",
                      whiteSpace: "nowrap",
                    },
                  }}
                >
                  <TableCell>ID</TableCell>
                  <TableCell>Nom</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Ville</TableCell>
                  <TableCell align="center">Rôle</TableCell>
                  <TableCell>Créé le</TableCell>
                  {products.map((product) => (
                    <TableCell key={product.id} align="center">
                      {product.name}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>

              <TableBody>
                {filteredClients.map((client) => {
                  const talkUpid = getTalkUserProductId(client);
                  return (
                  <TableRow
                    key={client.id}
                    sx={{
                      transition: "background-color 120ms ease",
                      "&:hover": { bgcolor: "rgba(72,200,175,0.06)" },
                      "& td": { borderBottom: "1px solid #f0f0f0" },
                    }}
                  >
                    <TableCell sx={{ color: "text.secondary" }}>
                      {talkUpid ?? "—"}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{client.name}</TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>{client.email}</TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>
                      {client.city || "—"}
                    </TableCell>
                    <TableCell align="center">
                      {client.centreRole === "ADMIN_USER" ? (
                        <Chip
                          size="small"
                          label="Multi"
                          sx={{
                            bgcolor: "rgba(72,200,175,0.15)",
                            color: "#2a6f64",
                            fontWeight: 600,
                          }}
                        />
                      ) : (
                        <Chip
                          size="small"
                          label="Simple"
                          variant="outlined"
                          sx={{ borderColor: "#e5e7eb", color: "text.secondary" }}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>
                      {format(new Date(client.createdAt), "dd/MM/yyyy")}
                    </TableCell>

                    {products.map((product) => {
                      const clientProduct = client.products.find(
                        (p) => p.id === product.id
                      );
                      return (
                        <TableCell key={product.id} align="center">
                          {clientProduct ? (
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 0.25,
                              }}
                            >
                              <IconCircleCheck size={20} color="#22c55e" />
                              <Typography variant="caption" color="text.secondary">
                                {clientProduct.assignedAt
                                  ? format(new Date(clientProduct.assignedAt), "dd/MM/yyyy")
                                  : "N/A"}
                              </Typography>
                            </Box>
                          ) : (
                            <IconCircleX size={20} color="#d1d5db" />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </PageContainer>
  );
}
