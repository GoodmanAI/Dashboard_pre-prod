import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { prisma } from "@/pilot/lib/prisma";
import { debutDuJour } from "@/pilot/lib/dates";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { adresseChangee, geocodageARelancer, GEOCODAGE_A_REFAIRE } from "@/pilot/lib/carte/geocoder";
import { geocoderApresCommit, geocoderCentresDe } from "@/pilot/lib/carte/localiser";
import type {
  actionFacture, champsApport, champsApporteur, champsParametres, champsPrestataire, champsSalle, champsSite, creationGroupe,
} from "@/pilot/lib/validation/apport";
import { ajouterJours, ajouterMois, creerMoteur } from "./calcul";
import { chargerApports, contexteDe, dateDuMois, jour } from "./charger";
import { ETAPES_COMMANDE, type StatutCommande } from "./referentiel";

/**
 * Les écritures de l'apport d'affaires (CHOIX.md, C-63). Chaque écriture passe
 * par le journal ; les résumés ne portent jamais de texte libre ni les
 * coordonnées d'un contact ou d'un prestataire (C-27).
 *
 * Un site créé, copié ou dont l'adresse change est géocodé après le commit,
 * sans faire attendre (lot U) : `geocoderApresCommit`, `geocoderCentresDe`.
 */

type Tx = Prisma.TransactionClient;
const aujourdhui = () => debutDuJour(new Date());

async function verrouillerApport(tx: Tx, organisationId: number) {
  await tx.$queryRaw`SELECT id FROM "CrmApport" WHERE "organisationId" = ${organisationId} FOR UPDATE`;
  const apport = await tx.crmApport.findUnique({ where: { organisationId } });
  if (!apport) throw new ErreurMetier("Ce client n'est pas suivi en apport d'affaires.", 404);
  return apport;
}
async function verifierApporteur(tx: Tx, id: number) {
  if (!await tx.crmApporteur.findUnique({ where: { id }, select: { id: true } })) throw new ErreurMetier("Apporteur inconnu.", 404);
}
function erreurNom(erreur: unknown): never {
  if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") throw new ErreurMetier("Un site porte déjà ce nom chez ce client.", 409);
  throw erreur;
}
/** « Site 3 », ou « Site 3 (copie) » : un nom libre chez ce client. */
async function nomLibre(tx: Tx, organisationId: number, voulu: (n: number) => string, depart: number) {
  const pris = new Set((await tx.crmCentre.findMany({ where: { organisationId }, select: { nom: true } })).map((c) => c.nom));
  let n = depart;
  while (pris.has(voulu(n))) n++;
  return voulu(n);
}

/* ----------------------------- Groupes ----------------------------- */

export async function creerGroupe(d: z.output<typeof creationGroupe>, auteurId: number) {
  const { organisationId, siteCree } = await transactionJournalisee(async (tx) => {
    await verifierApporteur(tx, d.apporteurId);
    let organisationId: number, siteCree = false;
    if ("organisationId" in d) {
      const org = await tx.crmOrganisation.findUnique({ where: { id: d.organisationId }, select: { id: true, apport: { select: { id: true } } } });
      if (!org) throw new ErreurMetier("Client inconnu.", 404);
      if (org.apport) throw new ErreurMetier("Ce client est déjà suivi en apport d'affaires.", 409);
      organisationId = org.id;
    } else {
      const org = await tx.crmOrganisation.create({ data: { raisonSocialeNom: d.nom, type: "GROUPE_PRIVE", etape: "PROSPECT",
        etapeDepuisLe: new Date(), origine: "APPORTEUR", centres: { create: { nom: "Site 1" } } } });
      await journaliser(tx, { type: "ORGANISATION_CREEE", organisationId: org.id, auteurId, resume: "Prospect créé depuis l'apport d'affaires",
        apres: { type: org.type, origine: org.origine } });
      organisationId = org.id;
      siteCree = true;
    }
    await tx.crmApport.create({ data: { organisationId, apporteurId: d.apporteurId, signaleLe: aujourdhui(), offreTalk: true, offreKonnect: true } });
    await journaliser(tx, { type: "APPORT_CREE", organisationId, auteurId, resume: "Suivi en apport d'affaires", apres: { apporteurId: d.apporteurId } });
    return { organisationId, siteCree };
  });
  if (siteCree) geocoderCentresDe([organisationId]);
  return { organisationId };
}

