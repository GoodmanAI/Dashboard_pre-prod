import type { CrmTemperature, Prisma } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { forcagePossible, MESSAGE_FORCAGE_IMPOSSIBLE } from "@/pilot/lib/concurrents/regles";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "./comptes";
import { temperature } from "./temperature";

/**
 * Le forçage humain de la température d'un dossier (lot R), sur le modèle de
 * `probabiliteForcee` (C-44). La température calculée n'est jamais stockée
 * (C-08) : seul le choix de la personne l'est, avec son auteur et sa date.
 *
 * Concurrence (C-26) : l'écran dit ce qu'il a lu, la date du forçage ou
 * « aucun ». Le calcul de la fiche change à chaque échange saisi : la garde ne
 * peut pas être `majLe`, qu'une écriture sans rapport ferait échouer. Les
 * événements ne portent que des codes (aucun texte libre).
 */

const conflit = () => new ErreurMetier("La température de ce dossier vient de changer. Rechargez la page.", 409);
const instant = (date: Date | null) => (date ? +date : null);

export type ForcageTemperature = { temperatureForcee: CrmTemperature | null; temperatureForceeLe: Date | null; temperatureForceeParId: number | null };
const lecture = (o: ForcageTemperature): ForcageTemperature => ({
  temperatureForcee: o.temperatureForcee, temperatureForceeLe: o.temperatureForceeLe, temperatureForceeParId: o.temperatureForceeParId,
});
const CHAMPS = { temperatureForcee: true, temperatureForceeLe: true, temperatureForceeParId: true, etape: true } as const;
/** Ce que le barème lit, comme le tableau Prospects : la fiche, le rôle des contacts, le RIS et les salles des centres. */
const CHAMPS_BAREME = {
  ...CHAMPS, nombreSalles: true, nombreIrm: true, nombreScanners: true, nombreRadio: true, nombreEcho: true, nombreMammo: true, ris: true,
  qualifBudget: true, qualifBesoin: true, decisionAttendueLe: true,
  contacts: { select: { roleDecision: true } }, centres: { select: { ris: true, _count: { select: { salles: true } } } },
} as const;

/** Retire le forçage lu, sous condition de sa date, et le journalise. Partagé par le retrait et par un forçage au niveau du calcul. */
async function ecrireLiberation(tx: Prisma.TransactionClient, organisationId: number, o: ForcageTemperature, auteurId: number) {
  const ecrites = await tx.crmOrganisation.updateMany({
    where: { id: organisationId, temperatureForceeLe: o.temperatureForceeLe },
    data: { temperatureForcee: null, temperatureForceeParId: null, temperatureForceeLe: null },
  });
  if (!ecrites.count) throw conflit();
  await journaliser(tx, { type: "TEMPERATURE_LIBEREE", organisationId, auteurId, resume: "Température libérée",
    avant: { temperatureForcee: o.temperatureForcee }, apres: { temperatureForcee: null } });
  return { temperatureForcee: null, temperatureForceeLe: null, temperatureForceeParId: null, modifie: true };
}

/**
 * Pose ou change le forçage. Seulement avant signature ; la même température rejouée ne change rien.
 * Un forçage en place qu'on ramène au niveau du calcul est retiré (`TEMPERATURE_LIBEREE`), comme par le retrait.
 */
export async function forcerTemperature(organisationId: number, p: { temperature: CrmTemperature; forceeLe: Date | null }, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, organisationId);
    const o = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: organisationId }, select: CHAMPS_BAREME });
    if (!forcagePossible(o.etape)) throw new ErreurMetier(MESSAGE_FORCAGE_IMPOSSIBLE, 409);
    if (instant(o.temperatureForceeLe) !== instant(p.forceeLe)) throw conflit();
    if (o.temperatureForcee === p.temperature) return { ...lecture(o), modifie: false };
    const maintenant = new Date();
    // Avec un forçage en place, demander le niveau du calcul revient au calcul (C-74) : un forçage qui ne
    // suivrait plus le barème ne se fige pas. La règle tient côté serveur, quel que soit l'écran qui écrit.
    if (o.temperatureForcee !== null) {
      const calculee = temperature({ ...o, centres: o.centres.map((c) => ({ ris: c.ris, salles: c._count.salles })) }, maintenant).calculee;
      if (calculee === p.temperature) return ecrireLiberation(tx, organisationId, o, auteurId);
    }
    const ecrites = await tx.crmOrganisation.updateMany({
      // L'étape lue en condition : un dossier passé hors avant-signature entre-temps ne reçoit pas de forçage.
      where: { id: organisationId, etape: o.etape, temperatureForceeLe: o.temperatureForceeLe },
      data: { temperatureForcee: p.temperature, temperatureForceeParId: auteurId, temperatureForceeLe: maintenant },
    });
    if (!ecrites.count) throw conflit();
    await journaliser(tx, { type: "TEMPERATURE_FORCEE", organisationId, auteurId, resume: "Température forcée",
      avant: { temperatureForcee: o.temperatureForcee }, apres: { temperatureForcee: p.temperature } });
    return { temperatureForcee: p.temperature, temperatureForceeLe: maintenant, temperatureForceeParId: auteurId, modifie: true };
  });
}

/**
 * Retire le forçage : le dossier reprend sa température calculée. Permis à
 * toute étape : un forçage resté après la signature se retire. Sans forçage,
 * rien à faire, rien n'est journalisé. `forceeLe` absent : on retire ce qui est là.
 */
export async function libererTemperature(organisationId: number, p: { forceeLe?: Date | null }, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, organisationId);
    const o = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: organisationId }, select: CHAMPS });
    if (p.forceeLe !== undefined && instant(o.temperatureForceeLe) !== instant(p.forceeLe)) throw conflit();
    if (!o.temperatureForcee) return { ...lecture(o), modifie: false };
    return ecrireLiberation(tx, organisationId, o, auteurId);
  });
}
