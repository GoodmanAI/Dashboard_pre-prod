import ClientPage from "@/app/client/services/talk/[id]/stats_appel/page";

export default function Page({ params }: { params: { userProductId: string } }) {
  return <ClientPage params={{ id: params.userProductId }} />;
}
