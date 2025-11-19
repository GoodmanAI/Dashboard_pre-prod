"use client";

import { useState, useEffect } from "react";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import { useRouter } from "next/navigation";
import { Stack, Button, Snackbar, Alert, Portal } from "@mui/material";
import SettingsIcon from '@mui/icons-material/Settings';

interface TalkPageProps {
  params: {
    id: string; // captured from the URL
  };
}

export default function EditTypeExam({ params }: TalkPageProps){
    const userProductId = Number(params.id);
    const router = useRouter();
    const [mapping, setMapping] = useState<Record<string, { fr: string, diminutif: string }>>({});

    useEffect(() => {
      const fetchData = async () => {
        const res = await fetch(`/api/configuration/mapping/type_exam?userProductId=${userProductId}`);
        const data = await res.json();

        // Format attendu : { US: { fr:"", diminutif:"" } }
        const mapped = Object.fromEntries(
          Object.entries(data).map(([code, val]: any) => [
            code,
            { fr: code == 0 ? "Echographie" : code == 1 ? "Mammographie" : code == 2 ? "Radio" : code == 3 ? "IRM" : "Scanner", diminutif: val.diminutif ?? code }
          ])
        );

        setMapping(mapped);
      };

      fetchData();
    }, [userProductId]);
    
    const handleSave = async () => {
      console.log(mapping);
      await fetch(`/api/configuration/mapping/type_exam?userProductId=${userProductId}`, {
        method: "POST",
        body: JSON.stringify(mapping),
        headers: { "Content-Type": "application/json" }
      });

    }

    return (
        <main className="p-6">
            <Button
            variant="contained"
            startIcon={<ArrowBackIosIcon />}
            onClick={() => { return router.back() }}
            sx={{
              backgroundColor: "#48C8AF",
              "&:hover": { backgroundColor: "#3bb49d" },
              marginBottom: "10px"
            }}
          >
            Retour
          </Button>
          
            <h1 className="text-xl font-bold mb-8 pl-4">
                Correspondance des Examens
            </h1>
            <table style={{width: "100%", padding: "0 50px", borderCollapse: "collapse", textAlign: "left"}}>
                <thead>
                    <tr style={{backgroundColor: "rgba(230, 230, 230, 0.6)"}}>
                        <th style={{padding: "5px 10px", border: "1px solid black"}}>Type d&apos;examens</th>
                        <th style={{padding: "5px 10px", border: "1px solid black"}}>Diminutif d&apos;examens</th>
                    </tr>
                </thead>
                {/* <tbody>
                    <tr>
                        <td style={{padding: "20px 10px", border: "1px solid black"}}>Echographie</td>
                        <td style={{padding: "20px 10px", border: "1px solid black"}}>
                            <input type="text" defaultValue="EC"></input>
                        </td>
                    </tr>
                    <tr>
                        <td style={{padding: "20px 10px", border: "1px solid black"}}>Mammographie</td>
                        <td style={{padding: "20px 10px", border: "1px solid black"}}>
                            <input type="text" defaultValue="MG"></input>
                        </td>
                    </tr>
                    <tr>
                        <td style={{padding: "20px 10px", border: "1px solid black"}}>Radio</td>
                        <td style={{padding: "20px 10px", border: "1px solid black"}}>
                            <input type="text" defaultValue="RX"></input>
                        </td>
                    </tr>
                    <tr>
                        <td style={{padding: "20px 10px", border: "1px solid black"}}>IRM</td>
                        <td style={{padding: "20px 10px", border: "1px solid black"}}>
                            <input type="text" defaultValue="MR"></input>
                        </td>
                    </tr>
                    <tr>
                        <td style={{padding: "20px 10px", border: "1px solid black"}}>Scanner</td>
                        <td style={{padding: "20px 10px", border: "1px solid black"}}>
                            <input type="text" defaultValue="CT"></input>
                        </td>
                    </tr>
                </tbody> */}
                <tbody>
              {Object.entries(mapping).map(([code, item]) => (
                <tr key={code}>
                  <td style={{padding: "20px 10px", border: "1px solid black"}}>{code == 0 ? "Echographie" : code == 1 ? "Mammographie" : code == 2 ? "Radio" : code == 3 ? "IRM" : "Scanner"}</td>

                  <td style={{padding: "20px 10px", border: "1px solid black"}}>
                    <input
                      type="text"
                      value={item.diminutif}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [code]: { ...prev[code], labelFr: code == 0 ? "Echographie" : code == 1 ? "Mammographie" : code == 2 ? "Radio" : code == 3 ? "IRM" : "Scanner", diminutif: e.target.value }
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>

            </table>
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
              justifyContent: "flex-end"
            }}
          >
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
            //   disabled={saving}
              sx={{
                backgroundColor: "#48C8AF",
                "&:hover": { backgroundColor: "#3bb49d" },
              }}
            >
              Enregistrer
            </Button>
          </Stack>
        </main>
    )
}