import PageSupport from "@/components/tickets/PageSupport";

/** Un ticket du support de LyraeKonnect (28/10/2026). */
export default function Page({ params }: { params: { userId: string; id: string } }) {
  return <PageSupport produit="konnect" userIdParam={params.userId} ticketIdParam={params.id} />;
}
