import PageSupport from "@/components/tickets/PageSupport";

/** Support de LyraeTalk : ses tickets seuls, à ses couleurs (28/10/2026). */
export default function Page({ params }: { params: { userId: string } }) {
  return <PageSupport produit="talk" userIdParam={params.userId} />;
}
