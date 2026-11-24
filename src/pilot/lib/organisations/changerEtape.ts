import type { CrmEtapeCommerciale, CrmOrganisation, CrmRaisonSortie, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assurerFormationPoc } from "@/pilot/lib/facturation/gerer";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { estClient, etapeAvantSortie, ETAPES_SORTIE, LIBELLES, PROBABILITE_PAR_ETAPE, transitionPermise } from "@/pilot/lib/pipeline";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { dansJours } from "@/pilot/lib/dates";
import { propositionEnAttente } from "@/pilot/lib/propositions/regles";
import { GAGNANT_SANS_MOTIF } from "@/pilot/lib/validation/organisation";
import { verrouillerConcurrentLie } from "@/pilot/lib/concurrents/lien";
import { forcagePossible } from "@/pilot/lib/concurrents/regles";
import { verrouillerOrganisation } from "./comptes";
import { ecrireConditionnellement, journaliserStatut } from "@/pilot/lib/contrats/commun";
import { datesNouveauCyclePoc, entreeCyclePoc, issueCloturePoc, refusDebutPoc } from "./poc";
import { cloreCyclePoc, cyclePocOuvert } from "./cyclesPoc";
import { debutDuJour } from "@/pilot/lib/dates";

export function verifierChangementEtape(
  depuis: CrmEtapeCommerciale, vers: CrmEtapeCommerciale, raisonSortie: string | undefined,
  raisonSortieCode: CrmRaisonSortie | undefined, reveilLe: Date | null | undefined, maintenant: Date,
  avantSortie: CrmEtapeCommerciale | null = null,
): ErreurMetier | null {
  if (depuis === vers && raisonSortie === undefined && raisonSortieCode === undefined && reveilLe === undefined) return null;
  if (!transitionPermise(depuis, vers, avantSortie)) {
    return new ErreurMetier(`Ce client ne peut pas passer de « ${LIBELLES[depuis]} » à « ${LIBELLES[vers]} ».`, 409);
  }
  if (ETAPES_SORTIE.includes(vers)) {
    if (!raisonSortie?.trim()) return new ErreurMetier("Une sortie demande une raison.", 400);
    if (!raisonSortieCode) return new ErreurMetier("Une sortie demande une raison et son motif.", 400);
    if (vers === "EN_SOMMEIL" && (!reveilLe || !Number.isFinite(reveilLe.getTime()) || reveilLe < dansJours(maintenant, 1))) {
      return new ErreurMetier("Une mise en pause demande une date de reprise.", 400);
    }
  }
  return null;
}

/**
 * Le concurrent gagnant ne va qu'avec une affaire perdue (Perdu) dont le motif
 * enregistré est « Concurrent ». `raisonSortieCode` est le motif effectif, déjà
 * complété par celui de l'organisation lors d'une correction.
 */
export function verifierGagnant(vers: CrmEtapeCommerciale, raisonSortieCode: CrmRaisonSortie | undefined, concurrentGagnantId: number | null | undefined): ErreurMetier | null {
  if (concurrentGagnantId == null) return null;
  return vers === "PERDU" && raisonSortieCode === "CONCURRENT" ? null : new ErreurMetier(GAGNANT_SANS_MOTIF, 400);
}

/**
 * Le concurrent gagnant que l'organisation porte une fois le changement fait.
 * Il ne survit qu'à une sortie en Perdu pour « Concurrent » : la reconquête, la
 * pause et tout autre motif l'effacent. Dans ce seul cas, `demande` absent
 * (`undefined`) conserve l'enregistré (`actuel`) et `null` l'efface.
 */
export function gagnantRetenu(
  vers: CrmEtapeCommerciale, raisonSortieCode: CrmRaisonSortie | undefined, demande: number | null | undefined, actuel: number | null,
): number | null {
  if (vers !== "PERDU" || raisonSortieCode !== "CONCURRENT") return null;
  return demande === undefined ? actuel : demande;
}

/**
 * Le forçage de température ne vit qu'avant la signature (lot R). Un dossier qui
 * arrive à une étape sans température (signé, en service, perdu, en pause...)
 * le perd dans la même écriture : une reconquête repart du calcul.
 */
export function forcageLibere(vers: CrmEtapeCommerciale, temperatureForcee: string | null | undefined): boolean {
  return temperatureForcee != null && !forcagePossible(vers);
}

/**
 * Le refus quand l'écriture conditionnelle ne trouve plus ce qu'elle a lu (C-26).
 * Vers une étape hors avant-signature, la condition porte aussi sur le forçage de
 * température : l'étape peut être restée la même, le message parle du dossier.
 */
export function messageConflitEtape(vers: CrmEtapeCommerciale): string {
  return forcagePossible(vers) ? "L'étape vient de changer. Rechargez la page." : "Le dossier vient de changer. Rechargez la page.";
}

