"use client";

import React, { useEffect, useState } from "react";
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

export default function ClientsTable() {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBy, setFilterBy] = useState("name"); // Options: id, name, product

  useEffect(() => {
    const fetchClientsAndProducts = async () => {
      setLoading(true);
      try {
        // Récupérer les clients
        const clientsRes = await fetch("/api/admin/clients");
        const clientsData = await clientsRes.json();

        // Récupérer les produits
        const productsRes = await fetch("/api/products");
        const productsData = await productsRes.json();

        if (clientsRes.ok && productsRes.ok) {
          setClients(
            clientsData.sort((a: Client, b: Client) => a.id - b.id) || []
          );
          setProducts(productsData.map((p: any) => ({ id: p.id, name: p.name })) || []);
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

  // 🔍 Filtrage dynamique
  const filteredClients = clients.filter((client) => {
    if (filterBy === "id") {
      return client.id.toString().includes(searchQuery);
    } else if (filterBy === "name") {
      return client.name.toLowerCase().includes(searchQuery.toLowerCase());
    } else if (filterBy === "product") {
      return client.products.some((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  // 📥 Fonction pour exporter en CSV
  const exportToCSV = () => {
    const headers = ["ID", "Name", "Email", ...products.map((p) => p.name)];
    
    const rows = filteredClients.map((client) => {
      return [
        client.id,
        client.name,
        client.email,
        ...products.map((product) => {
          const clientProduct = client.products.find((p) => p.id === product.id);
          return clientProduct
            ? `✅ ${clientProduct.assignedAt ? format(new Date(clientProduct.assignedAt), "dd/MM/yyyy") : "N/A"}`
            : "❌";
        }),
      ];
    });

    let csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "clients.csv");
    document.body.appendChild(link);
    link.click();
  };

  return (
    <Box sx={{ padding: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Clients & Products
      </Typography>

      {/* 🔍 Barre de recherche + Export CSV */}
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
        {/* 📌 Filtrage par ID, Nom ou Produit */}
        <Select
          value={filterBy}
          onChange={(e) => setFilterBy(e.target.value)}
          size="small"
          sx={{ width: "200px" }}
        >
          <MenuItem value="id">ID</MenuItem>
          <MenuItem value="name">Name</MenuItem>
          <MenuItem value="product">Product</MenuItem>
        </Select>

        {/* 📥 Bouton Export CSV */}
        <Button
          variant="contained"
          color="primary"
          onClick={exportToCSV}
        >
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
                <TableCell sx={{ borderBottom: "2px solid #ccc" }}><strong>ID</strong></TableCell>
                <TableCell sx={{ borderBottom: "2px solid #ccc" }}><strong>Name</strong></TableCell>
                <TableCell sx={{ borderBottom: "2px solid #ccc" }}><strong>Email</strong></TableCell>
                {products.map((product) => (
                  <TableCell key={product.id} align="center" sx={{ borderBottom: "2px solid #ccc" }}>
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
                    const clientProduct = client.products.find((p) => p.id === product.id);
                    return (
                      <TableCell key={product.id} align="center">
                        {clientProduct ? (
                          <>
                            <CheckCircleIcon color="success" />
                            <Typography variant="caption" display="block">
                              {clientProduct.assignedAt
                                ? format(new Date(clientProduct.assignedAt), "dd/MM/yyyy")
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
