"use client";

import { useState } from "react";
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
  Alert,
} from "@mui/material";
import CustomTextField from "@/app/(DashboardLayout)/components/forms/theme-elements/CustomTextField";

export default function CreateProductPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ field?: string; message: string }[]>([]);

  const handleOpenDialog = (e: React.FormEvent) => {
    e.preventDefault();
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleCreateProduct = async () => {
    setLoading(true);
    setErrors([]);
    setSuccessMessage(null);
    setErrorMessage(null);
    setOpenDialog(false);

    try {
      const response = await fetch("/api/admin/create-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccessMessage("Produit créé avec succès ! ✅");
        setName("");
        setDescription("");
      } else {
        if (data.error && data.details) {
          setErrors(data.details);
          setErrorMessage(data.error);
        } else {
          setErrors([]);
          setErrorMessage(data.error || "Une erreur s'est produite.");
        }
      }
    } catch (err) {
      setErrorMessage("Une erreur inattendue s'est produite.");
    } finally {
      setLoading(false);
    }
  };

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
        Créer un produit
      </Typography>
      <form onSubmit={handleOpenDialog}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600} component="label" htmlFor="name" mb="5px">
              Nom du produit
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
            <Typography variant="subtitle1" fontWeight={600} component="label" htmlFor="description" mb="5px">
              Description (optionnel)
            </Typography>
            <CustomTextField
              id="description"
              type="text"
              variant="outlined"
              fullWidth
              value={description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
              disabled={loading}
              error={!!errors.find((err) => err.field === "description")}
              helperText={errors.find((err) => err.field === "description")?.message || ""}
            />
          </Box>
          <Box>
            <Button color="primary" variant="contained" size="large" fullWidth type="submit" disabled={loading}>
              {loading ? "Création en cours…" : "Créer le produit"}
            </Button>
          </Box>
        </Stack>
      </form>

      {/* Confirmation Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <DialogTitle id="confirm-dialog-title">Confirmation</DialogTitle>
        <DialogContent>
          <DialogContentText id="confirm-dialog-description">
            Êtes-vous sûr de vouloir créer ce produit avec les informations suivantes ?
          </DialogContentText>
          <Box mt={2}>
            <Typography>
              <strong>Nom :</strong> {name}
            </Typography>
            <Typography>
              <strong>Description :</strong> {description || "Aucune description"}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="secondary">
            Non
          </Button>
          <Button onClick={handleCreateProduct} color="primary" variant="contained" disabled={loading}>
            Oui
          </Button>
        </DialogActions>
      </Dialog>

      {/* Messages de succès et d'erreur */}
      {successMessage && <Alert severity="success" sx={{ mt: 2 }}>{successMessage}</Alert>}
      {errorMessage && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage}</Alert>}
    </Box>
  );
}
