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

/**
 * Page d’administration : création d’un produit.
 * Responsabilités :
 *  - Gérer un formulaire contrôlé (nom, description).
 *  - Afficher une boîte de confirmation avant soumission.
 *  - Appeler l’API `/api/admin/create-product` et gérer les retours (succès/erreur).
 *  - Fournir un retour utilisateur clair (Alertes).
 */
export default function CreateProductPage() {
  /** État du formulaire (contrôlé). */
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  /** État UI (chargement, modale, messages, erreurs de validation backend). */
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ field?: string; message: string }[]>([]);

  /**
   * Ouvre la boîte de dialogue de confirmation au submit du formulaire.
   * Intercepte le submit pour éviter l’envoi direct au backend.
   */
  const handleOpenDialog = (e: React.FormEvent) => {
    e.preventDefault();
    setOpenDialog(true);
  };

  /** Ferme la boîte de dialogue de confirmation. */
  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  /**
   * Valide la création côté serveur.
   * - POST sur `/api/admin/create-product`.
   * - Nettoie le formulaire si succès.
   * - Alimente les messages et erreurs si échec.
   */
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
    } catch {
      setErrorMessage("Une erreur inattendue s'est produite.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Rendu : formulaire, boîte de confirmation, et messages utilisateur.
   * Le formulaire est volontairement simple (nom + description optionnelle).
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
        Créer un produit
      </Typography>

      {/* Formulaire principal contrôlé */}
      <form onSubmit={handleOpenDialog}>
        <Stack spacing={3}>
          {/* Champ : Nom du produit */}
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

          {/* Champ : Description (optionnelle) */}
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

          {/* CTA : Soumission (ouvre la modale de confirmation) */}
          <Box>
            <Button color="primary" variant="contained" size="large" fullWidth type="submit" disabled={loading}>
              {loading ? "Création en cours…" : "Créer le produit"}
            </Button>
          </Box>
        </Stack>
      </form>

      {/* Modale de confirmation avant envoi serveur */}
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

      {/* Messages de statut utilisateur */}
      {successMessage && <Alert severity="success" sx={{ mt: 2 }}>{successMessage}</Alert>}
      {errorMessage && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage}</Alert>}
    </Box>
  );
}
