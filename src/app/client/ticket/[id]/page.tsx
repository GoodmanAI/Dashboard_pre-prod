"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Box, Button, Card, Stack, Typography } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import TicketConversation from "@/components/tickets/TicketConversation";

/**
 * Page detail ticket cote client : /client/ticket/[id]
 *
 * Affiche le fil complet du ticket + input pour repondre.
 * Le controle d'acces est fait cote endpoint GET /api/tickets/[id] :
 *   - owner (userId), createur (createdById), ADMIN_USER manager, ou ADMIN
 *   - sinon 403 -> le composant TicketConversation affiche l'erreur
 *
 * Rien de specifique client ici (pas de gestion de status, pas de note).
 * L'admin a sa propre page avec ces controles supplementaires.
 */

interface Props {
  params: { id: string };
}

export default function ClientTicketDetailPage({ params }: Props) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [ticketId, setTicketId] = useState<number | null>(null);

  useEffect(() => {
    const parsed = parseInt(params.id, 10);
    if (Number.isFinite(parsed)) setTicketId(parsed);
  }, [params.id]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  if (status !== "authenticated" || !session?.user?.id || !ticketId) {
    return (
      <PageContainer title="Ticket" description="Detail du ticket support">
        <Box />
      </PageContainer>
    );
  }

  const currentUserId = Number(session.user.id);

  return (
    <PageContainer
      title="Ticket"
      description="Detail du ticket support"
    >
      <Stack spacing={2}>
        <Box>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => router.push("/client/ticket")}
            sx={{ color: "#48C8AF" }}
          >
            Retour aux tickets
          </Button>
        </Box>

        <Card sx={{ p: { xs: 2, sm: 3 } }}>
          <TicketConversation
            ticketId={ticketId}
            currentUserId={currentUserId}
          />
        </Card>

        <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
          Le support est notifie par email de vos messages. Vous serez notifie
          par email quand votre ticket sera resolu ou ferme.
        </Typography>
      </Stack>
    </PageContainer>
  );
}
