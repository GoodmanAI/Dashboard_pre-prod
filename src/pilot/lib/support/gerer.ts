import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { changementStatut, nouveauMessage, nouveauSujet } from "@/pilot/lib/validation/support";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { prisma } from "@/pilot/lib/prisma";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { notifier, prevenirLesCloches } from "@/pilot/lib/notifications";
import { lireEquipe } from "@/pilot/lib/commentaires/equipe";
import { envoyerMailSupport, type EvenementMail } from "./mails";
import {
  LIBELLES_STATUT, destinatairesSupport, lienSujet, refusChangementStatut, relanceDue, statutApresMessage, statutInitial, tousLesDestinataires,
  type Destinataires, type StatutSujet,
} from "./regles";

/**
 * Les écritures du support (25/11/2026). Chacune, dans sa transaction : la ligne, le
 * journal du client, la cloche des destinataires. Après le commit : le mail. La cloche
 * ne porte que le client et la nature du geste, jamais le texte (C-22) ; le mail, lui,
 * porte le texte, c'est son rôle.
 */
type Acteur = { id: number; name: string | null };
type Tx = Prisma.TransactionClient;

const CONCURRENCE = "Ce sujet vient de changer. Rechargez la page.";

async function destinatairesDe(tx: Tx, organisationId: number, auteurId: number | null): Promise<Destinataires> {
  const [organisation, equipe] = await Promise.all([
    tx.crmOrganisation.findUniqueOrThrow({ where: { id: organisationId }, select: { responsableId: true } }),
    lireEquipe(tx),
  ]);
  return destinatairesSupport({ responsableId: organisation.responsableId, equipe: equipe.map((m) => ({ id: m.id, actif: !m.accesRetire })), auteurId });
}

async function cloche(tx: Tx, d: Destinataires, sujetId: number, cle: string, message: string) {
  await notifier(tx, tousLesDestinataires(d).map((userId) => ({ userId, type: "pilot.support" as const, message, lien: lienSujet(sujetId), cle: `${cle}-${userId}` })));
}

async function apresCommit(e: EvenementMail) {
  prevenirLesCloches();
  await envoyerMailSupport(e);
}

const nomDe = (a: Acteur) => a.name ?? "Quelqu'un de l'équipe";

/** Ouvre un sujet sur un client, avec son premier message. */
export async function creerSujet(d: z.output<typeof nouveauSujet>, acteur: Acteur) {
  const aDire = Boolean(d.aDireAuClient);
  const { sujet, messageId, destinataires } = await transactionJournalisee(async (tx) => {
    const organisation = await tx.crmOrganisation.findUnique({ where: { id: d.organisationId }, select: { id: true, raisonSocialeNom: true } });
    if (!organisation) throw new ErreurMetier("Client inconnu.", 404);
    const statut = statutInitial(aDire);
    const sujet = await tx.crmSujetSupport.create({ data: { organisationId: organisation.id, titre: d.titre, statut, auteurId: acteur.id } });
    const message = await tx.crmMessageSupport.create({ data: { sujetId: sujet.id, auteurId: acteur.id, noteInterne: d.noteInterne ?? null, aDireAuClient: d.aDireAuClient ?? null } });
    await journaliser(tx, { type: "SUPPORT_SUJET_CREE", organisationId: organisation.id, auteurId: acteur.id,
      resume: `Sujet de support ouvert : ${d.titre}`, apres: { sujetId: sujet.id, statut } });
    const destinataires = await destinatairesDe(tx, organisation.id, acteur.id);
    await cloche(tx, destinataires, sujet.id, `support-message-${message.id}`,
      `${nomDe(acteur)} a ouvert un sujet de support pour ${organisation.raisonSocialeNom}${aDire ? ", avec un texte à transmettre" : ""}.`);
    return { sujet, messageId: message.id, destinataires };
  });
  await apresCommit({ genre: "sujet", sujetId: sujet.id, messageId, auteurId: acteur.id, destinataires });
  return sujet;
}

