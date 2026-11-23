import { redirect } from "next/navigation";

// Passé dans Pilot le 23/11/2026 (plan lyrae/plans/2026-11-pilot-dans-le-dashboard.md).
// Les anciens liens et favoris arrivent au bon endroit ; le middleware ouvre ensuite l'hôte de Pilot.
export default function Page() {
  redirect("/pilot/versions");
}
