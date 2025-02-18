"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Button,
  Stack,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Alert,
} from "@mui/material";

interface Client {
  id: number;
  name: string;
  email: string;
}

interface Product {
  id: number;
  name: string;
}

export default function ModifyClientProducts() {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<{ productId: number; assignedAt: string }[]>([]);
  const [action, setAction] = useState<"add" | "remove">("add");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch("/api/clients");
        const data = await response.json();
        if (response.ok) {
          setClients(data || []);
        } else {
            setErrorMessage(data.error || "Failed to fetch clients.");
        }
      } catch (err) {
        console.error("Error fetching clients:", err);
        setErrorMessage("An error occurred while fetching clients.");
      }
    };

    fetchClients();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("/api/products");
        const data = await response.json();
        if (response.ok) {
          setProducts(data || []);
        } else {
          setErrorMessage(data.error || "Failed to fetch products.");
        }
      } catch (err) {
        console.error("Error fetching products:", err);
        setErrorMessage("An error occurred while fetching products.");
      }
    };

    fetchProducts();
  }, []);

  const handleOpenDialog = () => {
    setConfirmDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setConfirmDialogOpen(false);
  };

  const handleProductChange = (event: any) => {
    const selectedIds = event.target.value as number[];

    // Créer un tableau avec les dates d'affiliation
    const updatedProducts = selectedIds.map((id) => {
      const existing = selectedProducts.find((p) => p.productId === id);
      return existing || { productId: id, assignedAt: new Date().toISOString() };
    });

    setSelectedProducts(updatedProducts);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setConfirmDialogOpen(false);

    try {
      const response = await fetch("/api/admin/modify-client-products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: selectedClient,
          products: selectedProducts, // Envoyer { productId, assignedAt }
          action,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setSuccessMessage(data.message || "Products successfully modified!");
        setSelectedClient(null);
        setSelectedProducts([]);
      } else {
        setErrorMessage(data.error || "Failed to modify products.");
      }
    } catch (err) {
      console.error("Error modifying products:", err);
      setErrorMessage("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" mb={2}>
        Modify Client Products
      </Typography>

      <FormControl fullWidth margin="normal">
        <InputLabel id="client-select-label">Select Client</InputLabel>
        <Select
          labelId="client-select-label"
          value={selectedClient}
          onChange={(e) => setSelectedClient(Number(e.target.value))}
          MenuProps={{
            PaperProps: {
              style: {
                maxHeight: 200,
                overflowY: "auto",
              },
            },
          }}
        >
          {clients?.map((client) => (
            <MenuItem key={client.id} value={client.id}>
              {client.name} ({client.email})
            </MenuItem>
          )) || <MenuItem disabled>Aucun client disponible</MenuItem>}
        </Select>
      </FormControl>

      <FormControl fullWidth margin="normal">
        <InputLabel id="product-select-label">Select Products</InputLabel>
        <Select
          labelId="product-select-label"
          multiple
          value={selectedProducts.map((p) => p.productId)}
          onChange={handleProductChange}
          MenuProps={{
            PaperProps: {
              style: {
                maxHeight: 200,
                overflowY: "auto",
              },
            },
          }}
          renderValue={(selected) => (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {selected.map((id) => {
                const product = products.find((p) => p.id === id);
                return <Chip key={id} label={product?.name || id} />;
              })}
            </Box>
          )}
        >
          {products.map((product) => (
            <MenuItem key={product.id} value={product.id}>
              {product.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth margin="normal">
        <InputLabel id="action-select-label">Action</InputLabel>
        <Select
          labelId="action-select-label"
          value={action}
          onChange={(e) => setAction(e.target.value as "add" | "remove")}
        >
          <MenuItem value="add">Add Products</MenuItem>
          <MenuItem value="remove">Remove Products</MenuItem>
        </Select>
      </FormControl>

      <Stack mt={2}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleOpenDialog}
          disabled={loading || !selectedClient || selectedProducts.length === 0}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : "Submit"}
        </Button>
      </Stack>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onClose={handleCloseDialog}>
        <DialogTitle>Confirm Modification</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to {action} the following products for the selected client?
          </DialogContentText>
          <Box mt={2}>
            <Typography>
              <strong>Client:</strong> {clients.find((c) => c.id === selectedClient)?.name}
            </Typography>
            <Typography>
              <strong>Email:</strong> {clients.find((c) => c.id === selectedClient)?.email}
            </Typography>
            <Typography>
              <strong>Action:</strong> {action}
            </Typography>
            <Typography>
              <strong>Products:</strong> {selectedProducts.map((p) => products.find((prod) => prod.id === p.productId)?.name).join(", ")}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="secondary">Cancel</Button>
          <Button onClick={handleSubmit} color="primary" variant="contained">Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* ✅ Messages de succès et d'erreur */}
      {successMessage && <Alert severity="success" sx={{ mt: 2 }}>{successMessage}</Alert>}
      {errorMessage && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage}</Alert>}

    </Box>
  );
}
