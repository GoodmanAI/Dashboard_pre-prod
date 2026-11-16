// Pendant qu'un écran se prépare (navigation entre deux pages), le battement à la place
// d'une page vide. Rendu serveur : aucune donnée, aucun JavaScript nécessaire.
import Battement from "@/components/shared/Battement";

export default function Loading() {
  return <Battement hauteur="60vh" />;
}
