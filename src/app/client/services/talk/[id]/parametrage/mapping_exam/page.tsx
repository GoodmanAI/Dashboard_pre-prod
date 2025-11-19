"use client";

import { useState, useEffect } from "react";
import SaveIcon from "@mui/icons-material/Save";
import SettingsIcon from '@mui/icons-material/Settings';
import { Stack, Button, Snackbar, Alert, Portal } from "@mui/material";
import { useRouter } from "next/navigation";
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';

interface TalkPageProps {
  params: {
    id: string; // captured from the URL
  };
}

interface ExamData {
  Commentaire: string;
  Interrogatoire: string;
  Synonymes: string;
  codeExamen: string;
  libelle: string;
  typeExamen: string;
}

interface EditableTableProps {
  data: any[];
  setData: React.Dispatch<React.SetStateAction<any[]>>;
}

function EditableTable({ data, setData }: EditableTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;

  // Pagination math
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRows = data.slice(startIndex, endIndex);
  const totalPages = Math.ceil(data.length / rowsPerPage);

  const allKeys = Object.keys(data[0]);
  console.log(allKeys)
  const visibleKeys = allKeys.filter((_, index) => index !== 1 && index !== 4);

  const handleChange = (rowIndex: any, key: any, newValue: any) => {
    setData((prevData) => {
      const updated = [...prevData];
      updated[startIndex + rowIndex] = {
        ...updated[startIndex + rowIndex],
        [key]: newValue,
      };
      return updated;
    });
  };

  const handleArrayChange = (rowIndex: any, key: any, valueIndex: any, newValue: any) => {
    setData((prevData) => {
      const updated = [...prevData];
      const targetIndex = startIndex + rowIndex;
      let currentVal = updated[targetIndex][key];
      let currentArray: string[] = [];

      if (Array.isArray(currentVal)) {
        currentArray = [...currentVal];
      } else if (typeof currentVal === "string") {
        const trimmed = currentVal.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          const content = trimmed.slice(1, -1).trim();
          if (content) {
            currentArray = content
              .split(/,(?=(?:[^'"]|'[^']*'|"[^"]*")*$)/)
              .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
              .filter((s) => s.length > 0);
          }
        }
      }

      currentArray[valueIndex] = newValue;

      updated[targetIndex] = {
        ...updated[targetIndex],
        [key]: JSON.stringify(currentArray),
      };

      return updated;
    });
  };

  const parseMaybeArray = (val: any) => {
    if (Array.isArray(val)) return val;
    if (typeof val !== "string" || !val.trim()) return [];

    const trimmed = val.trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        const content = trimmed.slice(1, -1).trim();
        if (!content) return [];
        const items = content
          .split(/"\s*,\s*"|',\s*'|"\s*,\s*'|'\s*,\s*"/)
          .map((s) => s.replace(/^['"]|['"]$/g, "").trim());
        return items;
      }
    }

    return [];
  };

  const addArrayInput = (rowIndex: any, key: any) => {
    setData((prevData) => {
      const updated = [...prevData];
      const arr = parseMaybeArray(updated[startIndex + rowIndex][key]);
      arr.push("");
      updated[startIndex + rowIndex] = {
        ...updated[startIndex + rowIndex],
        [key]: JSON.stringify(arr),
      };
      return updated;
    });
  };

  return (
    <div>
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            {visibleKeys.map((key, index) => (
              <th
                key={key}
                style={{
                  border: "1px solid #ccc",
                  padding: "8px",
                  backgroundColor: "rgba(230, 230, 230, 0.6)",
                  textAlign: "left",
                  width: index == 4 ? "30%" : "15%"
                }}
              >
                {key}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {currentRows.map((row: any, rowIndex: any) => (
            <tr
              key={rowIndex}
              style={{
                backgroundColor:
                  rowIndex % 2 === 0 ? "rgba(74, 200, 175, 0.1)" : "rgba(255, 255, 255, 1)",
              }}
            >
              {visibleKeys.map((key, index) => {
                const rawValue = row[key];
                const arrValue = parseMaybeArray(rawValue);
                const isArrayColumn = index === 4;
                const editable = ![0, 2, 3].includes(index);

                return (
                  <td
                    key={key}
                    style={{
                      border: "1px solid #ccc",
                      padding: "15px 10px",
                      width: index === 0 || index == 1 || index == 2 ? "15%" : "auto",
                      verticalAlign: "middle",
                      height: "120px"
                    }}
                  >
                  {editable ? (
                    isArrayColumn ? (
                      arrValue.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {arrValue.map((item, i) => (
                            <input
                              key={i}
                              value={item}
                              onChange={(e) =>
                                handleArrayChange(rowIndex, key, i, e.target.value)
                              }
                              style={{
                                width: "100%",
                                boxSizing: "border-box",
                                padding: "6px",
                                border: "1px solid #bbb",
                                borderRadius: "4px",
                                fontFamily: "inherit",
                                fontSize: "inherit",
                              }}
                            />
                          ))}
                          <button
                            onClick={() => addArrayInput(rowIndex, key)}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor = "#e0e0e0")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor = "#f8f8f8")
                            }
                            style={{
                              marginTop: "4px",
                              padding: "4px 6px",
                              border: "1px solid #aaa",
                              backgroundColor: "#f8f8f8",
                              cursor: "pointer",
                              fontSize: "0.9em",
                              transition: "background-color 0.2s ease",
                              width: "100%",
                            }}
                          >
                            + Ajouter une question
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addArrayInput(rowIndex, key)}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor = "#e0e0e0")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor = "#f8f8f8")
                          }
                          style={{
                            padding: "4px 6px",
                            border: "1px solid #aaa",
                            backgroundColor: "#f8f8f8",
                            cursor: "pointer",
                            fontSize: "0.9em",
                            transition: "background-color 0.2s ease",
                            width: "100%",
                          }}
                        >
                          + Ajouter une question
                        </button>
                      )
                    ) : (
                        <input
                          type="text"
                          value={String(rawValue || "")}
                          onChange={(e) => handleChange(rowIndex, key, e.target.value)}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            border: "0",
                            borderBottom: "1px solid gray",
                            padding: "8px",
                            fontFamily: "inherit",
                            fontSize: "inherit",
                            resize: "none",
                            background: "transparent",
                          }}
                        />
                    )
              ) : (<div
                    style={{
                      width: "100%",
                      height: "100%",
                      padding: "8px",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      backgroundColor: "transparent",
                    }}
                  >
                    {isArrayColumn ? arrValue.join(", ") : rawValue}
                  </div>)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination controls */}
      <div
        style={{
          marginTop: "10px",
          display: "flex",
          justifyContent: "center",
          gap: "10px",
        }}
      >
        <button
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
          style={{
            padding: "5px 10px",
            border: "1px solid #aaa",
            backgroundColor: "#f0f0f0",
            cursor: currentPage === 1 ? "not-allowed" : "pointer",
          }}
        >
          Previous
        </button>

        <span>
          Page {currentPage} of {totalPages}
        </span>

        <button
          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
          disabled={currentPage === totalPages}
          style={{
            padding: "5px 10px",
            border: "1px solid #aaa",
            backgroundColor: "#f0f0f0",
            cursor: currentPage === totalPages ? "not-allowed" : "pointer",
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function MappingExam({ params }: TalkPageProps) {
  const [data, setData] = useState<any[]>([]);
  const [saving, setSaving] = useState<any>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });
  const router = useRouter();
  const userProductId = Number(params.id);
    
  useEffect(() => {
  const fetchData = async () => {
    try {
      // 1️⃣ Try fetching the user's saved mapping from the DB
      const res = await fetch(`/api/configuration/get/mapping?userProductId=${userProductId}`);

      if (res.ok) {
        console.log("1")
        const json = await res.json();
        console.log(json);
        // Handle both possible formats (array or object)
        const formatted = Array.isArray(json)
          ? json
          : Object.entries(json).map(([code, exam]: any) => ({
              codeExamen: code,
              ...exam,
            }));

        console.log("✅ Loaded mapping from DB:", formatted);
        const processedData = formatted.map((row: any) => {
        const newRow: any = {};
        const entries = Object.entries(row);

        entries.forEach(([key, value], index) => {
          // Insert codeExamenClient at index 2 if not already added
          if (index === 2 && !newRow.hasOwnProperty("codeExamenClient")) {
            // Use existing value if present, otherwise empty string
            newRow["codeExamenClient"] = row.hasOwnProperty("codeExamenClient")
              ? row["codeExamenClient"]
              : "";
          }

          // Skip adding codeExamenClient again if it's already in row
          if (key !== "codeExamenClient") {
            newRow[key] = value;
          }
        });

        // If row has fewer than 2 keys, or codeExamenClient wasn't inserted, append at the end
        if (!newRow.hasOwnProperty("codeExamenClient")) {
          newRow["codeExamenClient"] = row.hasOwnProperty("codeExamenClient")
            ? row["codeExamenClient"]
            : "";
        }

        return newRow;
      });

        setData(processedData);
      } else if (res.status === 404) {
        console.log("2")
        // 2️⃣ Fallback to base data if no user mapping exists
        console.log("ℹ️ No existing mapping found, loading default data...");
        const fallbackRes = await fetch("/api/data/exams");
        if (!fallbackRes.ok) throw new Error("Failed to load default exams");
        const fallbackJson = await fallbackRes.json();
        setData(fallbackJson);
      } else {
        throw new Error(`Unexpected response: ${res.status}`);
      }
    } catch (err) {
      console.error("❌ Failed to load data:", err);

      // 3️⃣ As a last resort, attempt base data anyway
      try {
        const fallbackRes = await fetch("/api/data/exams");
        if (fallbackRes.ok) {
          const fallbackJson = await fallbackRes.json();
          setData(fallbackJson);
        }
      } catch (e) {
        console.error("❌ Fallback also failed:", e);
      }
    }
  };

  fetchData();
}, [userProductId]);

  useEffect(() => {
    console.log("Loaded data:", data);
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/configuration/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProductId, data }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save data: ${response.statusText}`);
      }
      setSnack({ open: true, message: "Configuration enregistrée avec succès.", severity: "success" })
      const result = await response.json();
      console.log("✅ Data saved successfully:", result);
      setSaving(false);
    } catch (error) {
      console.error("❌ Error saving data:", error);
    }
  };

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold mb-8">
        Correspondance des Examens
      </h1>

      {data.length > 0 && (
        <>
          <Button
            variant="contained"
            startIcon={<ArrowBackIosIcon />}
            onClick={() => { return router.back() }}
            disabled={saving}
            sx={{
              backgroundColor: "#48C8AF",
              "&:hover": { backgroundColor: "#3bb49d" },
              marginBottom: "10px"
            }}
          >
            Retour
          </Button>
          <EditableTable data={data} setData={setData} />
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{
              position: "sticky",
              bottom: 0,
              bgcolor: "rgba(248,248,248,0.9)",
              backdropFilter: "blur(6px)",
              py: 1.5,
              px: 2,
              mt: 2,
              borderTop: "1px solid #eee",
              justifyContent: "space-between"
            }}
          >
            <Button
              variant="contained"
              startIcon={<SettingsIcon />}
              onClick={() => router.push(`/client/services/talk/${userProductId}/parametrage/mapping_exam/type_exam`)}
              disabled={saving}
              sx={{
                backgroundColor: "#48C8AF",
                "&:hover": { backgroundColor: "#3bb49d" },
              }}
            >
              Modifier Types d&apos;examens
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saving}
              sx={{
                backgroundColor: "#48C8AF",
                "&:hover": { backgroundColor: "#3bb49d" },
              }}
            >
              Enregistrer
            </Button>
          </Stack>
          <Portal>
            <Snackbar
              anchorOrigin={{vertical: "top", horizontal: "right"}}
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
