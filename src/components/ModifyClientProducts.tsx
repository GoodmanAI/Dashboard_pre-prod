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

/**
 * Types de base pour les entités manipulées par ce module.
 * - Client  : cible de la modification (affiliation/désaffiliation produit).
 * - Product : produit disponible dans le catalogue.
 */
interface Client {
  id: number;
  name: string;
  email: string;
}

interface Product {
  id: number;
  name: string;
}

/**
 * Composant d’administration permettant d’affilier ou de désaffilier
 * un ensemble de produits à un client donné.
 *
 * Principes :
 * - Récupère la liste des clients et des produits au montage.
 * - Permet la sélection d’un client, d’un ou plusieurs produits, et d’une action (add/remove).
 * - Demande confirmation avant de soumettre la modification au backend.
 * - Affiche clairement l’état (chargement, succès, erreur).
 */
export default function ModifyClientProducts() {
  /* ------------------------- ÉTAT LOCAL ------------------------- */
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<{ productId: number; assignedAt: string }[]>([]);
  const [action, setAction] = useState<"add" | "remove">("add");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  /* ----------------------- FETCH : CLIENTS ----------------------- */
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

  /* ----------------------- FETCH : PRODUITS ---------------------- */
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

  /* ------------------------ HANDLERS UI ------------------------- */
  // Ouvre/ferme la boîte de dialogue de confirmation
  const handleOpenDialog = () => {
    setConfirmDialogOpen(true);
  };
  const handleCloseDialog = () => {
    setConfirmDialogOpen(false);
  };

  // Met à jour la liste des produits sélectionnés (avec date d’affiliation par défaut)
  const handleProductChange = (event: any) => {
    const selectedIds = event.target.value as number[];
    const updatedProducts = selectedIds.map((id) => {
      const existing = selectedProducts.find((p) => p.productId === id);
      return existing || { productId: id, assignedAt: new Date().toISOString() };
    });
    setSelectedProducts(updatedProducts);
  };

  /* --------------------- SUBMISSION BACKEND --------------------- */
  // Soumet l’action (add/remove) avec le client et les produits sélectionnés
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
          products: selectedProducts, // { productId, assignedAt }
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

  /* -------------------------- RENDU UI -------------------------- */
  return (
    <Box>
      {/* Titre de section */}
      <Typography variant="h5" mb={2}>
        Modify Client Products
      </Typography>

      {/* Sélection du client cible */}
      <FormControl fullWidth margin="normal">
        <InputLabel id="client-select-label">Select Client</InputLabel>
        <Select
          labelId="client-select-label"
          value={selectedClient}
          onChange={(e) => setSelectedClient(Number(e.target.value))}
          MenuProps={{
            PaperProps: {
              style: { maxHeight: 200, overflowY: "auto" },
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

      {/* Sélection multi-produits (affichage en Chips) */}
      <FormControl fullWidth margin="normal">
        <InputLabel id="product-select-label">Select Products</InputLabel>
        <Select
          labelId="product-select-label"
          multiple
          value={selectedProducts.map((p) => p.productId)}
          onChange={handleProductChange}
          MenuProps={{
            PaperProps: {
              style: { maxHeight: 200, overflowY: "auto" },
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

      {/* Choix de l’action : ajout ou retrait */}
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

      {/* Soumission (confirmation via dialog) */}
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

      {/* Boîte de dialogue de confirmation avant exécution */}
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
              <strong>Products:</strong>{" "}
              {selectedProducts
                .map((p) => products.find((prod) => prod.id === p.productId)?.name)
                .join(", ")}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="secondary">
            Cancel
          </Button>
          <Button onClick={handleSubmit} color="primary" variant="contained">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Messages de statut (succès/erreur) après soumission */}
      {successMessage && <Alert severity="success" sx={{ mt: 2 }}>{successMessage}</Alert>}
      {errorMessage && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage}</Alert>}
    </Box>
  );
}
