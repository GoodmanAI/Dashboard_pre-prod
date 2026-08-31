"use client";

import { Alert, Box } from "@mui/material";
import { useSession } from "next-auth/react";
import ModuleInfoAdmin from "@/components/moduleInfo/ModuleInfoAdmin";

/**
 * Page /informationnel (refonte 2026-08-06).
 * -----------------------------------------------------------------------------
 * Depuis le chantier Module Info, cette page ne contient plus l'ancien
 * formulaire de config informationnelle (adresse, horaires, telephone...) :
 *
 *   - Les horaires (weeklyHours) restent editables via /parametrage (leur
 *     UI dediee), et sont toujours consommes par le bot via
 *     /api/configuration/get/is_open.
 *   - Les autres champs de TalkInformationSettings n'etaient pas utilises
 *     activement par les clients (feedback user : "brique non utilisee").
 *   - Toute nouvelle info a communiquer au bot passe par la FAQ patient
 *     (voir ModuleInfoAdmin).
 *
 * Ne rien casser : les endpoints /api/configuration/informationnel/* + la
 * table TalkInformationSettings sont conserves intacts.
 */

interface TalkPageProps {
  params: { id: string };
}

export default function DashboardTalkForm({ params }: TalkPageProps) {
  const userProductId = Number(params.id);
  const { data: sessionData } = useSession();
  const readOnly = !!sessionData?.user?.isSecretary;

  return (
    <Box sx={{ my: 4, px: { xs: 2, sm: 4 } }}>
      {readOnly && (
        <Box sx={{ maxWidth: 960, mx: "auto", mb: 3 }}>
          <Alert severity="info">
            Mode lecture seule — votre compte secrétaire ne permet pas de modifier
            la configuration.
          </Alert>
        </Box>
      )}

      {!readOnly && Number.isFinite(userProductId) && (
        <ModuleInfoAdmin userProductId={userProductId} />
      )}
    </Box>
  );
}
