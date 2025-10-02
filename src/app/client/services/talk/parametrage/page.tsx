"use client";

import { Box, Typography, Button, Card, CardContent } from "@mui/material";
import { useRouter } from "next/navigation";
import { IconChevronLeft } from "@tabler/icons-react";

export default function ParametrageTalkPage() {
  const router = useRouter();

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      {/* En-tête */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h4">Paramétrage Talk</Typography>
        <Button
          variant="outlined"
          startIcon={<IconChevronLeft size={18} />}
          onClick={() => router.push("/client/services/talk")}
          sx={{
            borderColor: "#48C8AF",
            color: "#48C8AF",
            "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
          }}
        >
          Retour à Talk
        </Button>
      </Box>

      {/* Contenu (à compléter selon besoins) */}
      <Card sx={{ borderRadius: 2, border: "1px solid #e0e0e0" }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Préférences générales
          </Typography>
          <Typography variant="body2" color="text.secondary">
            (Placeholders) Ici, vous pourrez définir horaires, routage des intentions, notifications, etc.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
