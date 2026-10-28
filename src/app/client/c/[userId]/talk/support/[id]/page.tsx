import PageSupport from "@/components/tickets/PageSupport";

/** Un ticket du support de LyraeTalk (28/10/2026). */
export default function Page({ params }: { params: { userId: string; id: string } }) {
  return <PageSupport produit="talk" userIdParam={params.userId} ticketIdParam={params.id} />;
}
