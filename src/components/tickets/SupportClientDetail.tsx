"use client";

import SectionHeader from "@/components/admin/SectionHeader";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Box, Card, Stack, Typography } from "@mui/material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import TicketConversation from "@/components/tickets/TicketConversation";

/**
 * Detail d'un ticket cote client, sous le support de son produit
 * (`/client/c/{userId}/{produit}/support/{id}`, 28/10/2026).
 *
 * Affiche le fil complet du ticket + input pour repondre.
 * Le controle d'acces est fait cote endpoint GET /api/tickets/[id] :
 *   - owner (userId), createur (createdById), ADMIN_USER manager, ou ADMIN
 *   - sinon 403 -> le composant TicketConversation affiche l'erreur
 *
 * Rien de specifique client ici (pas de gestion de status, pas de note).
 * L'admin a sa propre vue avec ces controles supplementaires.
 */
export default function SupportClientDetail({
  ticketId,
  retourHref,
}: {
  ticketId: number | null;
  /** La liste du support d'ou l'on vient. */
  retourHref: string;
}) {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  if (status !== "authenticated" || !session?.user?.id || !ticketId) {
    return (
      <PageContainer title="Ticket" description="Détail du ticket">
        <Box />
      </PageContainer>
    );
  }

  const currentUserId = Number(session.user.id);

  return (
    <PageContainer title="Ticket" description="Détail du ticket">
      <Stack spacing={2}>
        <SectionHeader title="Ticket" retour={{ libelle: "Retour aux tickets", href: retourHref }} />

        <Card sx={{ p: { xs: 2, sm: 3 } }}>
          <TicketConversation ticketId={ticketId} currentUserId={currentUserId} useDisplayNumber />
        </Card>

        <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
          Le support reçoit vos messages par e-mail. Vous serez prévenu
          par e-mail quand votre ticket sera résolu ou fermé.
        </Typography>
      </Stack>
    </PageContainer>
  );
}
