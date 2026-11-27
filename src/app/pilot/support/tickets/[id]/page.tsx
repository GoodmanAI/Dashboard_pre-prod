import { notFound } from "next/navigation";
import { utilisateurCourant } from "@/pilot/lib/session";
import { contexteTicket } from "@/pilot/lib/support/depuisTicket";
import { PageTicket } from "./PageTicket";

export const dynamic = "force-dynamic";

/**
 * Une demande de client dans Pilot (27/11/2026) : la conversation avec le client, son
 * statut et qui s'en charge, puis le sujet où l'équipe en discute.
 */
export default async function PageTicketPilot({ params }: { params: { id: string } }) {
  await utilisateurCourant();
  const id = Number(params.id);
  const contexte = Number.isInteger(id) && id > 0 ? await contexteTicket(id) : null;
  if (!contexte) notFound();
  return <PageTicket contexte={contexte} />;
}