export async function modifierGroupe(organisationId: number, champs: z.output<typeof champsApport>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const a = await verrouillerApport(tx, organisationId);
    const { nom, notes, ris, origine, ...apport } = champs;
    if (apport.apporteurId) await verifierApporteur(tx, apport.apporteurId);
    if (apport.coApporteurId) await verifierApporteur(tx, apport.coApporteurId);
    // Le co-apporteur ne peut pas être l'apporteur lui-même.
    const principal = apport.apporteurId ?? a.apporteurId;
    if ((apport.coApporteurId !== undefined ? apport.coApporteurId : a.coApporteurId) === principal) apport.coApporteurId = null;
    // Une décision rendue porte une date : celle du jour par défaut.
    if (apport.decision && apport.decision !== "attente" && !(apport.decisionLe ?? a.decisionLe)) apport.decisionLe = aujourdhui();
    const diff = champsChanges(a, apport, Object.keys(apport) as (keyof typeof apport)[]);
    const org = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: organisationId }, select: { raisonSocialeNom: true, notes: true, ris: true, origine: true } });
    const client = { raisonSocialeNom: nom, notes, ris, origine };
    const diffClient = champsChanges(org, client, ["raisonSocialeNom", "notes", "ris", "origine"]);
    const changes = [...Object.keys(diff.apres), ...Object.keys(diffClient.apres)];
    if (!changes.length) return { modifie: false };
    if (Object.keys(diff.apres).length) await tx.crmApport.update({ where: { organisationId }, data: diff.apres });
    if (Object.keys(diffClient.apres).length) await tx.crmOrganisation.update({ where: { id: organisationId }, data: diffClient.apres });
    await journaliser(tx, { type: "APPORT_MODIFIE", organisationId, auteurId, resume: "Apport d'affaires modifié", apres: { champs: changes } });
    return { modifie: true };
  });
}

/**
 * Cliquer une étape pose sa date (aujourd'hui) et celles des étapes précédentes
 * restées vides ; les dates des étapes suivantes s'effacent.
 */
export async function changerEtapeCommande(organisationId: number, statut: StatutCommande, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const a = await verrouillerApport(tx, organisationId);
    const k = ETAPES_COMMANDE.findIndex((e) => e.cle === statut), cible = ETAPES_COMMANDE[k];
    const data: Partial<Record<"bcEnvoyeLe" | "commandeValideeLe" | "commandeInstalleeLe", Date | null>> = {};
    const date = cible.champ ? a[cible.champ] ?? aujourdhui() : aujourdhui();
    if (cible.champ && !a[cible.champ]) data[cible.champ] = date;
    ETAPES_COMMANDE.forEach((e, i) => {
      if (!e.champ) return;
      if (i < k && !a[e.champ]) data[e.champ] = date;
      if (i > k && a[e.champ]) data[e.champ] = null;
    });
    if (!Object.keys(data).length) return { modifie: false };
    await tx.crmApport.update({ where: { organisationId }, data });
    await journaliser(tx, { type: "APPORT_MODIFIE", organisationId, auteurId, resume: `Commande : ${cible.libelle}`, apres: { statut } });
    return { modifie: true };
  });
}

export async function retirerGroupe(organisationId: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verrouillerApport(tx, organisationId);
    await tx.crmApport.delete({ where: { organisationId } });
    await journaliser(tx, { type: "APPORT_RETIRE", organisationId, auteurId, resume: "Retiré de l'apport d'affaires" });
    return { retire: true };
  });
}

