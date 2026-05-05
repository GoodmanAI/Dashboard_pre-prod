import IncidentsPage from "@/app/client/services/talk/[id]/incidents/page";

export default function Page({ params }: { params: { userProductId: string } }) {
  return <IncidentsPage params={{ id: params.userProductId }} />;
}