/** Répond dans un sujet. Un texte pour le client le remet à transmettre ; une note rouvre un sujet résolu. */
export async function ajouterMessage(sujetId: number, d: z.output<typeof nouveauMessage>, acteur: Acteur) {
  const aDire = Boolean(d.aDireAuClient);
  const { messageId, destinataires } = await transactionJournalisee(async (tx) => {
    const sujet = await tx.crmSujetSupport.findUnique({ where: { id: sujetId }, select: { id: true, statut: true, organisationId: true, organisation: { select: { raisonSocialeNom: true } } } });
    if (!sujet) throw new ErreurMetier("Sujet inconnu.", 404);
    const message = await tx.crmMessageSupport.create({ data: { sujetId, auteurId: acteur.id, noteInterne: d.noteInterne ?? null, aDireAuClient: d.aDireAuClient ?? null } });
    const statut = statutApresMessage(sujet.statut, aDire);
    // `majLe` bouge à chaque message : la liste se trie sur la dernière activité.
    await tx.crmSujetSupport.update({ where: { id: sujetId }, data: statut === sujet.statut ? { majLe: new Date() } : { statut, statutDepuisLe: new Date(), derniereRelanceLe: null } });
    await journaliser(tx, { type: "SUPPORT_MESSAGE_AJOUTE", organisationId: sujet.organisationId, auteurId: acteur.id,
      resume: aDire ? "Support : texte à transmettre au client" : "Support : note pour l'équipe",
      avant: { sujetId, statut: sujet.statut }, apres: { sujetId, messageId: message.id, statut } });
    const destinataires = await destinatairesDe(tx, sujet.organisationId, acteur.id);
    await cloche(tx, destinataires, sujetId, `support-message-${message.id}`,
      `${nomDe(acteur)} a écrit sur un sujet de support de ${sujet.organisation.raisonSocialeNom}${aDire ? " : un texte à transmettre au client" : ""}.`);
    return { messageId: message.id, destinataires };
  });
  await apresCommit({ genre: "message", sujetId, messageId, auteurId: acteur.id, destinataires });
  return { messageId };
}

/** Transmis au client, résolu, rouvert. Écriture conditionnelle sur la version lue (C-26). */
export async function changerStatutSujet(sujetId: number, d: z.output<typeof changementStatut>, acteur: Acteur) {
  const vers = d.statut as StatutSujet;
  const destinataires = await transactionJournalisee(async (tx) => {
    const sujet = await tx.crmSujetSupport.findUnique({ where: { id: sujetId }, select: { statut: true, majLe: true, organisationId: true, organisation: { select: { raisonSocialeNom: true } } } });
    if (!sujet) throw new ErreurMetier("Sujet inconnu.", 404);
    if (sujet.majLe.toISOString() !== d.majLe) throw new ErreurMetier(CONCURRENCE, 409);
    const refus = refusChangementStatut(sujet.statut, vers);
    if (refus) throw new ErreurMetier(refus, 409);
    const { count } = await tx.crmSujetSupport.updateMany({ where: { id: sujetId, majLe: sujet.majLe }, data: { statut: vers, statutDepuisLe: new Date(), derniereRelanceLe: null } });
    if (count !== 1) throw new ErreurMetier(CONCURRENCE, 409);
    await journaliser(tx, { type: "SUPPORT_STATUT_CHANGE", organisationId: sujet.organisationId, auteurId: acteur.id,
      resume: `Support : ${LIBELLES_STATUT[vers]}`, avant: { sujetId, statut: sujet.statut }, apres: { sujetId, statut: vers } });
    const destinataires = await destinatairesDe(tx, sujet.organisationId, acteur.id);
    await cloche(tx, destinataires, sujetId, `support-statut-${sujetId}-${Date.now()}`,
      `${nomDe(acteur)} a passé un sujet de support de ${sujet.organisation.raisonSocialeNom} en « ${LIBELLES_STATUT[vers]} ».`);
    return destinataires;
  });
  await apresCommit({ genre: "statut", sujetId, auteurId: acteur.id, vers, destinataires });
}

/**
 * Relance les sujets restés à transmettre un jour ouvré (script horaire, 25/11/2026).
 * Chaque relance est posée en base avant le mail : un script relancé dans l'heure ne
 * relance pas deux fois. Rend le nombre de sujets relancés.
 */
export async function relancerSujets(maintenant: Date = new Date(), essai = false): Promise<number> {
  const candidats = await prisma.crmSujetSupport.findMany({ where: { statut: "A_TRANSMETTRE" }, select: { id: true, statut: true, statutDepuisLe: true, derniereRelanceLe: true } });
  let relances = 0;
  for (const c of candidats.filter((s) => relanceDue(s, maintenant))) {
    if (essai) { relances++; continue; }
    const destinataires = await transactionJournalisee(async (tx) => {
      const { count } = await tx.crmSujetSupport.updateMany({
        where: { id: c.id, statut: "A_TRANSMETTRE", derniereRelanceLe: c.derniereRelanceLe }, data: { derniereRelanceLe: maintenant },
      });
      if (count !== 1) return null;
      const sujet = await tx.crmSujetSupport.findUniqueOrThrow({ where: { id: c.id }, select: { organisationId: true, organisation: { select: { raisonSocialeNom: true } } } });
      await journaliser(tx, { type: "SUPPORT_RELANCE", organisationId: sujet.organisationId, auteurId: null,
        resume: "Support : rappel, texte toujours à transmettre", apres: { sujetId: c.id } });
      const destinataires = await destinatairesDe(tx, sujet.organisationId, null);
      await cloche(tx, destinataires, c.id, `support-relance-${c.id}-${maintenant.toISOString().slice(0, 13)}`,
        `Rappel : un texte attend d'être transmis à ${sujet.organisation.raisonSocialeNom}.`);
      return destinataires;
    });
    if (!destinataires) continue;
    relances++;
    await apresCommit({ genre: "relance", sujetId: c.id, destinataires, depuis: c.statutDepuisLe });
  }
  return relances;
}