/** Copie le groupe en un nouveau prospect : apport, sites, salles, prestataires et contacts. */
export async function dupliquerGroupe(organisationId: number, auteurId: number) {
  const resultat = await transactionJournalisee(async (tx) => {
    const a = await verrouillerApport(tx, organisationId);
    const org = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: organisationId },
      include: { centres: { include: { salles: true }, orderBy: { id: "asc" } }, prestataires: true, contacts: true } });
    const copie = await tx.crmOrganisation.create({ data: {
      raisonSocialeNom: `${org.raisonSocialeNom} (copie)`, type: org.type, etape: "PROSPECT", etapeDepuisLe: new Date(),
      origine: org.origine, ris: org.ris, notes: org.notes,
      centres: { create: org.centres.map((c) => ({ nom: c.nom, ville: c.ville, adresse: c.adresse, ris: c.ris,
        offreTalk: c.offreTalk, offreKonnect: c.offreKonnect, offreConnecteurRis: c.offreConnecteurRis,
        salles: { create: c.salles.map(({ libelle, modalite, ordre }) => ({ libelle, modalite, ordre })) } })) },
      prestataires: { create: org.prestataires.map(({ type, societe, nom, telephone, email, commentaire, ordre }) => ({ type, societe, nom, telephone, email, commentaire, ordre })) },
      contacts: { create: org.contacts.map(({ nom, fonction, email, telephone, roleDecision, attitude, principal }) => ({ nom, fonction, email, telephone, roleDecision, attitude, principal })) },
    } });
    const { id, organisationId: _o, cleImport, creeLe, majLe, ...champs } = a; void id; void _o; void cleImport; void creeLe; void majLe;
    await tx.crmApport.create({ data: { ...champs, organisationId: copie.id } });
    await journaliser(tx, { type: "ORGANISATION_CREEE", organisationId: copie.id, auteurId, resume: "Prospect créé par copie d'un groupe apporté", apres: { depuis: organisationId } });
    await journaliser(tx, { type: "APPORT_CREE", organisationId: copie.id, auteurId, resume: "Suivi en apport d'affaires", apres: { apporteurId: a.apporteurId } });
    return { organisationId: copie.id };
  });
  geocoderCentresDe([resultat.organisationId]);
  return resultat;
}

/* ----------------------------- Sites et salles ----------------------------- */

export async function ajouterSite(organisationId: number, auteurId: number) {
  const resultat = await transactionJournalisee(async (tx) => {
    await verrouillerApport(tx, organisationId);
    const n = await tx.crmCentre.count({ where: { organisationId } });
    const nom = await nomLibre(tx, organisationId, (i) => `Site ${i}`, n + 1);
    const centre = await tx.crmCentre.create({ data: { organisationId, nom } });
    await journaliser(tx, { type: "CENTRE_CREE", organisationId, centreId: centre.id, auteurId, resume: `Centre créé : ${nom}`, apres: { nom } });
    return { centreId: centre.id };
  });
  geocoderApresCommit([resultat.centreId]);
  return resultat;
}

async function verrouillerSite(tx: Tx, id: number) {
  await tx.$queryRaw`SELECT id FROM "CrmCentre" WHERE id = ${id} FOR UPDATE`;
  const centre = await tx.crmCentre.findUnique({ where: { id }, include: {
    salles: { orderBy: [{ ordre: "asc" }, { id: "asc" }] },
    _count: { select: { rattachements: true, lignesContrat: true, lignesProposition: true, etapesIntegration: true } } } });
  if (!centre) throw new ErreurMetier("Site inconnu.", 404);
  return centre;
}

export async function modifierSite(id: number, champs: z.output<typeof champsSite>, auteurId: number) {
  try {
    const { modifie, aGeocoder } = await transactionJournalisee(async (tx) => {
      const c = await verrouillerSite(tx, id);
      const diff = champsChanges(c, champs, Object.keys(champs) as (keyof typeof champs)[]);
      if (!Object.keys(diff.apres).length) return { modifie: false, aGeocoder: false };
      // L'adresse change : la position précédente ne vaut plus, elle est recherchée après le commit.
      const adresseNeuve = adresseChangee(c, diff.apres);
      const m = await tx.crmCentre.update({ where: { id }, data: { ...(diff.apres as z.output<typeof champsSite>), ...(adresseNeuve ? GEOCODAGE_A_REFAIRE : {}) } });
      await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId: c.organisationId, centreId: id, auteurId,
        resume: `Centre modifié : ${m.nom}`, apres: { champs: Object.keys(diff.apres) } });
      // Relancé aussi pour une adresse réécrite aux espaces près sur un site encore à faire (`geocodageARelancer`).
      return { modifie: true, aGeocoder: geocodageARelancer(c, diff.apres) };
    });
    if (aGeocoder) geocoderApresCommit([id]);
    return { modifie };
  } catch (erreur) { erreurNom(erreur); }
}

