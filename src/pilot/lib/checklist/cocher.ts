import { cochableALaMain, definitionEtape } from "@/pilot/lib/checklist/definition";
import { Prisma, type CrmCleEtape, type CrmEtapeIntegration } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { ATTENTE_VIDE, champsAttente } from "./reglesAttentes";
import { evaluerSansEchouer } from "./evaluer";
import { periodeSuiviRenforce, enSuiviRenforce } from "@/pilot/lib/integration/suiviRenforce";
import { synchroniserStatutsDashboard } from "@/pilot/lib/centres/statutDashboard";
import { refusCochage } from "./gardes";

const dateCourte = (date: Date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const SANS_SUIVI = { miseEnProductionLe: null, suiviRenforceJusquAu: null };

/**
 * La garde serveur précède toute lecture : une étape automatique ne peut
 * jamais avoir deux vérités, même en appelant directement le service.
 */
export class EtapeAutomatiqueError extends ErreurMetier {
  constructor(cle: CrmCleEtape) {
    super(
      `L'étape ${cle} est automatique : elle se coche depuis le registre de complétude, jamais à la main.`,
      409,
    );
    this.name = "EtapeAutomatiqueError";
  }
}

const CASE_CONCURRENTE = "La case vient d'être modifiée par quelqu'un d'autre. Rechargez la page.";

/**
 * Deux cochages simultanés liraient le même état et journaliseraient deux fois
 * le même fait. La condition sur `faite` lu fait échouer le second en 409.
 */
async function mettreAJourSiInchangee(
  tx: Prisma.TransactionClient,
  lue: CrmEtapeIntegration,
  data: Prisma.CrmEtapeIntegrationUncheckedUpdateManyInput,
) {
  const ecrites = await tx.crmEtapeIntegration.updateMany({
    where: { id: lue.id, faite: lue.faite, mode: { in: ["MANUEL", "MIXTE"] }, ...champsAttente(lue) }, data,
  });
  if (ecrites.count === 0) throw new ErreurMetier(CASE_CONCURRENTE, 409);
  return tx.crmEtapeIntegration.findUniqueOrThrow({ where: { id: lue.id } });
}

/** Même course à la création : la contrainte d'unicité tranche, en 409. */
async function creerSansDoublon(tx: Prisma.TransactionClient, data: Prisma.CrmEtapeIntegrationUncheckedCreateInput) {
  try {
    return await tx.crmEtapeIntegration.create({ data });
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
      throw new ErreurMetier(CASE_CONCURRENTE, 409);
    }
    throw erreur;
  }
}

