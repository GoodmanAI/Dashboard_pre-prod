"use client";

import { useSession } from "next-auth/react";
import { Alert, Box, Button } from "@mui/material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import type { SlugProduit } from "@/lib/produits";
import { cheminSupport } from "@/lib/supportProduit";
import { adresseDansSonEspace } from "@/lib/espaces";
import SupportClient from "./SupportClient";
import SupportClientDetail from "./SupportClientDetail";

/**
 * Le support d'un produit, `/client/c/{userId}/{produit}/support[/{id}]` (28/10/2026).
 *
 * Le client y écrit et suit ses demandes. L'équipe les traite dans Pilot depuis le
 * 27/11/2026 (plan lyrae/plans/2026-11-separation-dashboard-pilot.md) : un compte de
 * l'équipe qui arrive ici est renvoyé vers la demande dans Pilot.
 */
export default function PageSupport({
  produit,
  userIdParam,
  ticketIdParam,
}: {
  produit: SlugProduit;
  userIdParam: string;
  ticketIdParam?: string;
}) {
  const { data: session, status } = useSession();
  const userId = Number(userIdParam);
  const ticketId = ticketIdParam === undefined ? undefined : parseInt(ticketIdParam, 10);

  if (status !== "authenticated" || !session?.user || !Number.isFinite(userId)) {
    return (
      <PageContainer title="Support" description="Support">
        <Box />
      </PageContainer>
    );
  }

  const estAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";
  const liste = cheminSupport(userId, produit);

  if (estAdmin) {
    const cible = ticketId !== undefined && Number.isFinite(ticketId)
      ? `/pilot/support/tickets/${ticketId}`
      : "/pilot/support?vue=clients";
    return (
      <PageContainer title="Support" description="Support">
        <Alert severity="info" action={<Button component="a" href={adresseDansSonEspace(cible, false)}>Ouvrir dans Pilot</Button>}>
          Les demandes des clients se traitent dans Pilot, page Support.
        </Alert>
      </PageContainer>
    );
  }

  if (ticketId !== undefined) {
    const id = Number.isFinite(ticketId) ? ticketId : null;
    return <SupportClientDetail ticketId={id} retourHref={liste} />;
  }

  return <SupportClient userId={userId} produit={produit} />;
}