export async function dupliquerSite(id: number, auteurId: number) {
  const resultat = await transactionJournalisee(async (tx) => {
    const c = await verrouillerSite(tx, id);
    const nom = await nomLibre(tx, c.organisationId, (i) => `${c.nom} (copie${i > 1 ? " " + i : ""})`, 1);
    const copie = await tx.crmCentre.create({ data: { organisationId: c.organisationId, nom, ville: c.ville, adresse: c.adresse, ris: c.ris,
      offreTalk: c.offreTalk, offreKonnect: c.offreKonnect, offreConnecteurRis: c.offreConnecteurRis,
      salles: { create: c.salles.map(({ libelle, modalite, ordre }) => ({ libelle, modalite, ordre })) } } });
    await journaliser(tx, { type: "CENTRE_CREE", organisationId: c.organisationId, centreId: copie.id, auteurId, resume: `Centre créé : ${nom}`, apres: { nom, depuis: id } });
    return { centreId: copie.id };
  });
  geocoderApresCommit([resultat.centreId]);
  return resultat;
}

export async function supprimerSite(id: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const c = await verrouillerSite(tx, id);
    const lie = c._count.rattachements + c._count.lignesContrat + c._count.lignesProposition + c._count.etapesIntegration;
    if (lie) throw new ErreurMetier("Ce site est déjà suivi dans Pilot (produit, devis, contrat ou check-list). Il se gère depuis la fiche client.", 409);
    await tx.crmCentre.delete({ where: { id } });
    await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId: c.organisationId, auteurId, resume: `Centre supprimé : ${c.nom}`, avant: { nom: c.nom } });
    return { supprime: true };
  });
}

export async function ajouterSalles(id: number, nombre: number, modalite: string, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const c = await verrouillerSite(tx, id);
    const depart = c.salles.length, ordre = c.salles.reduce((m, s) => Math.max(m, s.ordre), -1) + 1;
    const creees = await Promise.all(Array.from({ length: nombre }, (_, i) =>
      tx.crmSalle.create({ data: { centreId: id, libelle: `Salle ${depart + i + 1}`, modalite, ordre: ordre + i } })));
    await journaliser(tx, { type: "APPORT_MODIFIE", organisationId: c.organisationId, centreId: id, auteurId,
      resume: `${nombre} salle${nombre > 1 ? "s" : ""} ajoutée${nombre > 1 ? "s" : ""} : ${c.nom}`, apres: { nombre, modalite } });
    return { salleIds: creees.map((s) => s.id) };
  });
}

export async function modifierSalle(id: number, champs: z.output<typeof champsSalle>) {
  const salle = await prisma.crmSalle.updateMany({ where: { id }, data: champs });
  if (!salle.count) throw new ErreurMetier("Salle inconnue.", 404);
  return { modifie: true };
}

export async function supprimerSalle(id: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const s = await tx.crmSalle.findUnique({ where: { id }, include: { centre: { select: { organisationId: true, nom: true } } } });
    if (!s) throw new ErreurMetier("Salle inconnue.", 404);
    await tx.crmSalle.delete({ where: { id } });
    await journaliser(tx, { type: "APPORT_MODIFIE", organisationId: s.centre.organisationId, centreId: s.centreId, auteurId,
      resume: `Salle retirée : ${s.centre.nom}`, avant: { modalite: s.modalite } });
    return { supprime: true };
  });
}

/* ----------------------------- Prestataires ----------------------------- */

export async function ajouterPrestataire(organisationId: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verrouillerApport(tx, organisationId);
    const ordre = await tx.crmPrestataire.count({ where: { organisationId } });
    const p = await tx.crmPrestataire.create({ data: { organisationId, ordre } });
    await journaliser(tx, { type: "APPORT_MODIFIE", organisationId, auteurId, resume: "Prestataire ajouté" });
    return { prestataireId: p.id };
  });
}
export async function modifierPrestataire(id: number, champs: z.output<typeof champsPrestataire>) {
  const r = await prisma.crmPrestataire.updateMany({ where: { id }, data: champs });
  if (!r.count) throw new ErreurMetier("Prestataire inconnu.", 404);
  return { modifie: true };
}
export async function supprimerPrestataire(id: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const p = await tx.crmPrestataire.findUnique({ where: { id } });
    if (!p) throw new ErreurMetier("Prestataire inconnu.", 404);
    await tx.crmPrestataire.delete({ where: { id } });
    await journaliser(tx, { type: "APPORT_MODIFIE", organisationId: p.organisationId, auteurId, resume: "Prestataire retiré" });
    return { supprime: true };
  });
}

