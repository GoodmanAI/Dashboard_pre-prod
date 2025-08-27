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
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import SearchIcon from "@mui/icons-material/Search";
import { format } from "date-fns";

/**
 * Tableau d’administration des clients et de leurs produits.
 * Rôles :
 *  - Charger la liste des clients et le catalogue produits.
 *  - Proposer un filtrage côté client (par ID, nom, ou produit).
 *  - Permettre l’export CSV de la vue filtrée.
 */

interface Client {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  products: { id: number; name: string; assignedAt: string | null }[];
}

interface Product {
  id: number;
  name: string;
}

type FilterKey = "id" | "name" | "product";

export default function ClientsTable() {
  /** État : données chargées côté admin. */
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  /** État : cycle de vie & erreurs. */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** État : filtre recherche. */
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBy, setFilterBy] = useState<FilterKey>("name");

  /**
   * Effet : chargement initial des clients et produits.
   * - Séquentiel pour rester simple (peut être parallélisé si besoin).
   * - Gestion standard des erreurs + spinner.
   */
  useEffect(() => {
    const fetchClientsAndProducts = async () => {
      setLoading(true);
      try {
        const clientsRes = await fetch("/api/admin/clients");
        const clientsData = await clientsRes.json();

        const productsRes = await fetch("/api/products");
        const productsData = await productsRes.json();

        if (clientsRes.ok && productsRes.ok) {
          setClients(
            (clientsData as Client[]).sort((a, b) => a.id - b.id) || []
          );
          setProducts(
            (productsData as Product[]).map((p: any) => ({ id: p.id, name: p.name })) || []
          );
        } else {
          setError("Failed to fetch data.");
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchClientsAndProducts();
  }, []);

  /**
   * Sélecteur mémoïsé : liste des clients filtrée selon le critère et la requête.
   * - Évite les recalculs inutiles sur re-renders.
   */
  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;

    return clients.filter((client) => {
      switch (filterBy) {
        case "id":
          return client.id.toString().includes(q);
        case "name":
          return (client.name || "").toLowerCase().includes(q);
        case "product":
          return client.products.some((p) =>
            (p.name || "").toLowerCase().includes(q)
          );
        default:
          return true;
      }
    });
  }, [clients, filterBy, searchQuery]);

  /**
   * Action : export CSV de la vue filtrée.
   * - Construit l’en-tête puis les lignes (✅ avec date d’affectation, ❌ sinon).
   * - Déclenche un téléchargement côté navigateur.
   */
  const exportToCSV = () => {
    const headers = ["ID", "Name", "Email", ...products.map((p) => p.name)];

    const rows = filteredClients.map((client) => [
      client.id,
      client.name,
      client.email,
      ...products.map((product) => {
        const clientProduct = client.products.find((p) => p.id === product.id);
        if (!clientProduct) return "❌";
        const date =
          clientProduct.assignedAt
            ? format(new Date(clientProduct.assignedAt), "dd/MM/yyyy")
            : "N/A";
        return `✅ ${date}`;
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

  /**
   * Rendu :
   *  - Barre de recherche + sélecteur de filtre + action d’export.
   *  - État de chargement/erreur/vides.
   *  - Tableau principal : un colonne par produit (✅/❌ + date).
   */
  return (
    <Box sx={{ padding: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Clients & Products
      </Typography>

      <Box display="flex" gap={2} mb={2} alignItems="center">
        <TextField
          label="Search"
          variant="outlined"
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ width: "300px" }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />

        <Select
          value={filterBy}
          onChange={(e) => setFilterBy(e.target.value as FilterKey)}
          size="small"
          sx={{ width: "200px" }}
        >
          <MenuItem value="id">ID</MenuItem>
          <MenuItem value="name">Name</MenuItem>
          <MenuItem value="product">Product</MenuItem>
        </Select>

        <Button variant="contained" color="primary" onClick={exportToCSV}>
          Export CSV 📥
        </Button>
      </Box>

      {loading ? (
        <CircularProgress />
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : clients.length === 0 ? (
        <Typography color="textSecondary">No clients found.</Typography>
      ) : (
        <TableContainer component={Paper} sx={{ boxShadow: 3, borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#e0e0e0" }}>
                <TableCell sx={{ borderBottom: "2px solid #ccc" }}>
                  <strong>ID</strong>
                </TableCell>
                <TableCell sx={{ borderBottom: "2px solid #ccc" }}>
                  <strong>Name</strong>
                </TableCell>
                <TableCell sx={{ borderBottom: "2px solid #ccc" }}>
                  <strong>Email</strong>
                </TableCell>
                {products.map((product) => (
                  <TableCell
                    key={product.id}
                    align="center"
                    sx={{ borderBottom: "2px solid #ccc" }}
                  >
                    <strong>{product.name}</strong>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {filteredClients.map((client, index) => (
                <TableRow
                  key={client.id}
                  sx={{
                    backgroundColor: index % 2 === 0 ? "#f9f9f9" : "white",
                  }}
                >
                  <TableCell>{client.id}</TableCell>
                  <TableCell>{client.name}</TableCell>
                  <TableCell>{client.email}</TableCell>

                  {products.map((product) => {
                    const clientProduct = client.products.find(
                      (p) => p.id === product.id
                    );
                    return (
                      <TableCell key={product.id} align="center">
                        {clientProduct ? (
                          <>
                            <CheckCircleIcon color="success" />
                            <Typography variant="caption" display="block">
                              {clientProduct.assignedAt
                                ? format(
                                    new Date(clientProduct.assignedAt),
                                    "dd/MM/yyyy"
                                  )
                                : "N/A"}
                            </Typography>
                          </>
                        ) : (
                          <CancelIcon color="error" />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
