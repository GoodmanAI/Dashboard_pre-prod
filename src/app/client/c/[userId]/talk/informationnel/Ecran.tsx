"use client";

import { Alert, Box } from "@mui/material";
import { useSession } from "next-auth/react";
import { useDroitPage } from "@/hooks/useDroitPage";
import { PAGES } from "@/lib/permissions";
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
  // Lecture seule, revue le 15/09/2026 : elle se lisait sur le seul booleen
  // herite `isSecretary`, donc un sous-compte moderne cree avec cette page en
  // lecture voyait tous ses champs actifs et decouvrait le refus a
  // l'enregistrement. `useDroitPage` couvre les deux cas.
  const { peutEcrire, raisonLectureSeule } = useDroitPage(PAGES.INFORMATIONNEL);
  const readOnly = !peutEcrire;

  return (
    <Box sx={{ my: 4, px: { xs: 2, sm: 4 } }}>
      {readOnly && (
        <Box sx={{ maxWidth: 960, mx: "auto", mb: 3 }}>
          <Alert severity="info">
            {raisonLectureSeule}
          </Alert>
        </Box>
      )}

      {!readOnly && Number.isFinite(userProductId) && (
        <ModuleInfoAdmin userProductId={userProductId} />
      )}
    </Box>
  );
}