/* ----------------------------- Apporteurs et réglages ----------------------------- */

export async function creerApporteur(champs: z.output<typeof champsApporteur>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const ordre = await tx.crmApporteur.count();
    const a = await tx.crmApporteur.create({ data: { ...champs, nom: champs.nom ?? "Nouvel apporteur", ordre } });
    await journaliser(tx, { type: "APPORTEURS_MODIFIES", auteurId, resume: "Apporteur ajouté", apres: { apporteurId: a.id } });
    return { apporteurId: a.id };
  });
}
export async function modifierApporteur(id: number, champs: z.output<typeof champsApporteur>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const a = await tx.crmApporteur.findUnique({ where: { id } });
    if (!a) throw new ErreurMetier("Apporteur inconnu.", 404);
    const diff = champsChanges(a, champs, Object.keys(champs) as (keyof typeof champs)[]);
    if (!Object.keys(diff.apres).length) return { modifie: false };
    await tx.crmApporteur.update({ where: { id }, data: diff.apres });
    await journaliser(tx, { type: "APPORTEURS_MODIFIES", auteurId, resume: "Apporteur modifié", apres: { apporteurId: id, champs: Object.keys(diff.apres) } });
    return { modifie: true };
  });
}
export async function supprimerApporteur(id: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const a = await tx.crmApporteur.findUnique({ where: { id }, include: { _count: { select: { apports: true, coApports: true, factures: true } } } });
    if (!a) throw new ErreurMetier("Apporteur inconnu.", 404);
    if (a._count.apports + a._count.coApports + a._count.factures) throw new ErreurMetier("Cet apporteur a des groupes ou des factures : il reste en place.", 409);
    await tx.crmApporteur.delete({ where: { id } });
    await journaliser(tx, { type: "APPORTEURS_MODIFIES", auteurId, resume: "Apporteur retiré", avant: { apporteurId: id } });
    return { supprime: true };
  });
}

/** Les anciennes colonnes de la grille de l'apport : restées en base, plus lues ni écrites (lot S). La validation les refuse déjà ; ce garde protège les appels directs au service. */
const CHAMPS_GRILLE = ["talkTtcCentimes", "konnectTtcCentimes", "connecteurRisPdm", "installationTalkCentimes", "installationKonnectCentimes", "modeInstallation"] as const;

export async function modifierParametres(champs: z.output<typeof champsParametres>, auteurId: number) {
  // Une colonne que plus rien ne lit ne doit pas laisser croire qu'un prix a changé.
  if (CHAMPS_GRILLE.some((c) => (champs as Record<string, unknown>)[c] !== undefined)) throw new ErreurMetier("Les prix viennent de la grille tarifaire en vigueur. Modifiez-les sur la page Tarifs.", 400);
  return transactionJournalisee(async (tx) => {
    if (champs.apporteurParDefautId) await verifierApporteur(tx, champs.apporteurParDefautId);
    const avant = await tx.crmParametresApport.findUnique({ where: { id: 1 } });
    const s1 = champs.seuil1Centimes ?? avant?.seuil1Centimes ?? 0, s2 = champs.seuil2Centimes ?? avant?.seuil2Centimes ?? Infinity;
    if (s1 > s2) throw new ErreurMetier("Le palier 1 doit rester sous le palier 2.", 400);
    await tx.crmParametresApport.upsert({ where: { id: 1 }, create: { id: 1, ...champs }, update: champs });
    await journaliser(tx, { type: "APPORTEURS_MODIFIES", auteurId, resume: "Réglages de l'apport d'affaires modifiés", apres: { champs: Object.keys(champs) } });
    return { modifie: true };
  });
}

/* ----------------------------- Factures ----------------------------- */

