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

const MainWrapper = styled("div")(() => ({
  display: "flex",
  minHeight: "100vh",
  width: "100%",
}));

const PageWrapper = styled("div")(() => ({
  display: "flex",
  flexGrow: 1,
  paddingBottom: 0,
  flexDirection: "column",
  zIndex: 1,
  backgroundColor: "transparent",
}));

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
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const pathname = usePathname();
  const isAuthPage = pathname.startsWith("/authentication");

  return (
    <html lang="fr" className={myFont.variable}>
      <body style={{ margin: 0, padding: 0, overflowX: "hidden", overflowY: "auto" }}>
        <SessionProvider>
        {!isAuthPage && (
          <>
          <ThemeProvider theme={baselightTheme}>
            <CssBaseline />
            <MainWrapper className="mainwrapper">
              {/* ------------------------------------------- */}
              {/* Sidebar */}
              {/* ------------------------------------------- */}
              <Sidebar
                isSidebarOpen={isSidebarOpen}
                isMobileSidebarOpen={isMobileSidebarOpen}
                onSidebarClose={() => setMobileSidebarOpen(false)}
              />
              {/* ------------------------------------------- */}
              {/* Main Wrapper */}
              {/* ------------------------------------------- */}
              <PageWrapper className="page-wrapper">
                {/* ------------------------------------------- */}
                {/* Header */}
                {/* ------------------------------------------- */}
                <Header toggleMobileSidebar={() => setMobileSidebarOpen(true)} />
                {/* ------------------------------------------- */}
                {/* PageContent */}
                {/* ------------------------------------------- */}
                  {/* ------------------------------------------- */}
                  {/* Page Route */}
                  {/* ------------------------------------------- */}
                  <Box sx={{
                      width: "100%",
                      minHeight: "calc(100vh - 170px)",
                    }}
                  >
                    {children}
                    </Box>
                  {/* ------------------------------------------- */}
                  {/* End Page */}
                  {/* ------------------------------------------- */}
              </PageWrapper>
            </MainWrapper>
          </ThemeProvider>
          </>
          )}
          {isAuthPage && children}
        </SessionProvider>
      </body>
  </html>
  );
}
