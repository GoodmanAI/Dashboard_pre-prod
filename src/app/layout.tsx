"use client";

import { styled, Container, Box } from "@mui/material";
import { ThemeProvider, CssBaseline } from "@mui/material";
import React, { useState } from "react";
import Header from "@/app/(DashboardLayout)/layout/header/Header";
import Sidebar from "@/app/(DashboardLayout)/layout/sidebar/Sidebar";
import { SessionProvider } from "next-auth/react";
import { baselightTheme } from "@/utils/theme/DefaultColors";
import { usePathname } from "next/navigation";

const MainWrapper = styled("div")(() => ({
  display: "flex",
  minHeight: "100vh",
  width: "100%",
}));

const PageWrapper = styled("div")(() => ({
  display: "flex",
  flexGrow: 1,
  paddingBottom: "60px",
  flexDirection: "column",
  zIndex: 1,
  backgroundColor: "transparent",
}));

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
    <html lang="fr">
      <body style={{ margin: 0, padding: 0, overflowX: "hidden", overflowY: "hidden" }}>
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
