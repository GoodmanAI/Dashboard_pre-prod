"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress } from "@mui/material";
import { useCentre } from "@/app/context/CentreContext";
import { lireAccesInternes, ouvreLesCentres, premierEcranAdmin } from "@/lib/accesInternes";
import { getFirstAccessiblePath } from "@/lib/pageAccess";

/**
 * Entrée /admin : la vue d'ensemble pour le super-administrateur ; pour un compte
 * interne (ADMIN, 24/11/2026), le premier écran qui lui est ouvert : un écran
 * d'administration, sinon le premier écran du centre choisi en haut de page. Le
 * middleware a déjà renvoyé vers Pilot un compte qui n'ouvre rien du Dashboard.
 */
const AdminPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedCentre } = useCentre();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/authentication/signin");
      return;
    }
    if (status !== "authenticated") return;
    const role = session?.user?.role;
    if (role === "SUPER_ADMIN") {
      router.replace("/admin/overview");
      return;
    }
    if (role !== "ADMIN") {
      router.replace("/client");
      return;
    }
    const acces = lireAccesInternes(session?.user?.permissions);
    const admin = premierEcranAdmin(acces);
    if (admin) {
      router.replace(admin);
      return;
    }
    if (ouvreLesCentres(acces) && selectedCentre) {
      router.replace(getFirstAccessiblePath(session!.user as any, selectedCentre.id) ?? "/pilot");
    }
  }, [session, status, router, selectedCentre]);

  return (
    <Box sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
      <CircularProgress />
    </Box>
  );
};

export default AdminPage;