/** L'étape d'où le dossier est sorti, lue dans son journal (C-86). Null hors sortie ou si le journal ne la dit pas. */
export async function lireEtapeAvantSortie(tx: Prisma.TransactionClient, organisationId: number, etape: CrmEtapeCommerciale): Promise<CrmEtapeCommerciale | null> {
  const changements = await tx.crmEvenement.findMany({
    where: { organisationId, type: "ETAPE_COMMERCIALE_CHANGEE" },
    orderBy: [{ surveneuLe: "desc" }, { id: "desc" }], take: 20, select: { avant: true, apres: true },
  });
  return etapeAvantSortie(etape, changements);
}

/** Un passage franchi pendant une conversion le dit dans le journal ; sans mention, rien ne change. */
export type MentionEtape = "conversion";
export function resumeChangementEtape(depuis: CrmEtapeCommerciale, vers: CrmEtapeCommerciale, mention?: MentionEtape): string {
  return `Étape : ${LIBELLES[depuis]} vers ${LIBELLES[vers]}${mention === "conversion" ? ", à la conversion" : ""}`;
}

type ChangementEtape = {
  organisationId: number; vers: CrmEtapeCommerciale; auteurId: number;
  pocDebuteLe?: Date;
  raisonSortie?: string; raisonSortieCode?: CrmRaisonSortie; reveilLe?: Date | null;
  /** Le concurrent qui a gagné l'affaire : seulement en Perdu avec le motif « Concurrent ». Absent : l'enregistré est conservé ; null : on l'efface. */
  concurrentGagnantId?: number | null;
  mention?: MentionEtape;
  /** Vers Perdu ou Contrat terminé : terminer aussi les contrats actifs, à la date du jour (C-86). */
  terminerContrats?: boolean;
};
/** Le refus quand une proposition attend la réponse du client : c'est son acceptation qui signe (C-39, C-71). */
export const PROPOSITION_EN_ATTENTE = "Une proposition attend une réponse. Acceptez-la depuis l'onglet Négociation.";

/**
 * La version qui attend la réponse du client (`propositionEnAttente`), lue en
 * une requête : les versions de l'organisation, statut et numéro seulement.
 * L'appelant tient le verrou de l'organisation, que prennent aussi les
 * changements de statut des propositions. La garde du passage manuel en Signé
 * et celle de la conversion la partagent.
 */
export async function lirePropositionEnAttente(tx: Prisma.TransactionClient, organisationId: number) {
  return propositionEnAttente(await tx.crmProposition.findMany({ where: { organisationId }, select: { version: true, statut: true } }));
}

/**
 * Le changement d'étape manuel : la route de l'étape et le glisser du tableau.
 * Un prospect ne passe pas en Signé à la main tant qu'une proposition attend
 * une réponse (`propositionEnAttente`) : on l'accepte, on ne la contourne pas. Un client
 * déjà signé qui revient d'un cran n'est pas concerné : ce n'est pas une
 * signature, et un avenant peut attendre sa réponse. Étape et propositions se
 * lisent sous le verrou de l'organisation, que prennent aussi les changements
 * de statut des propositions. Cette garde ne vit pas dans
 * `changerEtapeDansTransaction` : l'acceptation l'appelle pour passer en Signé.
 */
/**
 * Pas d'« En service » qui contredise les centres (C-92) : un dossier dont les
 * centres sont suivis dans Pilot passe en service quand l'un d'eux au moins est
 * déclaré en service, ce qui exige ses étapes bloquantes faites (`refusCochage`).
 * Un dossier sans centre suivi n'a pas de check-list : rien ne le contredit.
 */
export const EN_SERVICE_SANS_CENTRE = "Aucun centre de ce client n'est déclaré en service. Déclarez d'abord la mise en service d'un centre, dans Déploiement.";
export function refusEnService(suivis: number, declares: number): string | null {
  return suivis > 0 && declares === 0 ? EN_SERVICE_SANS_CENTRE : null;
}

