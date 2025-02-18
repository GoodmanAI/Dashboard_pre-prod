"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Stack,
  Button,
  TextField,
  CircularProgress,
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";

interface Client {
  id: number;
  name: string;
  email: string;
}

export default function ResetClientPassword() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
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
          setClients(data);
        } else {
          console.error("Failed to fetch clients:", data.error);
        }
      } catch (err) {
        console.error("Error fetching clients:", err);
      }
    };
    fetchClients();
  }, []);

  const handleOpenDialog = () => {
    setConfirmDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setConfirmDialogOpen(false);
  };

  const handleResetPassword = async () => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setConfirmDialogOpen(false);

    try {
      const selectedClientData = clients.find((client) => client.id === selectedClient);

      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: selectedClient,
          name: selectedClientData?.name,
          email: selectedClientData?.email,
          newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage(data.message || "Password reset successfully!");
        setSelectedClient(null);
        setNewPassword("");
      } else {
        setErrorMessage(data.error || "Failed to reset password.");
      }
    } catch (error) {
      console.error("Error resetting password:", error);
      setErrorMessage("An unexpected error occurred.");
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
        Reset Client Password
      </Typography>

      <Stack spacing={3}>
        <FormControl fullWidth>
          <InputLabel id="client-select-label">Select Client</InputLabel>
          <Select
            labelId="client-select-label"
            value={selectedClient || ""}
            onChange={(e) => setSelectedClient(Number(e.target.value))}
            MenuProps={{
                PaperProps: {
                  style: {
                    maxHeight: 200,
                    overflowY: "auto",
                  },
                },
              }}
            disabled={loading}
          >
            {clients.map((client) => (
              <MenuItem key={client.id} value={client.id}>
                {client.name} ({client.email})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="New Password"
          type="password"
          variant="outlined"
          fullWidth
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={loading}
          helperText="Must be at least 8 characters, contain uppercase, lowercase, a number, and a special character."
        />

        <Button
          variant="contained"
          color="primary"
          size="large"
          fullWidth
          onClick={handleOpenDialog}
          disabled={loading || !selectedClient || !newPassword}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : "Reset Password"}
        </Button>
      </Stack>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onClose={handleCloseDialog}>
        <DialogTitle>Confirm Password Reset</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to reset the password for the following client?
          </DialogContentText>
          <Box mt={2}>
            <Typography><strong>Client:</strong> {clients.find(c => c.id === selectedClient)?.name}</Typography>
            <Typography><strong>Email:</strong> {clients.find(c => c.id === selectedClient)?.email}</Typography>
            <Typography><strong>New Password:</strong> {newPassword}</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="secondary">Cancel</Button>
          <Button onClick={handleResetPassword} color="primary" variant="contained">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success and Error Messages */}
      {successMessage && <Alert severity="success" sx={{ mt: 2 }}>{successMessage}</Alert>}
      {errorMessage && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage}</Alert>}
    </Box>
  );
}
