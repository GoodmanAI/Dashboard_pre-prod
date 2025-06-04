"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { IconEye } from "@tabler/icons-react";

const LOCAL_STORAGE_KEY_INFO = "lyrae_talk_info_fields";
const LOCAL_STORAGE_KEY_LIBELES = "lyrae_talk_libeles_fields";

const hardcodedInfoRows = [
  ["Nom du service"],
  ["Adresse"],
  ["Téléphone"],
  ["Email"],
  ["Site Web"],
];

const hardcodedLibelesRows = [
  ["NC001", "Echographie", "US"],
  ["NC002", "IRM", "MR"],
  ["NC003", "Scanner", "CT"],
  ["NC004", "Radiographie", "RX"],
  ["NC005", "Mammographie", "MG"],
  ["NC006", "Echographie Pèlvienne", "US01"],
  ["NC007", "IRM Cervical", "MR01"],
  ["NC008", "Scanner Cérébral", "CT01"],
  ["NC009", "Radiographie Poignet", "RX01"],
  ["NC010", "Radiographie Bras", "RX02"],
];

const TalkPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [openModal, setOpenModal] = useState(false);
  const [fileType, setFileType] = useState<"talkInfo" | "talkLibeles" | null>(null);
  const [formValues, setFormValues] = useState<{ [key: string]: string }>({});
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (!fileType || !openModal) return;

    const storageKey =
      fileType === "talkInfo" ? LOCAL_STORAGE_KEY_INFO : LOCAL_STORAGE_KEY_LIBELES;

    const baseData =
      fileType === "talkInfo"
        ? hardcodedInfoRows.map(([label]) => [label, ""])
        : hardcodedLibelesRows.map(row => [...row, "", "", ""]);

    const stored = localStorage.getItem(storageKey);
    if (stored) {
      setFormValues(JSON.parse(stored));
    } else {
      setFormValues(
        Object.fromEntries(
          baseData.map((row, i) => {
            const inputs =
              fileType === "talkInfo"
                ? [0]
                : [0, 1, 2].map(j => j + 3);
            return inputs.map(j => [`${i}-${j}`, ""]);
          }).flat()
        )
      );
    }

    setUploadSuccess(null);
  }, [fileType, openModal]);

  const handleOpenModal = (type: "talkInfo" | "talkLibeles") => {
    setFileType(type);
    setOpenModal(true);
  };

  const handleSave = () => {
    if (!fileType) return;
    const storageKey =
      fileType === "talkInfo" ? LOCAL_STORAGE_KEY_INFO : LOCAL_STORAGE_KEY_LIBELES;
    localStorage.setItem(storageKey, JSON.stringify(formValues));
    setUploadSuccess("Données enregistrées avec succès.");
  };

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      <Typography variant="h4" gutterBottom>
        LYRAE © Talk
      </Typography>
      <Typography variant="subtitle1" gutterBottom>
        Visualisez et modifiez les données nécessaires à votre espace LyraeTalk.
      </Typography>

      <Box sx={{ p: 3, mt: 2, bgcolor: "#fff", borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>
          Mes documents
        </Typography>

        <Box sx={{ display: "flex", gap: 10, flexWrap: "wrap", mt: 2 }}>
          <Card sx={{ flex: "1 1 250px", minHeight: "300px", borderRadius: 2, border: "1px solid #e0e0e0", p: 2 }}>
            <CardContent sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <Typography variant="h4" sx={{ mb: 4 }}>
                Document Informations
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Ce document contient les données informationnelles concernant le service radiologique.
              </Typography>
              <Box sx={{ mt: "auto", pt: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<IconEye size={18} />}
                  onClick={() => handleOpenModal("talkInfo")}
                  sx={{
                    borderColor: "#48C8AF",
                    color: "#48C8AF",
                    "&:hover": {
                      borderColor: "#48C8AF",
                      backgroundColor: "rgba(72,200,175,0.08)",
                    },
                  }}
                >
                  Voir
                </Button>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ flex: "1 1 250px", minHeight: "300px", borderRadius: 2, border: "1px solid #e0e0e0", p: 2 }}>
            <CardContent sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <Typography variant="h4" sx={{ mb: 4 }}>
                Document Libellés
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Ce document contient les libellés personnalisés propres à votre service.
              </Typography>
              <Box sx={{ mt: "auto", pt: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<IconEye size={18} />}
                  onClick={() => handleOpenModal("talkLibeles")}
                  sx={{
                    borderColor: "#48C8AF",
                    color: "#48C8AF",
                    "&:hover": {
                      borderColor: "#48C8AF",
                      backgroundColor: "rgba(72,200,175,0.08)",
                    },
                  }}
                >
                  Voir
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          Données de {fileType === "talkInfo" ? "Document Informations" : "Document Libellés"}
        </DialogTitle>
        <DialogContent dividers sx={{ maxHeight: "70vh", overflowY: "auto" }}>
          <Box sx={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {(fileType === "talkInfo"
                    ? ["Étiquette", "Valeur"]
                    : ["Code Neuracorp", "Libellé Neuracorp", "Code type examen Neuracorp", "Code Client", "Libellé Client", "Code type examen Client"]
                  ).map((header, idx) => (
                    <th
                      key={idx}
                      style={{
                        borderBottom: "1px solid #ddd",
                        padding: "8px",
                        textAlign: "left",
                        backgroundColor: "#f5f5f5",
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(fileType === "talkInfo" ? hardcodedInfoRows : hardcodedLibelesRows).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((value, colIndex) => (
                      <td key={colIndex} style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                        {value}
                      </td>
                    ))}
                    {Array.from({ length: fileType === "talkInfo" ? 1 : 3 }).map((_, i) => {
                      const colOffset = fileType === "talkInfo" ? 1 : 3;
                      const fieldKey = `${rowIndex}-${i + colOffset}`;
                      return (
                        <td key={fieldKey} style={{ padding: "8px" }}>
                          <TextField
                            fullWidth
                            size="small"
                            variant="outlined"
                            value={formValues[fieldKey] || ""}
                            onChange={(e) =>
                              setFormValues({ ...formValues, [fieldKey]: e.target.value })
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
          {uploadSuccess && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {uploadSuccess}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setOpenModal(false)}
            sx={{
              color: "#48C8AF",
              borderColor: "#48C8AF",
              "&:hover": {
                backgroundColor: "rgba(72,200,175,0.08)",
                borderColor: "#48C8AF",
              },
            }}
          >
            Fermer
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            sx={{
              backgroundColor: "#48C8AF",
              "&:hover": { backgroundColor: "#3AB19B" },
            }}
          >
            Valider
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TalkPage;
