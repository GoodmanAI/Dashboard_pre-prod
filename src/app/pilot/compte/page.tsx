import { utilisateurCourant } from "@/pilot/lib/session";
import { demandesDuJour } from "@/pilot/lib/demandes/charger";
import { DROITS, PROFILS } from "@/pilot/lib/acces/droits";
import { MonCompte } from "./MonCompte";

export const dynamic = "force-dynamic";

/** Ce que permet le compte, dit en phrases : le rôle, puis chaque droit, ouvert ou non (C-64). */
function ceQuePermet(moi: Awaited<ReturnType<typeof utilisateurCourant>>) {
  const lignes: { texte: string; ouvert: boolean; detail?: string }[] = [
    { texte: "Voir et modifier les clients, les centres et les déploiements.", ouvert: true },
    { texte: "Demander à un collègue d'agir, et répondre à ses demandes.", ouvert: true },
  ];
  for (const d of DROITS) {
    const ouvert = moi.droits.includes(d.cle);
    const interdit = moi.profil !== null && PROFILS[moi.profil].interdits.includes(d.cle);
    lignes.push({ texte: d.libelle, ouvert, detail: ouvert ? d.detail
      : interdit ? `Pas pour un ${PROFILS[moi.profil!].libelle.toLowerCase()}.` : "Le super-administrateur peut vous l'ouvrir." });
  }
  if (moi.superAdmin) lignes.push({ texte: "Créer les comptes de l'équipe et donner les droits.", ouvert: true },
    { texte: "Marquer faite ou annuler n'importe quelle demande.", ouvert: true });
  return lignes;
}

export default async function PageCompte() {
  const moi = await utilisateurCourant();
  const { pourMoi, envoyeesOuvertes } = await demandesDuJour(moi.id);
  return <MonCompte compte={{ nom: moi.name ?? moi.email, email: moi.email, libelleRole: moi.libelle, motDePasseProvisoire: moi.motDePasseProvisoire }}
    droits={ceQuePermet(moi)} demandesPourMoi={pourMoi.length} demandesEnvoyees={envoyeesOuvertes} />;
}
