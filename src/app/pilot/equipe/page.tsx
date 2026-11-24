import { utilisateurCourant } from "@/pilot/lib/session";
import { chargerEquipe } from "@/pilot/lib/acces/comptes";
import { lireDirecteurGeneral } from "@/pilot/lib/alertes/attribuer";
import { AccesRefuse } from "@/pilot/components/AccesRefuse";
import { Equipe } from "./Equipe";

export const dynamic = "force-dynamic";

/** Les comptes de l'équipe et leurs droits (C-64) : le super-administrateur et les administrateurs de Pilot. */
export default async function PageEquipe() {
  const moi = await utilisateurCourant();
  if (!moi.superAdmin) {
    return <AccesRefuse titre="Équipe" raison="Cette page est réservée aux administrateurs de Pilot."
      suite="Ce sont eux qui créent les comptes et donnent les droits. Adressez-vous à l'un d'eux pour un changement." />;
  }
  const [membres, directeur] = await Promise.all([chargerEquipe(), lireDirecteurGeneral()]);
  return <Equipe membres={membres} directeur={directeur} moi={{ id: moi.id, superAdminDashboard: moi.superAdminDashboard }} />;
}
