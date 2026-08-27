"use client";

// Palette d'accent (variables --accent*). Importee ici et non dans le
// ThemeProvider : les pages patient (/c, /d, /confirm) rendent hors du theme MUI
// et perdraient l'accent.
import "./global.css";

import { styled, Container, Box } from "@mui/material";
import { ThemeProvider, CssBaseline } from "@mui/material";
import React, { useState } from "react";
import Header from "@/app/(DashboardLayout)/layout/header/Header";
import Sidebar from "@/app/(DashboardLayout)/layout/sidebar/Sidebar";
import { SessionProvider } from "next-auth/react";
import { baselightTheme } from "@/utils/theme/DefaultColors";
import { usePathname } from "next/navigation";
import localFont from 'next/font/local'
import { CentreProvider } from "./context/CentreContext";
import PageAccessGuard from "@/components/permissions/PageAccessGuard";

/**
 * Layout racine de l’espace applicatif (hors pages d’authentification).
 * - Monte les fournisseurs transverses : SessionProvider (NextAuth), ThemeProvider (MUI), CentreProvider (gestion des centres).
 * - Applique la police locale et la baseline CSS MUI.
 * - Structure l’UI globale : Sidebar (navigation), Header (barre supérieure), contenu de page.
 * - Pour les routes d’authentification, on affiche uniquement `children` sans le chrome applicatif.
 */

/** Conteneur principal de l’application (structure flex plein écran). */
const MainWrapper = styled("div")(() => ({
  display: "flex",
  minHeight: "100vh",
  width: "100%",
}));

/** Conteneur de page : zone Header + contenu métier. */
const PageWrapper = styled("div")(() => ({
  display: "flex",
  flexGrow: 1,
  paddingBottom: 0,
  flexDirection: "column",
  zIndex: 1,
  backgroundColor: "transparent",
}));

/**
 * Chargement des variantes locales de la police Inter.
 * La variable CSS `--font-myfont` est exposée pour usage global.
 */
const myFont = localFont({
  src: [
    { path: '../../public/fonts/Inter_18pt-Thin.ttf', weight: '100', style: 'normal' },
    { path: '../../public/fonts/Inter_18pt-Light.ttf', weight: '300', style: 'normal' },
    { path: '../../public/fonts/Inter_18pt-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../../public/fonts/Inter_18pt-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-myfont'
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /** État d’ouverture des sidebars (desktop et mobile). */
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  /**
   * Détection des pages "sans chrome" — celles qui doivent apparaître nues,
   * sans Sidebar ni Header du dashboard :
   *   - /authentication/*  : pages de login (déjà historique)
   *   - /c/*               : URL courte du SMS de rappel RDV (patient)
   *   - /confirm/*         : URL longue du SMS de rappel RDV (patient, rétrocompat)
   *   - /d/*               : URL courte du SMS de dépôt d'ordonnance (patient)
   *
   * Ces routes servent notamment via les sous-domaines patient (rdv.neuracorp.ai
   * et depot-ordonnances.neuracorp.ai — isolés côté middleware) et doivent
   * rester ultra-simples : un patient qui clique un lien SMS ne doit jamais
   * voir la nav admin du dashboard, même s'il tape l'URL sur le mauvais host.
   */
  const pathname: any = usePathname();
  const isPublicPage =
    pathname?.startsWith("/authentication") ||
    pathname?.startsWith("/c/") ||
    pathname?.startsWith("/confirm/") ||
    pathname?.startsWith("/d/");

  return (
    <html lang="fr" className={myFont.variable}>
      <body style={{ margin: 0, padding: 0, overflowX: "hidden", overflowY: "auto" }}>
        {/* Contexte d’authentification NextAuth disponible partout. */}
        <SessionProvider>
        {!isPublicPage && (
          <>
          {/* Thème MUI global + reset CSS + contexte “centre” (multi-centres). */}
          <ThemeProvider theme={baselightTheme}>
            <CssBaseline />
            <CentreProvider>
              <MainWrapper className="mainwrapper">
                {/* Barre latérale persistante (navigation principale). */}
                <Sidebar
                  isSidebarOpen={isSidebarOpen}
                  isMobileSidebarOpen={isMobileSidebarOpen}
                  onSidebarClose={() => setMobileSidebarOpen(false)}
                />
                {/* En-tête et zone de contenu métier. */}
                <PageWrapper className="page-wrapper" style={{ overflowX: "hidden"}}>
                  <Header toggleMobileSidebar={() => setMobileSidebarOpen(true)} />
                  {/* Zone d’injection des pages (routes enfants). */}
                    {/* `pt` : le sélecteur de produit du header est le contexte de
                        tout ce qui suit. Collé au titre de la page, on lisait deux
                        titres empilés. `pb` : la barre d'enregistrement flotte en bas
                        de plusieurs écrans ; sans cette marge elle recouvre la
                        dernière ligne du tableau qu'elle sert à sauvegarder. */}
                    <Box sx={{
                        width: "100%",
                        minHeight: "calc(100vh - 170px)",
                        pl: 3,
                        pr: 3,
                        pt: 3,
                        pb: 12,
                      }}
                    >
                      <PageAccessGuard>{children}</PageAccessGuard>
                    </Box>
                </PageWrapper>
              </MainWrapper>
            </CentreProvider>
          </ThemeProvider>
          </>
          )}
          {/* Pages publiques (auth / patient RDV) : on rend directement sans
              Sidebar ni Header. Le composant enfant gère son propre layout. */}
          {isPublicPage && children}
        </SessionProvider>
      </body>
  </html>
  );
}
