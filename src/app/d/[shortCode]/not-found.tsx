"use client";

import { Box, Stack, Typography } from "@mui/material";
import { LinkOff } from "@mui/icons-material";

/**
 * Page 404 dediee au sous-domaine depot-ordonnances.neuracorp.ai.
 *
 * Declenchee par notFound() dans [shortCode]/page.tsx quand :
 *   - Le shortCode est absent, trop court ou trop long
 *   - Le shortCode n'existe pas en base
 *
 * Rend une carte minimaliste alignee sur le design du formulaire d'upload
 * (meme palette, meme PageShell) pour que le patient reste dans un univers
 * visuel coherent, sans jamais voir la nav admin du dashboard.
 *
 * On ne differencie PAS "lien invalide" vs "lien expire" vs "lien inconnu"
 * pour ne pas reveler l'existence d'un shortCode donne (defense contre
 * l'enumeration). Message generique + invitation a contacter le centre.
 */

const BRAND_TEAL = "#48C8AF";
const DANGER = "#E15554";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";
const CARD_BG = "#FFFFFF";
const PAGE_BG_TOP = "#F0F7F5";
const PAGE_BG_BOTTOM = "#FAFCFB";

export default function PrescriptionNotFound() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${PAGE_BG_TOP} 0%, ${PAGE_BG_BOTTOM} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2, sm: 3 },
        py: { xs: 3, sm: 4 },
      }}
    >
      <Box
        sx={{
          bgcolor: CARD_BG,
          borderRadius: { xs: 3, sm: 4 },
          boxShadow: "0 4px 24px rgba(31, 52, 72, 0.08)",
          p: { xs: 3, sm: 4 },
          width: "100%",
          maxWidth: 480,
          textAlign: "center",
        }}
      >
        <Stack spacing={2} alignItems="center">
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              bgcolor: "#FBECEB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <LinkOff sx={{ color: DANGER, fontSize: 32 }} />
          </Box>

          <Typography variant="h6" sx={{ color: TEXT_MAIN, fontWeight: 700 }}>
            Lien invalide ou expire
          </Typography>

          <Typography variant="body2" sx={{ color: TEXT_MUTED, maxWidth: 380 }}>
            Ce lien de depot d&apos;ordonnance n&apos;est pas valide, ou il a
            expire. Verifiez le lien recu par SMS, ou contactez votre centre
            d&apos;imagerie pour recevoir un nouveau lien.
          </Typography>

          <Box
            sx={{
              mt: 1,
              px: 2,
              py: 1.5,
              borderRadius: 2,
              bgcolor: "#F0F7F5",
              width: "100%",
            }}
          >
            <Typography variant="caption" sx={{ color: BRAND_TEAL, fontWeight: 600 }}>
              Astuce
            </Typography>
            <Typography variant="body2" sx={{ color: TEXT_MAIN, mt: 0.5 }}>
              Les liens de depot restent valides quelques jours seulement apres
              votre prise de rendez-vous.
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
