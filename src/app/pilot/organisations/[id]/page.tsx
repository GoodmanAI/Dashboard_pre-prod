import { pondere as ponderer } from "@/pilot/lib/argent";
import { glissement } from "@/pilot/lib/integration/glissement";
import { estimerRattachement } from "@/pilot/lib/integration/estimation";
import { notFound } from "next/navigation";
import { chargerFiche } from "@/pilot/lib/organisations/chargerFiche";
import { aCompleter } from "@/pilot/lib/organisations/aCompleter";
import { probabiliteEffective } from "@/pilot/lib/pipeline";
import { recurrentSigne } from "@/pilot/lib/montants/montantAffiche";
import { etapesSuivies } from "@/pilot/lib/checklist/definition";
import { peutModifierLesMontants, peutModifierPilot } from "@/pilot/lib/autorisations";
import { temperature as calculerTemperature } from "@/pilot/lib/organisations/temperature";
import { pourLEcran } from "@/pilot/lib/organisations/temperatureAffichage";
import { FicheOrganisation } from "./FicheOrganisation";
import { calculerAlertesDuParc } from "@/pilot/lib/alertes";
import { peutConfierAlertes } from "@/pilot/lib/alertes/attribuer";
import { lireSuggestions } from "@/pilot/lib/organisations/lireSuggestions";
import { demandesOuvertesDuClient } from "@/pilot/lib/demandes/charger";
import { lireDateGrilleEnVigueur } from "@/pilot/lib/tarifs/grille";
import { chargerFil } from "@/pilot/lib/commentaires/charger";
import { chargerCibles } from "@/pilot/lib/commentaires/chargerCibles";
import { lireEtapeAvantSortie } from "@/pilot/lib/organisations/changerEtape";
import { chargerFacturation } from "@/pilot/lib/facturation/charger";
import { prisma } from "@/pilot/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PageOrganisation({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) notFound();
  const { utilisateur, org, historique, comptes, clients, catalogue, comptesProduits, jalons, concurrents, pocCycleOuvert, pocPrecedent } = await chargerFiche(id);
  if (!org) notFound();
  const datesParRattachement = new Map<number, typeof org.evenements>();
  for (const e of org.evenements) if (e.centreProduitId != null) {
    const groupe = datesParRattachement.get(e.centreProduitId) ?? []; groupe.push(e); datesParRattachement.set(e.centreProduitId, groupe);
  }
  const recurrent = recurrentSigne(org.contrats);
  const pondere = org.opportunites.filter((o) => !o.gagneeLe && !o.perdueLe).reduce((t, o) =>
    t + ponderer(o.montantMensuelCentimes, probabiliteEffective(o, org.etape)), 0);
  const dernier = org.echanges[0];
  const maintenant = new Date();
  // Le fil des commentaires : trois lectures et les comptes à prévenir en une, quel que soit le nombre de commentaires (lot T).
  const [{ actives: alertes }, demandes, suggestions, grilleDu, commentaires, cibles, avantSortie, peutConfier, facturation] = await Promise.all([
    calculerAlertesDuParc({ organisationId: id }), demandesOuvertesDuClient(id), lireSuggestions(), lireDateGrilleEnVigueur(),
    chargerFil(id, utilisateur), chargerCibles(utilisateur.id), lireEtapeAvantSortie(prisma, id, org.etape),
    peutConfierAlertes(utilisateur), chargerFacturation(id, utilisateur, maintenant),
  ]);
  // Le barème, calculé ici avec les contacts, les salles et les RIS déjà chargés : aucune requête de plus.
  const temperature = pourLEcran(calculerTemperature({
    etape: org.etape, nombreSalles: org.nombreSalles, ris: org.ris, nombreIrm: org.nombreIrm, nombreScanners: org.nombreScanners,
    nombreRadio: org.nombreRadio, nombreEcho: org.nombreEcho, nombreMammo: org.nombreMammo,
    centres: org.centres.map((c) => ({ ris: c.ris, salles: c._count.salles })), contacts: org.contacts,
    qualifBudget: org.qualifBudget, qualifBesoin: org.qualifBesoin, decisionAttendueLe: org.decisionAttendueLe,
    temperatureForcee: org.temperatureForcee, temperatureForceeParId: org.temperatureForceeParId, temperatureForceeLe: org.temperatureForceeLe,
  }, maintenant), org.temperatureForceePar?.name ?? null);
  return <FicheOrganisation facturation={facturation} commentaires={commentaires} cibles={cibles} alertes={alertes} peutConfier={peutConfier} temperature={temperature} concurrents={concurrents} peutModifier={peutModifierPilot(utilisateur.role)} demandes={demandes} moi={{ id: utilisateur.id, role: utilisateur.role, administrateurPilot: utilisateur.administrateurPilot, superAdmin: utilisateur.superAdmin }}
    contrats={org.contrats.map((c) => ({ ...c, signeLe: c.signeLe?.toISOString() ?? null, debuteLe: c.debuteLe?.toISOString() ?? null,
      renouvelleLe: c.renouvelleLe?.toISOString() ?? null, termineLe: c.termineLe?.toISOString() ?? null,
      essaiDebuteLe: c.essaiDebuteLe?.toISOString() ?? null,
      versionProposition: org.propositions.find((p) => p.id === c.propositionId)?.version ?? null }))}
    opportunites={org.opportunites.map((o) => ({ ...o, demarrageAttenduLe: o.demarrageAttenduLe?.toISOString() ?? null,
      gagneeLe: o.gagneeLe?.toISOString() ?? null, perdueLe: o.perdueLe?.toISOString() ?? null }))}
    propositions={org.propositions.map((p) => ({ ...p, majLe: p.majLe.toISOString(), envoyeeLe: p.envoyeeLe?.toISOString() ?? null, valideJusquAu: p.valideJusquAu?.toISOString() ?? null, contratId: p.contrat?.id ?? null }))}
    jalons={jalons.map((j) => ({ ...j, surveneuLe: j.surveneuLe.toISOString() }))}
    org={{
      id: org.id, raisonSocialeNom: org.raisonSocialeNom, type: org.type, etape: org.etape,
      raisonSortie: org.raisonSortie, ris: org.ris, nombreSites: org.nombreSites, nombreSalles: org.nombreSalles,
      raisonSortieCode: org.raisonSortieCode, reveilLe: org.reveilLe?.toISOString() ?? null, avantSortie,
      prochaineAction: org.prochaineAction, prochaineActionLe: org.prochaineActionLe?.toISOString() ?? null,
      pocCycleOuvert, pocPrecedent: pocPrecedent ? { ...pocPrecedent, debuteLe: pocPrecedent.debuteLe.toISOString(), prolongeLe: pocPrecedent.prolongeLe?.toISOString() ?? null } : null,
      pocDebuteLe: org.pocDebuteLe?.toISOString() ?? null, pocProlongeLe: org.pocProlongeLe?.toISOString() ?? null,
      etapeDepuisLe: org.etapeDepuisLe.toISOString(), solutionActuelle: org.solutionActuelle,
      concurrentId: org.concurrentId, concurrentGagnantId: org.concurrentGagnantId,
      decisionAttendueLe: org.decisionAttendueLe?.toISOString() ?? null,
      qualifBesoin: org.qualifBesoin, qualifBudget: org.qualifBudget, qualifSolutionActuelle: org.qualifSolutionActuelle,
      volumeAppelsEstime: org.volumeAppelsEstime, responsableId: org.responsableId, chefDeProjetId: org.chefDeProjetId,
      risVersion: org.risVersion, outilRdv: org.outilRdv, nombreSecretaires: org.nombreSecretaires, nombreIrm: org.nombreIrm,
      nombreScanners: org.nombreScanners, nombreRadio: org.nombreRadio, nombreEcho: org.nombreEcho, nombreMammo: org.nombreMammo,
      blocagesTechniques: org.blocagesTechniques, origine: org.origine, rattachementGht: org.rattachementGht, notes: org.notes,
      priorite: org.priorite, telephone: org.telephone, email: org.email, siteWeb: org.siteWeb,
      siren: org.siren, denominationLegale: org.denominationLegale, siretSiege: org.siretSiege, siegeAdresse: org.siegeAdresse,
      siegeCodePostal: org.siegeCodePostal, siegeVille: org.siegeVille, codeNaf: org.codeNaf, formeJuridique: org.formeJuridique,
      annuaireLuLe: org.annuaireLuLe?.toISOString() ?? null,
      utilisateurId: org.utilisateurId, emailDashboard: org.utilisateur?.email ?? null,
      commercial: org.responsable?.name ?? null, chefDeProjet: org.chefDeProjet?.name ?? null,
      apporteur: org.apport?.apporteur.nom ?? null,
      joursDansEtape: Math.floor((Date.now() - org.etapeDepuisLe.getTime()) / 86400000),
      contacts: org.contacts.map(({ id, nom, metier, fonction, email, telephone, roleDecision, principal, facturation, notes, attitude, dernierContactLe }) =>
        ({ id, nom, metier, fonction, email, telephone, roleDecision, principal, facturation, notes, attitude, dernierContactLe: dernierContactLe?.toISOString() ?? null })),
      vagues: org.centres.length >= 2 ? org.vagues.map((v) => ({ id: v.id, numero: v.numero, nom: v.nom, datePromise: v.datePromise?.toISOString() ?? null })) : [],
      centres: org.centres.map((c) => ({
        id: c.id, nom: c.nom, codeSite: c.codeSite, ville: c.ville, adresse: c.adresse, codePostal: c.codePostal,
        siret: c.siret, finess: c.finess, salles: c.salles,
        rattachements: c.rattachements.map((r) => {
          // Le compte part du référentiel du produit : une case pas encore créée en
          // base est une case ouverte, pas une case qui n'existe pas. Sauf une étape du
          // lot V : absente, le déploiement était déjà en service à son arrivée (C-85).
          const lignes = c.etapesIntegration.filter((e) => e.productId === r.productId);
          const definitions = etapesSuivies(r.product.name, (cle) => lignes.some((e) => e.cle === cle));
          const faites = new Set(lignes.filter((e) => e.faite).map((e) => e.cle));
          return { id: r.id, vagueId: r.vagueId, glissement: glissement({ datePromise: r.datePromise, datePromiseInitiale: r.datePromiseInitiale, evenements: datesParRattachement.get(r.id) ?? [] }), productId: r.productId, produit: r.product.name, userProductId: r.userProductId,
            email: r.userProduct?.user.email ?? null, datePromise: r.datePromise?.toISOString() ?? null,
            faites: definitions.filter((d) => faites.has(d.cle)).length, total: definitions.length,
            bloquantes: definitions.filter((d) => d.bloquante && !faites.has(d.cle)).length,
            // Lignes déjà chargées avec le centre : aucune requête de plus.
            estimation: estimerRattachement({ produit: r.product.name, datePromise: r.datePromise, miseEnProductionLe: r.miseEnProductionLe,
              suiviRenforceJusquAu: r.suiviRenforceJusquAu, maintenant, lignes }) };
        }),
      })),
      dernierEchange: dernier ? { ...dernier, surveneuLe: dernier.surveneuLe.toISOString() } : null,
    }}
    complements={aCompleter(org)} historique={historique} comptes={comptes} clients={clients} suggestions={suggestions}
    catalogue={catalogue}
    // Seuls les accès produit du compte Dashboard du client sont proposés : la
    // liste ne montre jamais les comptes des autres clients (CHOIX.md, C-28).
    comptesProduits={comptesProduits.filter((c) => c.userId === org.utilisateurId)}
    compteClientConnu={org.utilisateurId != null}
    recurrent={recurrent} pondere={pondere}
    montantsModifiables={peutModifierLesMontants(utilisateur)} grilleDu={grilleDu}
  />;
}
