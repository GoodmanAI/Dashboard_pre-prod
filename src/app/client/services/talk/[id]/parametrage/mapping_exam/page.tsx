"use client";
import  { useState, useEffect } from "react";
import SaveIcon from "@mui/icons-material/Save";
import {
  Stack,
  Button
} from "@mui/material";

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
  setData: React.Dispatch<React.SetStateAction<any[]>>
}

export function EditableTable({data, setData}: EditableTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;

  // pagination math
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRows = data.slice(startIndex, endIndex);
  const totalPages = Math.ceil(data.length / rowsPerPage);

  const allKeys = Object.keys(data[0]);
  const visibleKeys = allKeys.filter(
    (_, index) => index !== 3 && index !== 5
  );

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

  // update a single cell
  const handleArrayChange = (rowIndex: any, key: any, valueIndex: any, newValue: any) => {
    setData((prevData) => {
      console.log("prevData", prevData)
      const updated = [...prevData];
      const targetIndex = startIndex + rowIndex;
      
      let currentVal = updated[targetIndex][key];
      let currentArray: string[] = [];

      if (Array.isArray(currentVal)) {
        currentArray = [...currentVal];
      } else if (typeof currentVal === "string") {
        const trimmed = currentVal.trim();

        // Check if it looks like an array literal
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          const content = trimmed.slice(1, -1).trim();

          if (content) {
            // Split on commas that are outside quotes, then remove surrounding quotes and trim
            currentArray = content
              .split(/,(?=(?:[^'"]|'[^']*'|"[^"]*")*$)/)
              .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
              .filter((s) => s.length > 0);
          }
        }
      }

      // Update only the targeted value
      currentArray[valueIndex] = newValue;

      // ✅ Save as a JSON string for consistency with the rest of your table
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

    // ✅ Case 1: proper JSON array
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // try lightweight recovery if it's a pseudo-JSON like [a, b]
        const content = trimmed.slice(1, -1).trim();
        if (!content) return [];
        // Split on closing bracket or comma followed by quote-like or uppercase letter
        const items = content
          .split(/"\s*,\s*"|',\s*'|"\s*,\s*'|'\s*,\s*"/)
          .map((s) => s.replace(/^['"]|['"]$/g, "").trim());
        return items;
      }
    }

    // ✅ Case 2: not JSON — treat as plain string, not an array
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
                  width: index === 0 || index === 1 ? "15%" : index == 2 ? "25%" : "auto"
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
                  rowIndex % 2 === 0
                    ? "rgba(74, 200, 175, 0.1)"
                    : "rgba(255, 255, 255, 1)",
              }}
            >
              {visibleKeys.map((key, index) => {
                const rawValue = row[key];
                const arrValue = parseMaybeArray(rawValue);
                const isArrayLike = arrValue.length > 0;

                // 👇 Only the 4th column (index 3) uses multiple inputs
                const isArrayColumn = index === 3;

                return (
                  <td
                    key={key}
                    style={{
                      border: "1px solid #ccc",
                      padding: "20px 10px",
                      width: index === 0 || index == 1 ? "15%" : index == 2 ? "25%" : "auto",
                      verticalAlign: "middle"
                    }}
                  >
                    {isArrayColumn ? (
                      arrValue.length > 0 ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
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
                              width: "100%"
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
                            width: "100%"
                          }}
                        >
                          + Ajouter une question
                        </button>
                      )
                    ) : (
                      <textarea
                        value={String(rawValue || "")}
                        onChange={(e) =>
                          handleChange(rowIndex, key, e.target.value)
                        }
                        style={{
                          width: "100%",
                          height: "100%",
                          boxSizing: "border-box",
                          border: "none",
                          padding: "8px",
                          fontFamily: "inherit",
                          fontSize: "inherit",
                          resize: "none",
                          background: "transparent",
                        }}
                        rows={2}
                      />
                    )}
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
  const userProductId = Number(params.id);

  useEffect(() => {
    fetch("/api/data/exams")
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch((err) => console.error("Failed to load data:", err));
  }, []);

  useEffect(() => {
    console.log("Loaded data:", data);
  }, [data]);

  const handleSave = async () => {
    try {
      console.log(data)
      // const response = await fetch("/parametres/save", {
      //   method: "POST",
      //   headers: {
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify(data),
      // });

      // if (!response.ok) {
      //   throw new Error(`Failed to save data: ${response.statusText}`);
      // }

      // const result = await response.json();
      // console.log("✅ Data saved successfully:", result);
      // alert("Les paramètres ont été enregistrés avec succès !");
    } catch (error) {
      console.error("❌ Error saving data:", error);
      alert("Erreur lors de l'enregistrement des paramètres.");
    }
  };

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold mb-4">
        Mapping Exam — Product #{userProductId}
      </h1>
      {data.length && 
        <>
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
              justifyContent: "flex-end",
            }}
          >
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
        </>
      }
    </main>
  );
}