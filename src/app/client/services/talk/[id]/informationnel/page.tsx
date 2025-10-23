"use client";

/**
 * Page LYRAE © Talk — Informations & Libellés
 * ---------------------------------------------------------------------------
 * - Édition des deux documents (Informations / Libellés) en pleine page.
 * - Persistance locale par centre/utilisateur via `localStorage` « namespacé ».
 * - Accès depuis la page Talk (bouton “Informations & Libellés”).
 *
 * ⚠️ Ces données sont purement locales (non envoyées à l’API) : elles
 *    servent d’espace de travail côté client. Un flux d’envoi serveur
 *    pourra être ajouté ultérieurement.
 */

import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Alert,
  Stack,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { IconEye, IconChevronLeft } from "@tabler/icons-react";
import { useCentre } from "@/app/context/CentreContext";

/** Clés de base (suffixées par l’ID centre/utilisateur pour isoler les données). */
const LOCAL_STORAGE_KEY_INFO = "lyrae_talk_info_fields";
const LOCAL_STORAGE_KEY_LIBELES = "lyrae_talk_libeles_fields";

/** Modèles statiques : Informations */
const hardcodedInfoRows = [
  ["Nom du service"],
  ["Adresse"],
  ["Téléphone"],
  ["Email"],
  ["Site Web"],
];

/** Modèles statiques : Libellés */
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

export default function TalkInformationnelPage() {
  /** Auth + Navigation */
  const { data: session, status } = useSession();
  const router = useRouter();

  /** Contexte centre pour « namespacer » les données locales */
  const { selectedUserId, selectedCentre } = useCentre();

  /** ID cible (centre sélectionné ou utilisateur courant) */
  const targetUserId =
    selectedUserId ?? (session?.user?.id ? Number(session.user.id) : undefined);

  /** Générateur de clé localStorage isolée par centre/utilisateur */
  const storageKey = (base: string) =>
    targetUserId ? `${base}_${targetUserId}` : base;

  // États du formulaire + feedback
  const [infoValues, setInfoValues] = useState<Record<string, string>>({});
  const [libValues, setLibValues] = useState<Record<string, string>>({});
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [successLib, setSuccessLib] = useState<string | null>(null);

  /** Redirection si non authentifié */
  useEffect(() => {
    if (status === "unauthenticated") router.push("/authentication/signin");
  }, [status, router]);

  /**
   * Initialisation des valeurs “Informations”
   * - 1 seule colonne éditable (index 1)
   */
  useEffect(() => {
    const key = storageKey(LOCAL_STORAGE_KEY_INFO);

    // Valeurs par défaut (vides) pour chaque ligne
    const base = Object.fromEntries(
      hardcodedInfoRows
        .map((_, i) => [[`${i}-1`, ""]])
        .flat()
    );

    const stored =
      typeof window !== "undefined" ? localStorage.getItem(key) : null;

    setInfoValues(stored ? JSON.parse(stored) : base);
    setSuccessInfo(null);
  }, [selectedUserId, session?.user?.id]);

  /**
   * Initialisation des valeurs “Libellés”
   * - 3 colonnes éditables (index 3, 4, 5)
   */
  useEffect(() => {
    const key = storageKey(LOCAL_STORAGE_KEY_LIBELES);

    const base = Object.fromEntries(
      hardcodedLibelesRows
        .map((_, i) => [
          [`${i}-3`, ""], // Code Client
          [`${i}-4`, ""], // Libellé Client
          [`${i}-5`, ""], // Code type examen Client
        ])
        .flat()
    );

    const stored =
      typeof window !== "undefined" ? localStorage.getItem(key) : null;

    setLibValues(stored ? JSON.parse(stored) : base);
    setSuccessLib(null);
  }, [selectedUserId, session?.user?.id]);

  /** Persistance locale : Informations */
  const saveInfo = () => {
    localStorage.setItem(storageKey(LOCAL_STORAGE_KEY_INFO), JSON.stringify(infoValues));
    setSuccessInfo("Données ‘Informations’ enregistrées avec succès.");
  };

  /** Persistance locale : Libellés */
  const saveLib = () => {
    localStorage.setItem(storageKey(LOCAL_STORAGE_KEY_LIBELES), JSON.stringify(libValues));
    setSuccessLib("Données ‘Libellés’ enregistrées avec succès.");
  };

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      {/* En-tête + retour Talk */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            LYRAE © Talk — Informations & Libellés
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            {selectedCentre
              ? `Centre : ${selectedCentre.name ?? selectedCentre.email}`
              : "Vos documents locaux (par utilisateur)."}
          </Typography>
        </Box>

        <Button
                  variant="outlined"
                  startIcon={<IconChevronLeft size={18} />}
                  onClick={() => router.push("/client/services/talk")}
                  sx={{
                    borderColor: "#48C8AF",
                    color: "#48C8AF",
                    whiteSpace: "nowrap",
                    "&:hover": {
                      borderColor: "#48C8AF",
                      backgroundColor: "rgba(72,200,175,0.08)",
                    },
                  }}
                >
                  Retour à Talk
                </Button>
      </Stack>

      {/* Document Informations */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          Document Informations
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Données informationnelles concernant le service radiologique.
        </Typography>

        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Étiquette", "Valeur"].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      borderBottom: "1px solid #ddd",
                      padding: 8,
                      textAlign: "left",
                      backgroundColor: "#f5f5f5",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hardcodedInfoRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{row[0]}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                    <TextField
                      fullWidth
                      size="small"
                      value={infoValues[`${rowIndex}-1`] || ""}
                      onChange={(e) =>
                        setInfoValues((prev) => ({
                          ...prev,
                          [`${rowIndex}-1`]: e.target.value,
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={saveInfo}
            sx={{ backgroundColor: "#48C8AF", "&:hover": { backgroundColor: "#3AB19B" } }}
          >
            Enregistrer
          </Button>
          {successInfo && <Alert severity="success" sx={{ mt: 2 }}>{successInfo}</Alert>}
        </Box>
      </Paper>

      {/* Document Libellés */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          Document Libellés
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Libellés personnalisés du service (codes et correspondances).
        </Typography>

        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Code Neuracorp",
                  "Libellé Neuracorp",
                  "Code type examen Neuracorp",
                  "Code Client",
                  "Libellé Client",
                  "Code type examen Client",
                ].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      borderBottom: "1px solid #ddd",
                      padding: 8,
                      textAlign: "left",
                      backgroundColor: "#f5f5f5",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hardcodedLibelesRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((value, colIndex) => (
                    <td key={colIndex} style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      {value}
                    </td>
                  ))}
                  {([3, 4, 5] as const).map((colIndex) => {
                    const fieldKey = `${rowIndex}-${colIndex}`;
                    return (
                      <td key={fieldKey} style={{ padding: 8 }}>
                        <TextField
                          fullWidth
                          size="small"
                          value={libValues[fieldKey] || ""}
                          onChange={(e) =>
                            setLibValues((prev) => ({
                              ...prev,
                              [fieldKey]: e.target.value,
                            }))
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

        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={saveLib}
            sx={{ backgroundColor: "#48C8AF", "&:hover": { backgroundColor: "#3AB19B" } }}
          >
            Enregistrer
          </Button>
          {successLib && <Alert severity="success" sx={{ mt: 2 }}>{successLib}</Alert>}
        </Box>
      </Paper>
    </Box>
  );
}