export async function agirSurFacture(d: z.output<typeof actionFacture>, auteurId: number) {
  const donnees = d.action === "emettre" ? await chargerApports() : null;
  return transactionJournalisee(async (tx) => {
    const apporteur = await tx.crmApporteur.findUnique({ where: { id: d.apporteurId } });
    if (!apporteur) throw new ErreurMetier("Apporteur inconnu.", 404);
    if (!apporteur.commissionne) throw new ErreurMetier("Cet apporteur n'est pas commissionné : aucune facture.", 409);
    const mois = dateDuMois(d.mois);
    await tx.crmFactureApport.upsert({ where: { apporteurId_mois: { apporteurId: d.apporteurId, mois } }, create: { apporteurId: d.apporteurId, mois }, update: {} });
    await tx.$queryRaw`SELECT id FROM "CrmFactureApport" WHERE "apporteurId" = ${d.apporteurId} AND mois = ${mois} FOR UPDATE`;
    const f = await tx.crmFactureApport.findUniqueOrThrow({ where: { apporteurId_mois: { apporteurId: d.apporteurId, mois } } });
    const figee = f.statut === "emise" || f.statut === "payee";
    let data: Prisma.CrmFactureApportUpdateInput, resume: string;
    switch (d.action) {
      case "emettre": {
        if (figee) throw new ErreurMetier("Cette facture est déjà émise.", 409);
        const m = creerMoteur(contexteDe(donnees!));
        if (d.mois >= donnees!.moisCourant) throw new ErreurMetier("Le mois n'est pas terminé : la facture s'émet à partir du 1er du mois suivant.", 409);
        const c = m.calculFacture(d.mois, d.apporteurId);
        if (c.commissionCentimes <= 0) throw new ErreurMetier("Aucune commission sur ce mois : rien à facturer.", 409);
        const premier = new Date(`${ajouterMois(d.mois, 1)}-01T00:00:00Z`);
        const emiseLe = d.emiseLe ?? f.emiseLe ?? (premier < aujourdhui() ? aujourdhui() : premier);
        const echeance = new Date(`${ajouterJours(jour(emiseLe)!, donnees!.parametres.delaiPaiementJours)}T00:00:00Z`);
        const { fige: _f, lignes, ...totaux } = c; void _f;
        data = { statut: "emise", numero: d.numero ?? f.numero ?? `${apporteur.prefixeFacture ?? ""}${d.mois}`, emiseLe, echeanceLe: echeance,
          fige: { ...totaux, lignes: lignes.map(({ part, ...l }) => { void part; return l; }) } as unknown as Prisma.InputJsonValue };
        resume = `Facture d'apporteur émise : ${d.mois}`;
        break;
      }
      case "payer":
        if (!figee) throw new ErreurMetier("Émettez la facture avant de la marquer payée.", 409);
        data = { statut: "payee", payeeLe: d.payeeLe ?? f.payeeLe ?? aujourdhui() };
        resume = `Facture d'apporteur payée : ${d.mois}`;
        break;
      case "rouvrir":
        data = { statut: "a_emettre", fige: Prisma.DbNull, payeeLe: null };
        resume = `Facture d'apporteur rouverte : ${d.mois}`;
        break;
      case "modifier":
        if (figee && (d.numero !== undefined || d.emiseLe !== undefined)) throw new ErreurMetier("Facture émise : rouvrez-la pour changer son numéro ou sa date.", 409);
        data = { ...(d.numero !== undefined ? { numero: d.numero } : {}), ...(d.emiseLe !== undefined ? { emiseLe: d.emiseLe } : {}),
          ...(d.payeeLe !== undefined ? { payeeLe: d.payeeLe, ...(d.payeeLe && figee ? { statut: "payee" } : {}) } : {}) };
        resume = `Facture d'apporteur modifiée : ${d.mois}`;
        break;
      case "encaissement": {
        if (figee) throw new ErreurMetier("Facture émise : ses montants sont figés.", 409);
        const encaissements = { ...(f.encaissements as Record<string, number> | null ?? {}) };
        if (d.centimes === null) delete encaissements[String(d.organisationId)]; else encaissements[String(d.organisationId)] = d.centimes;
        data = { encaissements };
        resume = `Encaissement saisi : ${d.mois}`;
        break;
      }
    }
    await tx.crmFactureApport.update({ where: { id: f.id }, data });
    await journaliser(tx, { type: "FACTURE_APPORT_CHANGEE", auteurId, resume, apres: { apporteurId: d.apporteurId, mois: d.mois, action: d.action } });
    return { factureId: f.id };
  });
}
