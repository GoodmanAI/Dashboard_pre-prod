"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Stack,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Alert,
} from "@mui/material";
import CustomTextField from "@/app/(DashboardLayout)/components/forms/theme-elements/CustomTextField";

/**
 * Page de création d’un client (coté Admin).
 * - Récupère le catalogue de produits.
 * - Soumet un formulaire de création d’utilisateur + rattachement de produits.
 * - Confirme l’action via une modale récapitulative.
 */
export default function CreateClientPage() {
  /** État du formulaire principal. */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [products, setProducts] = useState<{ productId: number; assignedAt: string }[]>([]);

  /** Données de référence & statut UI. */
  const [availableProducts, setAvailableProducts] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ field?: string; message: string }[]>([]);
  const [openDialog, setOpenDialog] = useState(false);

  /**
   * Effet: charge la liste des produits disponibles pour l’affectation.
   * Appelle l’API admin `/api/products` (protégée côté serveur).
   */
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("/api/products");
        const data = await response.json();
        if (response.ok) {
          setAvailableProducts(data || []);
        } else {
          console.error("Failed to fetch products:", data.error);
        }
      } catch (err) {
        console.error("Error fetching products:", err);
      }
    };
    fetchProducts();
  }, []);

  /**
   * Ouvre la modale de confirmation avant de créer le client.
   * On intercepte le submit natif pour ne pas déclencher la requête immédiatement.
   */
  const handleOpenDialog = (e: React.FormEvent) => {
    e.preventDefault();
    setOpenDialog(true);
  };

  /** Ferme la modale de confirmation. */
  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  /**
   * Envoi du formulaire de création au backend.
   * - Réinitialise les messages/erreurs.
   * - POST vers `/api/admin/create-client`.
   * - Gère le succès/échec et nettoie le formulaire si nécessaire.
   */
  const handleCreateClient = async () => {
    setLoading(true);
    setErrors([]);
    setSuccessMessage(null);
    setErrorMessage(null);
    setOpenDialog(false);

    try {
      const response = await fetch("/api/admin/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, products }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage("Client créé avec succès ! ✅");
        setEmail("");
        setPassword("");
        setName("");
        setProducts([]);
      } else {
        if (data.error && data.details) {
          setErrors(data.details);
          setErrorMessage(data.error);
        } else {
          setErrors([]);
          setErrorMessage(data.error || "Une erreur s'est produite.");
        }
      }
    } catch {
      setErrorMessage("Une erreur inattendue s'est produite.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Gestion des produits sélectionnés (multi-select).
   * - Construit la liste de liens { productId, assignedAt }.
   * - Conserve la date d’affectation déjà saisie si le produit est re-sélectionné.
   */
  const handleProductChange = (event: any) => {
    const selectedIds = event.target.value as number[];
    const updatedProducts = selectedIds.map((id) => {
      const existing = products.find((p) => p.productId === id);
      return existing || { productId: id, assignedAt: new Date().toISOString() };
    });
    setProducts(updatedProducts);
  };

  /**
   * Rendu principal :
   * - Formulaire (nom, email, mot de passe, produits).
   * - Modale de confirmation avec récapitulatif.
   * - Messages de succès/erreur.
   */
  return (
    <Box
      sx={{
        maxWidth: "600px",
        margin: "auto",
        p: 4,
        backgroundColor: "white",
        boxShadow: 3,
        borderRadius: 2,
      }}
    >
      <Typography fontWeight="700" variant="h4" textAlign="center" mb={2}>
        Create Client
      </Typography>

      <form onSubmit={handleOpenDialog}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600} component="label" htmlFor="name" mb="5px">
              Name
            </Typography>
            <CustomTextField
              id="name"
              type="text"
              variant="outlined"
              fullWidth
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              disabled={loading}
              error={!!errors.find((err) => err.field === "name")}
              helperText={errors.find((err) => err.field === "name")?.message || ""}
            />
          </Box>

          <Box>
            <Typography variant="subtitle1" fontWeight={600} component="label" htmlFor="email" mb="5px">
              Email
            </Typography>
            <CustomTextField
              id="email"
              type="email"
              variant="outlined"
              fullWidth
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              disabled={loading}
              error={!!errors.find((err) => err.field === "email")}
              helperText={errors.find((err) => err.field === "email")?.message || ""}
            />
          </Box>

          <Box>
            <Typography variant="subtitle1" fontWeight={600} component="label" htmlFor="password" mb="5px">
              Password
            </Typography>
            <CustomTextField
              id="password"
              type="password"
              variant="outlined"
              fullWidth
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              disabled={loading}
              error={!!errors.find((err) => err.field === "password")}
              helperText={errors.find((err) => err.field === "password")?.message || ""}
            />
          </Box>

          <Box>
            <Typography variant="subtitle1" fontWeight={600} component="label" htmlFor="products" mb="5px">
              Products
            </Typography>
            <CustomTextField
              id="products"
              select
              variant="outlined"
              fullWidth
              SelectProps={{
                multiple: true,
                value: products.map((p) => p.productId),
                onChange: handleProductChange,
              }}
              disabled={loading}
            >
              {availableProducts?.length ? (
                availableProducts.map((product) => (
                  <MenuItem key={product.id} value={product.id}>
                    {product.name}
                  </MenuItem>
                ))
              ) : (
                <MenuItem disabled>Aucun produit disponible</MenuItem>
              )}
            </CustomTextField>
          </Box>

          <Box>
            <Button color="primary" variant="contained" size="large" fullWidth type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Client"}
            </Button>
          </Box>
        </Stack>
      </form>

      {/* Modale de confirmation avant envoi */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <DialogTitle id="confirm-dialog-title">Confirmation</DialogTitle>
        <DialogContent>
          <DialogContentText id="confirm-dialog-description">
            Êtes-vous sûr de vouloir créer ce client avec les informations suivantes ?
          </DialogContentText>
          <Box mt={2}>
            <Typography>
              <strong>Name:</strong> {name}
            </Typography>
            <Typography>
              <strong>Email:</strong> {email}
            </Typography>
            <Typography>
              <strong>Password:</strong> {password}
            </Typography>
            <Typography>
              <strong>Products:</strong>{" "}
              {products
                .map((p) => availableProducts.find((ap) => ap.id === p.productId)?.name)
                .filter(Boolean)
                .join(", ")}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="secondary">
            Non
          </Button>
          <Button onClick={handleCreateClient} color="primary" variant="contained" disabled={loading}>
            Oui
          </Button>
        </DialogActions>
      </Dialog>

      {/* Messages utilisateurs */}
      {successMessage && <Alert severity="success" sx={{ mt: 2 }}>{successMessage}</Alert>}
      {errorMessage && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage}</Alert>}
    </Box>
  );
}
