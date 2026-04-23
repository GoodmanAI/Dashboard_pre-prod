"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress } from "@mui/material";

/**
 * Entrée /admin : redirige vers /admin/overview (la page par défaut).
 */
const AdminPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/authentication/signin");
      return;
    }
    if (status === "authenticated") {
      if (session?.user?.role !== "ADMIN") {
        router.replace("/client");
        return;
      }
      router.replace("/admin/overview");
    }
  }, [session, status, router]);

  return (
    <Box sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
      <CircularProgress />
    </Box>
  );
};

export default AdminPage;
