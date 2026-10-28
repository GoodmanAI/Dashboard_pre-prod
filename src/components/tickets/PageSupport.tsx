"use client";

import { useSession } from "next-auth/react";
import { Box } from "@mui/material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import type { SlugProduit } from "@/lib/produits";
import { cheminSupport } from "@/lib/supportProduit";
import SupportAdmin from "./SupportAdmin";
import SupportAdminDetail from "./SupportAdminDetail";
import SupportClient from "./SupportClient";
import SupportClientDetail from "./SupportClientDetail";

/**
 * Le support d'un produit, `/client/c/{userId}/{produit}/support[/{id}]` (28/10/2026).
 *
 * Une seule adresse pour les deux rôles, comme les autres écrans d'un centre : un
 * admin y voit les tickets de ce produit avec ses outils (statut, assignation), un
 * client les siens. L'adresse garde le produit, donc ses couleurs, son menu et son
 * logo.
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

  if (ticketId !== undefined) {
    const id = Number.isFinite(ticketId) ? ticketId : null;
    return estAdmin ? (
      <SupportAdminDetail ticketId={id} retourHref={liste} />
    ) : (
      <SupportClientDetail ticketId={id} retourHref={liste} />
    );
  }

  return estAdmin ? (
    <SupportAdmin produit={produit} cheminTicket={(id) => cheminSupport(userId, produit, id)} />
  ) : (
    <SupportClient userId={userId} produit={produit} />
  );
}
