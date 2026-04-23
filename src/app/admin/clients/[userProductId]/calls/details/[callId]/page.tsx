import ClientPage from "@/app/client/services/talk/[id]/calls/details/[callId]/page";

export default function Page({
  params,
}: {
  params: { userProductId: string; callId: string };
}) {
  return <ClientPage params={{ id: params.userProductId, callId: params.callId }} />;
}
