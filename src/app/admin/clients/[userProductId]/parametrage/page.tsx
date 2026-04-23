import ClientPage from "@/app/client/services/talk/[id]/parametrage/page";

export default function Page({ params }: { params: { userProductId: string } }) {
  return <ClientPage params={{ id: params.userProductId }} />;
}
