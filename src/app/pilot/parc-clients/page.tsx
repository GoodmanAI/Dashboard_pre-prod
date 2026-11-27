import { redirect } from "next/navigation";

/** « Parc clients » est une section de « Parc » depuis le 27/11/2026 : anciens liens et favoris. */
export default function PageParcClients() {
  redirect("/pilot/parc#installation");
}