export async function changerEtape(p: ChangementEtape): Promise<CrmOrganisation> {
  return transactionJournalisee(async (tx) => {
    if (p.vers === "EN_PRODUCTION") {
      await verrouillerOrganisation(tx, p.organisationId);
      const lue = await tx.crmOrganisation.findUnique({ where: { id: p.organisationId }, select: { etape: true } });
      // Inconnue : changerEtapeDansTransaction répond 404.
      if (lue && lue.etape !== "EN_PRODUCTION") {
        const [suivis, declares] = await Promise.all([
          tx.crmCentreProduit.count({ where: { centre: { organisationId: p.organisationId } } }),
          tx.crmEtapeIntegration.count({ where: { centre: { organisationId: p.organisationId }, cle: "PASSAGE_PRODUCTION", faite: true } }),
        ]);
        const refus = refusEnService(suivis, declares);
        if (refus) throw new ErreurMetier(refus, 409);
      }
    }
    if (p.vers === "SIGNE") {
      await verrouillerOrganisation(tx, p.organisationId);
      const { etape } = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: p.organisationId }, select: { etape: true } });
      // Un client signé, sorti puis repris, ne signe pas une seconde fois (C-86).
      const reprise = ETAPES_SORTIE.includes(etape) && await lireEtapeAvantSortie(tx, p.organisationId, etape) === "SIGNE";
      if (etape === "EN_POC") throw new ErreurMetier("Validez le POC avec « Convertir en client » sur la fiche. Le contrat sera créé dans le même geste.", 409);
      if (!estClient(etape) && !reprise && await lirePropositionEnAttente(tx, p.organisationId)) throw new ErreurMetier(PROPOSITION_EN_ATTENTE, 409);
    }
    return changerEtapeDansTransaction(tx, p);
  });
}
export async function changerEtapeDansTransaction(tx: Prisma.TransactionClient, p: ChangementEtape): Promise<CrmOrganisation> {
    // Tous les chemins qui peuvent suspendre, reprendre ou clore le cycle sont sérialisés.
    await verrouillerOrganisation(tx, p.organisationId);
    const organisation = await tx.crmOrganisation.findUnique({ where: { id: p.organisationId } });
    if (!organisation) throw new ErreurMetier("Organisation inconnue.", 404);
    const avantSortie = ETAPES_SORTIE.includes(organisation.etape) ? await lireEtapeAvantSortie(tx, organisation.id, organisation.etape) : null;
    const cycleOuvert = await cyclePocOuvert(tx, organisation);
    const entree = entreeCyclePoc(organisation.etape, p.vers, avantSortie, cycleOuvert);
    const refusPoc = refusDebutPoc(organisation, p.vers, entree, p.pocDebuteLe);
    if (refusPoc) throw new ErreurMetier(refusPoc, 400);
    const maintenant = new Date();
    const memeEtape = organisation.etape === p.vers;
    if (memeEtape && entree !== "NOUVEAU" && p.raisonSortie === undefined && p.raisonSortieCode === undefined && p.reveilLe === undefined && p.concurrentGagnantId === undefined) return organisation;
    // Une correction partielle conserve les champs de sortie non transmis.
    const raisonSortie = p.raisonSortie ?? (memeEtape ? organisation.raisonSortie ?? undefined : undefined);
    const raisonSortieCode = p.raisonSortieCode ?? (memeEtape ? organisation.raisonSortieCode ?? undefined : undefined);
    const reveilLe = p.reveilLe === undefined && memeEtape ? organisation.reveilLe : p.reveilLe;
    const erreur = verifierChangementEtape(organisation.etape, p.vers, raisonSortie, raisonSortieCode, reveilLe, maintenant, avantSortie);
    if (erreur) throw erreur;
    if (p.vers === "EN_POC" && await tx.crmContrat.count({ where: { organisationId: p.organisationId, statut: "ACTIF" } })) {
      throw new ErreurMetier("Ce dossier a un contrat actif. Le POC se déroule avant la signature. Suivez l'essai du contrat dans Ventes.", 409);
    }
    const erreurGagnant = verifierGagnant(p.vers, raisonSortieCode, p.concurrentGagnantId);
    if (erreurGagnant) throw erreurGagnant;
    const sortie = ETAPES_SORTIE.includes(p.vers);
    const champsSortie = {
      raisonSortie: sortie ? raisonSortie!.trim() : null,
      raisonSortieCode: sortie ? raisonSortieCode! : null,
      reveilLe: p.vers === "EN_SOMMEIL" ? reveilLe! : null,
    };
    const concurrentGagnantId = gagnantRetenu(p.vers, raisonSortieCode, p.concurrentGagnantId, organisation.concurrentGagnantId);
    if (concurrentGagnantId != null && concurrentGagnantId !== organisation.concurrentGagnantId) await verrouillerConcurrentLie(tx, concurrentGagnantId);
    const diff = champsChanges(organisation, { ...champsSortie, concurrentGagnantId }, ["raisonSortie", "raisonSortieCode", "reveilLe", "concurrentGagnantId"]);
    if (memeEtape && entree !== "NOUVEAU" && !Object.keys(diff.apres).length) return organisation;
    const nouveauCycle: { pocCycleId?: string; pocDebuteLe?: Date; pocProlongeLe?: null } = entree === "NOUVEAU" ? { ...datesNouveauCyclePoc(p.pocDebuteLe!), pocCycleId: randomUUID() } : {};
    const issue = issueCloturePoc(cycleOuvert, p.vers);
    // Hors avant-signature, le forçage s'efface ; la condition porte alors aussi sur
    // sa date lue, pour qu'un forçage posé entre-temps ne survive pas en silence.
    const horsAvantSignature = !forcagePossible(p.vers);
    const libere = forcageLibere(p.vers, organisation.temperatureForcee);
    const ecrites = await tx.crmOrganisation.updateMany({
      // La condition porte sur les seuls champs lus et vérifiés : deux corrections
      // concurrentes se départagent, sans qu'une écriture sans rapport (prochaine
      // action, identité) ne fasse échouer un changement d'étape légitime.
      where: {
        id: p.organisationId, etape: organisation.etape, raisonSortie: organisation.raisonSortie,
        pocCycleId: organisation.pocCycleId,
        raisonSortieCode: organisation.raisonSortieCode, reveilLe: organisation.reveilLe, concurrentGagnantId: organisation.concurrentGagnantId,
        ...(horsAvantSignature ? { temperatureForceeLe: organisation.temperatureForceeLe } : {}),
      },
      data: { ...nouveauCycle, ...champsSortie, concurrentGagnantId, ...(memeEtape ? {} : { etape: p.vers, etapeDepuisLe: maintenant, dateSortie: sortie ? maintenant : null }),
        ...(libere ? { temperatureForcee: null, temperatureForceeParId: null, temperatureForceeLe: null } : {}) },
    });
    if (!ecrites.count) throw new ErreurMetier(messageConflitEtape(p.vers), 409);
    if (nouveauCycle.pocCycleId) await assurerFormationPoc(tx, organisation.id,
      { id: nouveauCycle.pocCycleId, debuteLe: nouveauCycle.pocDebuteLe!, prolongeLe: null }, p.auteurId);
    if (issue) await cloreCyclePoc(tx, organisation, issue, maintenant, p.auteurId);
    if (entree === "NOUVEAU") await journaliser(tx, {
      type: "CYCLE_POC_OUVERT", organisationId: organisation.id, auteurId: p.auteurId,
      resume: "Cycle de POC ouvert", apres: nouveauCycle, surveneuLe: maintenant,
    });
    if (libere) {
      await journaliser(tx, { type: "TEMPERATURE_LIBEREE", organisationId: p.organisationId, auteurId: p.auteurId,
        resume: "Température libérée", avant: { temperatureForcee: organisation.temperatureForcee }, apres: { temperatureForcee: null } });
    }
    const modifiee = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: p.organisationId } });
    if (memeEtape) {
      await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId: p.organisationId, auteurId: p.auteurId,
        resume: "Sortie corrigée", avant: { champs: Object.keys(diff.avant) }, apres: { champs: Object.keys(diff.apres) } });
    } else {
      const opportunites = await tx.crmOpportunite.updateMany({
        where: { organisationId: p.organisationId, gagneeLe: null, perdueLe: null, probabiliteForcee: false },
        data: { probabilite: PROBABILITE_PAR_ETAPE[p.vers] },
      });
      await journaliser(tx, {
        type: "ETAPE_COMMERCIALE_CHANGEE", organisationId: p.organisationId, auteurId: p.auteurId,
        resume: resumeChangementEtape(organisation.etape, p.vers, p.mention),
        avant: { etape: organisation.etape, raisonSortieCode: organisation.raisonSortieCode, reveilLe: organisation.reveilLe,
          ...(organisation.concurrentGagnantId != null || concurrentGagnantId != null ? { concurrentGagnantId: organisation.concurrentGagnantId } : {}) },
        apres: { etape: modifiee.etape, raisonSortieCode: modifiee.raisonSortieCode, reveilLe: modifiee.reveilLe, pocDebuteLe: modifiee.pocDebuteLe, ...(organisation.concurrentGagnantId != null || concurrentGagnantId != null ? { concurrentGagnantId } : {}), opportunitesRecalculees: opportunites.count, ...(p.mention === "conversion" ? { conversion: true } : {}) },
      });
    }
    if (!memeEtape && p.terminerContrats && (p.vers === "PERDU" || p.vers === "ARRETE")) {
      const aujourdHui = debutDuJour(maintenant);
      for (const c of await tx.crmContrat.findMany({ where: { organisationId: p.organisationId, statut: "ACTIF" } })) {
        // Une signature datée d'après aujourd'hui ne se termine pas avant d'avoir commencé : le contrat reste, l'onglet Argent le dit.
        if (c.signeLe && debutDuJour(c.signeLe) > aujourdHui) continue;
        await ecrireConditionnellement(tx, c, { statut: "TERMINE", termineLe: aujourdHui });
        await journaliserStatut(tx, c, "TERMINE", p.auteurId);
      }
    }
    return modifiee;
}
