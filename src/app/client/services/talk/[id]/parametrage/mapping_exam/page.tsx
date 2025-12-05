"use client";

import { useState, useEffect } from "react";
import SaveIcon from "@mui/icons-material/Save";
import SettingsIcon from "@mui/icons-material/Settings";
import { Stack, Button, Snackbar, Alert, Portal } from "@mui/material";
import { useRouter } from "next/navigation";
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';

interface TalkPageProps {
  params: { id: string };
}

interface EditableTableProps {
  data: any[];
  setData: React.Dispatch<React.SetStateAction<any[]>>;
}

function EditableTable({ data, setData }: EditableTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRows = data.slice(startIndex, endIndex);
  const totalPages = Math.ceil(data.length / rowsPerPage);

  const visibleKeys = [
    "typeExamen",
    "codeExamen",
    "libelle",
    "typeExamenClient",
    "codeExamenClient",
    "libelleClient"
  ];

  const handleChange = (rowIndex: number, key: string, value: string) => {
    setData(prev => {
      const updated = [...prev];
      updated[startIndex + rowIndex] = {
        ...updated[startIndex + rowIndex],
        [key]: value,
      };
      return updated;
    });
  };

  return (
    <div>
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <thead>
          <tr>
            {visibleKeys.map((key) => (
              <th key={key} style={{
                border: "1px solid #ccc",
                padding: "8px",
                backgroundColor: "#eee",
                textAlign: "left"
              }}>
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {currentRows.map((row, rowIndex) => (
            <tr key={rowIndex} style={{
              backgroundColor: rowIndex % 2 === 0 ? "rgba(74,200,175,0.1)" : "#fff"
            }}>
              {visibleKeys.map((key) => {
                const isClientCol = key.includes("Client");
                return (
                  <td key={key} style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {isClientCol ? (
                      <input
                        type="text"
                        value={row[key] || ""}
                        onChange={(e) => handleChange(rowIndex, key, e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", padding: "6px" }}
                      />
                    ) : (
                      <span>{row[key]}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div style={{ marginTop: "10px", display: "flex", justifyContent: "center", gap: "10px" }}>
        <button
          onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
          style={{ padding: "5px 10px", cursor: currentPage === 1 ? "not-allowed" : "pointer" }}
        >
          Previous
        </button>
        <span>Page {currentPage} of {totalPages}</span>
        <button
          onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
          disabled={currentPage === totalPages}
          style={{ padding: "5px 10px", cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function MappingExam({ params }: TalkPageProps) {
  const [data, setData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({ open: false, message: "", severity: "success" });
  const router = useRouter();
  const userProductId = Number(params.id);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/configuration/get/mapping?userProductId=${userProductId}`);
        if (res.ok) {
          const json = await res.json();
          const formatted = Array.isArray(json) ? json : Object.values(json);
          setData(formatted);
        } else if (res.status === 404) {
          const fallbackRes = await fetch("/api/data/exams");
          if (!fallbackRes.ok) throw new Error("Failed to load default exams");
          const fallbackJson = await fallbackRes.json();
          setData(fallbackJson);
        } else {
          throw new Error(`Unexpected response: ${res.status}`);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, [userProductId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/configuration/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProductId, data })
      });
      if (!response.ok) throw new Error(`Failed to save: ${response.statusText}`);
      setSnack({ open: true, message: "Configuration enregistrée avec succès.", severity: "success" });
    } catch (error) {
      console.error(error);
      setSnack({ open: true, message: "Erreur lors de la sauvegarde.", severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold mb-8">Correspondance des Examens</h1>

      <Button
        variant="contained"
        startIcon={<ArrowBackIosIcon />}
        onClick={() => router.back()}
        disabled={saving}
        sx={{ backgroundColor: "#48C8AF", "&:hover": { backgroundColor: "#3bb49d" }, marginBottom: "10px" }}
      >
        Retour
      </Button>

      {data.length > 0 && (
        <>
          <EditableTable data={data} setData={setData} />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{
            position: "sticky", bottom: 0, bgcolor: "rgba(248,248,248,0.9)",
            backdropFilter: "blur(6px)", py: 1.5, px: 2, mt: 2,
            borderTop: "1px solid #eee", justifyContent: "space-between"
          }}>
            <Button
              variant="contained"
              startIcon={<SettingsIcon />}
              onClick={() => router.push(`/client/services/talk/${userProductId}/parametrage/mapping_exam/type_exam`)}
              disabled={saving}
              sx={{ backgroundColor: "#48C8AF", "&:hover": { backgroundColor: "#3bb49d" } }}
            >
              Modifier Types d&apos;examens
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saving}
              sx={{ backgroundColor: "#48C8AF", "&:hover": { backgroundColor: "#3bb49d" } }}
            >
              Enregistrer
            </Button>
          </Stack>

          <Portal>
            <Snackbar
              anchorOrigin={{ vertical: "top", horizontal: "right" }}
              open={snack.open}
              autoHideDuration={3000}
              onClose={() => setSnack((s) => ({ ...s, open: false }))}
            >
              <Alert severity={snack.severity}>{snack.message}</Alert>
            </Snackbar>
          </Portal>
        </>
      )}
    </main>
  );
}
