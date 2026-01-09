"use client";

import { useState, useEffect } from "react";
import SaveIcon from "@mui/icons-material/Save";
import SettingsIcon from "@mui/icons-material/Settings";
import { Stack, Button, Snackbar, Alert, Portal, TextField } from "@mui/material";
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
  const [search, setSearch] = useState("");

  const rowsPerPage = 20;

  // 🔍 Filtering rows
  const filteredRows = data.filter((row) =>
    Object.values(row).some((value: any) =>
      String(value || "").toLowerCase().includes(search.toLowerCase())
    )
  );

  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = filteredRows.slice(startIndex, startIndex + rowsPerPage);
  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);

  const visibleKeys = [
    "typeExamen",
    "codeExamen",
    "libelle",
    "codeExamenClient",
    "libelleClient",
    "performed", // <-- New column
  ];

  const columnLabels: Record<string, string> = {
  typeExamen: "Type examen",
  codeExamen: "Code examen",
  libelle: "Libellé",
  codeExamenClient: "Code examen client",
  libelleClient: "Libellé client",
  performed: "Attribué à Lyrae", // 👈 changement uniquement visuel
};

  const handleChange = (codeExamen: string, key: string, value: any) => {
    setData((prev) =>
      prev.map((row) =>
        row.codeExamen === codeExamen
          ? { ...row, [key]: value }
          : row
      )
    );
  };

  return (
    <div>
      {/* 🔍 Search bar */}
      <div style={{ marginBottom: "15px", maxWidth: 350 }}>
        <TextField
          label="Rechercher..."
          variant="outlined"
          size="small"
          fullWidth
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

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
                {columnLabels[key] ?? key}
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
                const isEditable =
                  key.includes("Client") || key === "performed";

                return (
                  <td key={key} style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {/* NEW: checkbox for "performed" */}
                    {key === "performed" ? (
                      <input
                        type="checkbox"
                        checked={!!row[key]}
                        onChange={(e) =>
                          handleChange(row.codeExamen, key, e.target.checked)
                        }
                      />
                      // <input
                      //   type="checkbox"
                      //   checked={!!row[key]}
                      //   onChange={(e) =>
                      //     handleChange(
                      //       (currentPage - 1) * rowsPerPage + rowIndex,
                      //       key,
                      //       e.target.checked
                      //     )
                      //   }
                      // />
                    ) : isEditable ? (
                      <>
                      {/* {console.log("row", row)} */}
                      <input
                        type="text"
                        value={row[key] ?? ""}
                        onChange={(e) =>
                          handleChange(row.codeExamen, key, e.target.value)
                        }
                        style={{ width: "100%", boxSizing: "border-box", padding: "6px" }}
                      />
                      {/* <input
                        type="text"
                        value={row[key] ?? ""}
                        onChange={(e) =>
                          handleChange(
                            (currentPage - 1) * rowsPerPage + rowIndex,
                            key,
                            e.target.value
                          )
                        }
                        style={{ width: "100%", boxSizing: "border-box", padding: "6px" }}
                      /> */}

                      </>
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
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
        >
          Previous
        </button>
        <span>Page {currentPage} sur {totalPages}</span>
        <button
          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
          disabled={currentPage === totalPages}
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
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success"
  });

  const router = useRouter();
  const userProductId = Number(params.id);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/configuration/get/mapping?userProductId=${userProductId}`);
        if (res.ok) {
          const json = await res.json();
          const formatted = Array.isArray(json) ? json : Object.values(json);
          const withPerformed = formatted.map((row: any) => ({
            ...row,
            performed: row.performed === undefined ? true : row.performed,
            codeExamenClient:
              row.codeExamenClient === "NONE" || row.codeExamenClient === null
                ? ""
                : row.codeExamenClient,
          }));
        
          setData(withPerformed);
        } else if (res.status === 404) {
          const fallbackRes = await fetch("/api/data/exams");
          const fallbackJson = await fallbackRes.json();
          setData(fallbackJson);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, [userProductId]);

  useEffect(() => {
    console.log(data);
  }, [data])
  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/configuration/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProductId, data })
      });

      if (!response.ok) throw new Error("Failed to save");

      setSnack({ open: true, message: "Configuration enregistrée.", severity: "success" });
    } catch (error) {
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
        sx={{ backgroundColor: "#48C8AF" }}
      >
        Retour
      </Button>

      {data.length > 0 && (
        <>
          <EditableTable data={data} setData={setData} />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ position: "sticky", bottom: 0 }}>
            <Button
              variant="contained"
              startIcon={<SettingsIcon />}
              onClick={() =>
                router.push(`/client/services/talk/${userProductId}/parametrage/mapping_exam/type_exam`)
              }
              disabled={saving}
              sx={{ backgroundColor: "#48C8AF" }}
            >
              Modifier Types d&apos;examens
            </Button>

            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saving}
              sx={{ backgroundColor: "#48C8AF" }}
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
