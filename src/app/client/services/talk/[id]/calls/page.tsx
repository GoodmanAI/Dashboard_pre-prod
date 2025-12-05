"use client";

import { useEffect, useState } from "react";
import { Box, Typography, Card, CardContent, CircularProgress, Grid, Alert, Button, Divider } from "@mui/material";
import { IconEye } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

type Speaker = "Lyrae" | "User";

interface CallSummary {
  id: number;
  userProductId: number;
  centerId: number;
  steps: Record<Speaker, string>;
  stats: {
    intents: string[];
    rdv_status: "success" | "no_slot" | "not_performed" | "cancelled" | "modified" | null;
    patient_status: "known" | "new" | "third_party" | null;
    end_reason: "hangup" | "transfer" | "error_logic" | "error_timeout" | null;
    questions_completed: boolean;
    exam_code: string | null;
  };
}

interface CallListPageProps {
  params: { id: string }; // récupéré depuis la route Next.js
}

export default function CallListPage({ params }: CallListPageProps) {
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Transformer params.id en number
  const userProductId = Number(params.id);

  useEffect(() => {
    // Ne rien faire si userProductId invalide
    if (!userProductId || isNaN(userProductId)) return;

    setLoading(true);
    setError(null);

    fetch(`/api/calls?userProductId=${userProductId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erreur lors du fetch des appels");
        return res.json();
      })
      .then((data: CallSummary[]) => setCalls(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userProductId]); // ne dépend plus de rien d'autre

    return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      {/* Bouton retour */}
      <Button
        variant="contained"
        startIcon={<ArrowBackIosIcon />}
        onClick={() => router.back()}
        sx={{ mb: 2, backgroundColor: "#48C8AF", "&:hover": { backgroundColor: "#3bb49d" } }}
      >
        Retour
      </Button>

      <Typography variant="h5" gutterBottom>
        Conversation
      </Typography>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress sx={{ color: "#48C8AF" }} />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && steps.length === 0 && (
        <Alert severity="info">Aucune conversation trouvée pour cet appel.</Alert>
      )}

      {/* Affichage de la conversation */}
      {steps.map((text, idx) => {
        const speaker = idx % 2 === 0 ? "Lyrae" : "User"; // Lyrae commence
        return (
          <Box
            key={idx}
            sx={{
              display: "flex",
              justifyContent: speaker === "Lyrae" ? "flex-start" : "flex-end",
              mb: 1,
            }}
          >
            <Box
              sx={{
                p: 1.25,
                borderRadius: 2,
                bgcolor: speaker === "Lyrae" ? "rgba(72,200,175,0.15)" : "#eee",
                maxWidth: "75%",
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: "text.secondary", mb: 0.5 }}
              >
                {speaker}
              </Typography>
              <Typography variant="body2">{text}</Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}


// "use client";

// import { useEffect, useState } from "react";
// import { Box, Typography, CircularProgress, Alert, Button } from "@mui/material";
// import { useRouter } from "next/navigation";
// import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';

// export default function CallConversationPage({ params }: { params: { id: string; callId: string } }) {
//   const router = useRouter();
//   const [steps, setSteps] = useState<string[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   const userProductId = Number(params.id);
//   const callId = Number(params.callId);

//   useEffect(() => {
//     if (!userProductId || !callId) return;

//     setLoading(true);
//     setError(null);

//     fetch(`/api/calls?userProductId=${userProductId}&call=${callId}`)
//       .then((res) => {
//         if (!res.ok) throw new Error("Erreur lors du fetch de l'appel");
//         return res.json();
//       })
//       .then((data: { steps: string[] }[]) => {
//         if (data.length > 0) {
//           setSteps(data[0].steps ?? []);
//         } else {
//           setSteps([]);
//         }
//       })
//       .catch((err) => setError(err.message))
//       .finally(() => setLoading(false));
//   }, [userProductId, callId]);

//   return (
//     <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
//       {/* Bouton retour */}
//       <Button
//         variant="contained"
//         startIcon={<ArrowBackIosIcon />}
//         onClick={() => router.back()}
//         sx={{ mb: 2, backgroundColor: "#48C8AF", "&:hover": { backgroundColor: "#3bb49d" } }}
//       >
//         Retour
//       </Button>

//       <Typography variant="h5" gutterBottom>
//         Conversation
//       </Typography>

//       {loading && (
//         <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
//           <CircularProgress sx={{ color: "#48C8AF" }} />
//         </Box>
//       )}

//       {error && <Alert severity="error">{error}</Alert>}

//       {!loading && !error && steps.length === 0 && (
//         <Alert severity="info">Aucune conversation trouvée pour cet appel.</Alert>
//       )}

//       {/* Affichage de la conversation */}
//       {steps.map((text, idx) => {
//         const speaker = idx % 2 === 0 ? "Lyrae" : "User"; // Lyrae commence
//         return (
//           <Box
//             key={idx}
//             sx={{
//               display: "flex",
//               justifyContent: speaker === "Lyrae" ? "flex-start" : "flex-end",
//               mb: 1,
//             }}
//           >
//             <Box
//               sx={{
//                 p: 1.25,
//                 borderRadius: 2,
//                 bgcolor: speaker === "Lyrae" ? "rgba(72,200,175,0.15)" : "#eee",
//                 maxWidth: "75%",
//               }}
//             >
//               <Typography
//                 variant="caption"
//                 sx={{ fontWeight: 700, color: "text.secondary", mb: 0.5 }}
//               >
//                 {speaker}
//               </Typography>
//               <Typography variant="body2">{text}</Typography>
//             </Box>
//           </Box>
//         );
//       })}
//     </Box>
//   );
// }