export async function cocherEtape(params: {
  centreId: number;
  productId: number;
  cle: CrmCleEtape;
  faite: boolean;
  auteurId: number;
  commentaire?: string | null;
  /** Réservé au seed, comme `surveneuLe` du journal : la route ne le transmet jamais. */
  maintenant?: Date;
  /**
   * Réservé au seed et à la mesure, comme `maintenant` : reconstitue un centre mis
   * en service avant la garde C-92, avec des étapes bloquantes ouvertes (« en
   * service, étapes à finir »). La route ne le transmet jamais : son schéma ne le connaît pas, zod le retire.
   */
  sansGardes?: boolean;
}) {
  const { centreId, productId, cle, faite, auteurId, commentaire } = params;
  const instant = params.maintenant ?? new Date();
  if (!cochableALaMain(cle)) throw new EtapeAutomatiqueError(cle);

  const resultat = await transactionJournalisee(async (tx) => {
    const rattachement = await tx.crmCentreProduit.findUnique({
      where: { centreId_productId: { centreId, productId } },
      select: {
        id: true, miseEnProductionLe: true, suiviRenforceJusquAu: true, datePromise: true,
        centre: { select: { organisationId: true, nom: true } },
        product: { select: { name: true } },
      },
    });
    if (!rattachement) {
      throw new ErreurMetier("Ce centre n'a pas ce produit.", 404);
    }
    const existante = await tx.crmEtapeIntegration.findUnique({
      where: { centreId_productId_cle: { centreId, productId, cle } },
    });
    const def = definitionEtape(cle, rattachement.product.name);
    if (existante?.mode === "AUTOMATIQUE") throw new EtapeAutomatiqueError(cle);
    const change = (existante?.faite ?? false) !== faite;
    // Gardes du lot V (C-85) : l'ordre du déploiement se tient côté serveur.
    if (change && faite && !params.sansGardes) {
      const cases = await tx.crmEtapeIntegration.findMany({ where: { centreId, productId }, select: { cle: true, faite: true } });
      const refus = refusCochage({ cle, produit: rattachement.product.name, cases,
        datePromise: rattachement.datePromise });
      if (refus) throw new ErreurMetier(refus, 409);
    }
    // Un commentaire seul ne déplace ni la date ni l'auteur du fait réalisé.
    const faiteLe = change ? (faite ? instant : null) : (existante?.faiteLe ?? null);
    const etape = existante
      ? await mettreAJourSiInchangee(tx, existante, {
          faite,
          faiteLe,
          ...(change ? { auteurId } : {}),
          commentaire: commentaire ?? undefined,
          ...(faite ? ATTENTE_VIDE : {}),
        })
      : await creerSansDoublon(tx, {
          centreId, productId, cle, mode: def.mode, faite, faiteLe, auteurId, commentaire: commentaire ?? null,
        });
    // Le passage en production ouvre le suivi renforcé (§8.7) dans la même
    // transaction, et sa levée le referme. L'évaluateur ne touche jamais ces champs.
    const suivi = change && cle === "PASSAGE_PRODUCTION" ? {
      avant: { miseEnProductionLe: rattachement.miseEnProductionLe, suiviRenforceJusquAu: rattachement.suiviRenforceJusquAu },
      apres: faite ? periodeSuiviRenforce(instant) : SANS_SUIVI,
    } : null;
    if (suivi) await tx.crmCentreProduit.update({ where: { id: rattachement.id }, data: suivi.apres });
    // Pilot fait foi pour le statut du centre au Dashboard (27/11/2026) : la case le pose.
    if (suivi) await synchroniserStatutsDashboard(tx, { centreProduitIds: [rattachement.id] }, auteurId);
    // Un commentaire seul n'est pas un cochage : le texte reste sur la case,
    // aucun fait ne change et aucun événement de cochage n'est inventé.
    if (change) {
      const commentaireModifie = (existante?.commentaire ?? null) !== etape.commentaire;
      const finSuivi = suivi?.apres.suiviRenforceJusquAu
        ? ` · suivi renforcé jusqu'au ${dateCourte(suivi.apres.suiviRenforceJusquAu)}`
        : suivi && enSuiviRenforce(suivi.avant.suiviRenforceJusquAu, instant) ? " · suivi renforcé arrêté" : "";
      await journaliser(tx, {
        type: faite ? "ETAPE_INTEGRATION_COCHEE" : "ETAPE_INTEGRATION_DECOCHEE",
        organisationId: rattachement.centre.organisationId,
        centreId,
        centreProduitId: rattachement.id,
        etapeIntegrationId: etape.id,
        auteurId,
        resume: `${faite ? "Coché" : "Décoché"} : ${def.libelle} · ${rattachement.centre.nom} · ${rattachement.product.name}${finSuivi}`,
        avant: { faite: existante?.faite ?? false, faiteLe: existante?.faiteLe ?? null, ...suivi?.avant },
        apres: { faite, faiteLe, ...(commentaireModifie ? { commentaireModifie: true } : {}), ...suivi?.apres },
        surveneuLe: params.maintenant,
      });
    }
    if (faite && existante?.enAttenteDe) {
      await journaliser(tx, { type: "ATTENTE_TIERS_CHANGEE", auteurId,
        organisationId: rattachement.centre.organisationId, centreId, centreProduitId: rattachement.id, etapeIntegrationId: etape.id,
        resume: `Attente levée : ${def.libelle} · ${rattachement.centre.nom}`,
        avant: champsAttente(existante), apres: ATTENTE_VIDE, surveneuLe: params.maintenant });
    }
    return { etape, centreProduitId: rattachement.id };
  });
  await evaluerSansEchouer(resultat.centreProduitId);
  return resultat.etape;
}
