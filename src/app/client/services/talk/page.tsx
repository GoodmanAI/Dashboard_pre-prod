"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  TextField,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// Interfaces pour les données de fichiers
interface FileData {
  fileName: string | null;
  fileUrl: string | null;
  validated: boolean;
}

interface FilesResponse {
  talkInfo: FileData;
  talkLibeles: FileData;
}

// Fonction pour parser un texte CSV en tableau 2D
const parseCSV = (csvText: string): string[][] => {
  return csvText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.split(",").map(cell => cell.trim()));
};

const TalkPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [filesData, setFilesData] = useState<FilesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"talkInfo" | "talkLibeles" | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [modalContent, setModalContent] = useState<string>("");
  const [showUpload, setShowUpload] = useState(false);
  const [openValidationModal, setOpenValidationModal] = useState(false);

  // Redirection si non connecté
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  // Récupération des informations des fichiers
  useEffect(() => {
    async function fetchFilesData() {
      try {
        const res = await fetch("/api/files/get-files");
        if (!res.ok) {
          console.error("Erreur lors du fetch des fichiers.");
          return;
        }
        const data = await res.json();
        setFilesData(data);
      } catch (error) {
        console.error("Erreur lors de la récupération des données fichiers :", error);
      } finally {
        setLoading(false);
      }
    }
    if (session) {
      fetchFilesData();
    }
  }, [session]);

  // Gérer le changement de fichier sélectionné
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Envoi du fichier via la route PUT
  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError("Veuillez sélectionner un fichier avant de confirmer la modification.");
      return;
    }
    if (!fileType) return;
    setUploadError(null);
    setUploadSuccess(null);
    const formData = new FormData();
    formData.append("file", selectedFile);
    try {
      const res = await fetch(`/api/files/uploads?type=${fileType}`, {
        method: "PUT",
        body: formData,
      });
      const json = await res.json();
      if (res.ok) {
        setUploadSuccess(json.message || "Fichier mis à jour avec succès.");
        // Rafraîchir les données
        const res2 = await fetch("/api/files/get-files");
        const data2 = await res2.json();
        setFilesData(data2);
        setShowUpload(false);
      } else {
        setUploadError(json.error || "Erreur lors de l'upload du fichier.");
      }
    } catch (error) {
      setUploadError("Erreur inattendue lors de l'upload.");
    }
  };

  // Afficher le contenu du fichier dans la modale
  const handleViewFile = async (type: "talkInfo" | "talkLibeles", fileUrl: string | null) => {
    if (!fileUrl) return;
    setFileType(type);
    try {
      const res = await fetch(fileUrl);
      const text = await res.text();
      setModalContent(text);
    } catch (error) {
      console.error("Erreur lors du chargement du fichier :", error);
      setModalContent("Erreur lors du chargement du contenu.");
    }
    setOpenModal(true);
    // Si le document n'est pas validé, on affiche l'option de modification dans la modale
    setShowUpload(true);
  };

  // Confirmation de validation du document via l'API
  const handleValidateDocument = async () => {
    if (!fileType) return;
    try {
      const res = await fetch(`/api/files/validation?type=${fileType}`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok) {
        setUploadSuccess(json.message || "Document validé avec succès.");
        const res2 = await fetch("/api/files/get-files");
        const data2 = await res2.json();
        setFilesData(data2);
      } else {
        setUploadError(json.error || "Erreur lors de la validation du document.");
      }
    } catch (error) {
      setUploadError("Erreur inattendue lors de la validation du document.");
    }
    setOpenValidationModal(false);
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress
          sx={{
            '& .MuiCircularProgress-svg': {
              color: '#48C8AF',
            },
          }}
        />
      </Box>
    );
  }

  if (!filesData) {
    return <Typography color="error">Erreur lors du chargement des informations des documents.</Typography>;
  }

  const talkInfo = filesData.talkInfo;
  const talkLibeles = filesData.talkLibeles;

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Mes documents LyraeTalk
      </Typography>

      {/* Section pour le document "talkInfo" */}
      <Box sx={{ my: 3, p: 2, border: "1px solid #ccc", borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>
          Document Informations
        </Typography>
        <Button
          variant="outlined"
          onClick={() => handleViewFile("talkInfo", talkInfo.fileUrl)}
          sx={{
            mr: 2,
            mt: 1,
            borderColor: "#48C8AF",
            color: "#48C8AF",
            "&:hover": {
              borderColor: "#48C8AF",
              backgroundColor: "rgba(72,200,175,0.08)",
              color: "#48C8AF"
            }
          }}>
          Voir
        </Button>
        {!talkInfo.validated && (
          <Button 
            variant="contained" 
            sx={{
              mt: 1,
              backgroundColor: "#48C8AF",
              "&:hover": { backgroundColor: "#3AB19B" }
            }} onClick={() => setOpenValidationModal(true)}>
            Valider mon document informationnel
          </Button>
        )}
      </Box>

      {/* Section pour le CSV "talkLibeles" */}
      <Box sx={{ my: 3, p: 2, border: "1px solid #ccc", borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>
          Document Libellés
        </Typography>
        <Button
          variant="outlined"
          onClick={() => handleViewFile("talkLibeles", talkLibeles.fileUrl)}
          sx={{
            mr: 2,
            mt: 1,
            borderColor: "#48C8AF",
            color: "#48C8AF",
            "&:hover": {
              borderColor: "#48C8AF",
              backgroundColor: "rgba(72,200,175,0.08)",
              color: "#48C8AF"
            }
          }}>
          Voir
        </Button>
        {!talkLibeles.validated && (
          <Button
            variant="contained"
            sx={{
              mt: 1,
              backgroundColor: "#48C8AF",
              "&:hover": { backgroundColor: "#3AB19B" }
            }}
            onClick={() => setOpenValidationModal(true)}>
            Valider mon document des Libellés
          </Button>
        )}
      </Box>

      {/* Modal pour afficher le contenu du fichier CSV sous forme de tableau */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="md" fullWidth>
        <DialogTitle>Contenu du fichier</DialogTitle>
        <DialogContent dividers>
          {modalContent ? (
            <Box sx={{ overflowX: "auto", mb: 2 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {parseCSV(modalContent).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} style={{ border: "1px solid #ccc", padding: "8px" }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          ) : (
            <Typography>Aucun contenu à afficher.</Typography>
          )}
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Button
              variant="contained"
              component="a"
              href={
                fileType === "talkInfo"
                  ? talkInfo.fileUrl || "#"
                  : talkLibeles.fileUrl || "#"
              }
              download
            >
              Télécharger
            </Button>
            {(!(
              (fileType === "talkInfo" && talkInfo.validated) ||
              (fileType === "talkLibeles" && talkLibeles.validated)
            )) && (
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <TextField
                  type="file"
                  onChange={handleFileChange}
                  inputProps={{ accept: ".csv" }}
                  sx={{ mr: 2 }}
                />
                <Button variant="contained" onClick={handleUpload}>
                  Confirmer modification
                </Button>
              </Box>
            )}
          </Box>
          {uploadError && <Alert severity="error" sx={{ mt: 2 }}>{uploadError}</Alert>}
          {uploadSuccess && <Alert severity="success" sx={{ mt: 2 }}>{uploadSuccess}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenModal(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Modal de confirmation pour validation du document */}
      <Dialog
        open={openValidationModal}
        onClose={() => setOpenValidationModal(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Valider Document</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body1">
            Êtes-vous sûr de valider définitivement ces informations ?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenValidationModal(false)} color="secondary">
            Non
          </Button>
          <Button variant="contained" onClick={handleValidateDocument} color="primary">
            Oui
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TalkPage;
