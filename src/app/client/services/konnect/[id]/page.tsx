import { redirect } from "next/navigation";

/**
 * Accueil du produit LyraeKonnect.
 *
 * Redirige vers le paramétrage : c'est aujourd'hui le seul écran du produit.
 * Le tableau de bord de pilotage viendra à l'étape 7 (chemin *push*, sur le
 * modèle de `calls/summary`), et prendra alors cette place.
 */
export default function AccueilKonnect({ params }: { params: { id: string } }) {
  redirect(`/client/services/konnect/${params.id}/parametrage`);
}
