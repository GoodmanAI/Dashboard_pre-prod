"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Box } from "@mui/material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import { cheminSupport, produitDuTicket } from "@/lib/supportProduit";

/**
 * Ancienne adresse d'un ticket côté client, que la cloche des notifications envoie
 * encore. On lit le ticket pour connaître son centre et son produit, puis on ouvre
 * le support de ce produit (28/10/2026). Le contrôle d'accès reste celui de
 * `GET /api/tickets/[id]`.
 */
export default function AncienTicketClient({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/authentication/signin");
      return;
    }
    if (status !== "authenticated") return;
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      router.replace("/client/ticket");
      return;
    }
    fetch(`/api/tickets/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const t = d?.ticket;
        if (!t?.userId) {
          router.replace("/client/ticket");
          return;
        }
        router.replace(cheminSupport(t.userId, produitDuTicket(t.userProduct?.product?.name), id));
      })
      .catch(() => router.replace("/client/ticket"));
  }, [status, params.id, router]);

  return (
    <PageContainer title="Ticket" description="Détail du ticket">
      <Box />
    </PageContainer>
  );
}
