"use client";

import SupportAdminDetail from "@/components/tickets/SupportAdminDetail";

/** Un ticket depuis la console du support (lien des mails et de la cloche). */
export default function AdminTicketDetailPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  return <SupportAdminDetail ticketId={Number.isFinite(id) ? id : null} retourHref="/admin/ticket" />;
}
