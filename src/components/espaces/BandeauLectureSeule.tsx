"use client";

import { Alert } from "@mui/material";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

/**
 * Les comptes internes de l'équipe (ADMIN) voient la configuration sans pouvoir la
 * changer : seul le super-administrateur la modifie (demande d'Enzo du 23/11/2026).
 * Le middleware refuse l'écriture (`src/lib/espaces.ts`) ; ce bandeau le dit avant
 * qu'on essaie, sur les écrans où l'on règle quelque chose.
 */
const ECRANS_DE_REGLAGE = /^\/(admin\/(talk-config|talk-installation|konnect-installation|external-mapping|pack|comptes|manage-clients|nouveau-centre)|client\/c\/)/;

export default function BandeauLectureSeule() {
  const { data: session } = useSession();
  const chemin = usePathname() ?? "";
  if (session?.user?.role !== "ADMIN" || !ECRANS_DE_REGLAGE.test(chemin)) return null;
  return (
    <Alert severity="info" icon={false} sx={{ mx: 3, mt: 2, borderRadius: 2 }}>
      Lecture seule. Vous voyez la configuration de ce centre, seul le super-administrateur peut la modifier.
    </Alert>
  );
}
