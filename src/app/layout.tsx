"use client";

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

  /** Détection des pages d’authentification pour retirer le chrome global. */
  const pathname = usePathname();
  const isAuthPage = pathname.startsWith("/authentication");

  return (
    <html lang="fr" className={myFont.variable}>
      <body style={{ margin: 0, padding: 0, overflowX: "hidden", overflowY: "auto" }}>
        {/* Contexte d’authentification NextAuth disponible partout. */}
        <SessionProvider>
        {!isAuthPage && (
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
                <PageWrapper className="page-wrapper">
                  <Header toggleMobileSidebar={() => setMobileSidebarOpen(true)} />
                  {/* Zone d’injection des pages (routes enfants). */}
                    <Box sx={{
                        width: "100%",
                        minHeight: "calc(100vh - 170px)",
                      }}
                    >
                      {children}
                      </Box>
                </PageWrapper>
              </MainWrapper>
            </CentreProvider>
          </ThemeProvider>
          </>
          )}
          {/* Pour les pages d’authentification, on évite d’afficher Sidebar/Header. */}
          {isAuthPage && children}
        </SessionProvider>
      </body>
  </html>
  );
}
