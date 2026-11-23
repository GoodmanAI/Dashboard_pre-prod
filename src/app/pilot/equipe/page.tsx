import { utilisateurCourant } from "@/pilot/lib/session";
import { chargerEquipe } from "@/pilot/lib/acces/comptes";
import { lireDirecteurGeneral } from "@/pilot/lib/alertes/attribuer";
import { AccesRefuse } from "@/pilot/components/AccesRefuse";
import { Equipe } from "./Equipe";

export const dynamic = "force-dynamic";

/** Les comptes de l'équipe et leurs droits (C-64) : le super-administrateur seul les voit et les change. */
export default async function PageEquipe() {
  const moi = await utilisateurCourant();
  if (!moi.superAdmin) {
    return <AccesRefuse titre="Équipe" raison="Cette page est réservée au super-administrateur."
      suite="C'est lui qui crée les comptes et donne les droits. Adressez-vous à lui pour un changement." />;
  }
  const [membres, directeur] = await Promise.all([chargerEquipe(), lireDirecteurGeneral()]);
  return <Equipe membres={membres} directeur={directeur} />;
}
