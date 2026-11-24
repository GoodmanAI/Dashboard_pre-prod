import type { Metadata } from "next";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { theme } from "@/pilot/theme";
import { Coquille } from "@/pilot/components/Coquille";
import { peutVoirCa } from "@/pilot/lib/autorisations";
import { compteAffiche } from "@/pilot/lib/session";

export const metadata: Metadata = {
  title: "Lyrae Pilot",
  description: "Le suivi des clients Lyrae",
  robots: { index: false, follow: false },
};

/**
 * La coquille de Pilot dans le Dashboard (plan 2026-11-pilot-dans-le-dashboard).
 * La mise en page racine du Dashboard ne pose ni sa barre latérale ni son thème
 * sous /pilot : Pilot garde les siens (décision d'Enzo du 23/11). La police Inter
 * est celle du Dashboard (fichiers locaux, `--font-myfont`), aucun appel à un tiers.
 */
export default async function PilotLayout({ children }: { children: React.ReactNode }) {
  // Le compte connecté, relu en base avec ses droits (C-64) : le menu ne montre que ce qu'il peut ouvrir.
  const u = await compteAffiche();
  const compte = u ? { nom: u.name ?? u.email, email: u.email, role: u.libelle, voirCa: peutVoirCa(u), superAdmin: u.superAdmin,
    motDePasseProvisoire: u.motDePasseProvisoire } : null;
  return (
    <div style={{ ["--police-inter" as string]: "var(--font-myfont)" }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Coquille compte={compte}>{children}</Coquille>
      </ThemeProvider>
    </div>
  );
}
