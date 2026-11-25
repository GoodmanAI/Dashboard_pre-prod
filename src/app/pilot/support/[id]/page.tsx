import { notFound } from "next/navigation";
import { chargerSujet } from "@/pilot/lib/support/charger";
import { utilisateurCourant } from "@/pilot/lib/session";
import { FilSupport } from "./FilSupport";

export const dynamic = "force-dynamic";

export default async function PageSujet({ params }: { params: { id: string } }) {
  const moi = await utilisateurCourant();
  const id = Number(params.id);
  const sujet = Number.isInteger(id) && id > 0 ? await chargerSujet(id) : null;
  if (!sujet) notFound();
  return <FilSupport sujet={sujet} moiId={moi.id} />;
}
