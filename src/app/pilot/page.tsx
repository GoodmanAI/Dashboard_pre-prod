import { construireAujourdhui } from "@/pilot/lib/aujourdhui/construire";
import { demandesDuJour } from "@/pilot/lib/demandes/charger";
import { commentairesNonLus } from "@/pilot/lib/commentaires/charger";
import { utilisateurCourant } from "@/pilot/lib/session";
import { AujourdHui } from "./AujourdHui";

export const dynamic = "force-dynamic";
export default async function PageAujourdHui({ searchParams }: { searchParams: { vue?: string; page?: string } }) {
  const equipe = searchParams.vue === "equipe";
  const numero = Number(searchParams.page ?? 1);
  const page = Number.isInteger(numero) && numero > 0 && numero <= 100000 ? numero : 1;
  const moi = await utilisateurCourant();
  // « Pour vous » : les demandes et les commentaires non lus, lus en parallèle (lot T).
  const [donnees, demandes, commentaires] = await Promise.all([construireAujourdhui(equipe, page), demandesDuJour(moi.id), commentairesNonLus(moi.id)]);
  return <AujourdHui donnees={donnees} equipe={equipe} demandes={demandes} commentaires={commentaires} moi={{ id: moi.id, role: moi.role, administrateurPilot: moi.administrateurPilot, superAdmin: moi.superAdmin }} />;
}
