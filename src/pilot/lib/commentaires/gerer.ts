import type { z } from "zod";
import type { nouveauCommentaire } from "@/pilot/lib/validation/commentaire";
import { prisma } from "@/pilot/lib/prisma";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { calculerDestinataires } from "./destinataires";
import { lireEquipe } from "./equipe";
import { traduireErreurBase } from "./erreursBase";
import { RESUME_COMMENTAIRE_SUPPRIME, resumeCommentaireEcrit } from "./libelles";
import { MESSAGE_PAS_DESTINATAIRE, MESSAGE_SUPPRESSION_REFUSEE, peutSupprimerCommentaire } from "./regles";

import { lienFiche, notifier, prevenirLesCloches } from "@/pilot/lib/notifications";
type Acteur = { id: number; role: string };

/**
 * Écrit un commentaire sur une fiche. L'équipe est lue dans la transaction, au
 * moment de l'écriture : les destinataires sont ceux de cet instant, figés dans
 * `CrmDestinataireCommentaire` (le commentaire écrit, un compte qui change de
 * département ou perd son accès n'y change rien). Un refus (département vide,
 * personne à l'accès retiré, soi-même) n'écrit rien.
 *
 * Le journal porte la cible, le département ou la personne visée et le nombre
 * de destinataires, jamais le texte (C-22, C-27). Une erreur de la base est
 * traduite sans son message (`traduireErreurBase`), qui pourrait le recopier.
 */
export async function ecrireCommentaire(organisationId: number, p: z.output<typeof nouveauCommentaire>, acteur: Acteur) {
  try {
    return await transactionJournalisee(async (tx) => {
      const organisation = await tx.crmOrganisation.findUnique({ where: { id: organisationId }, select: { id: true, raisonSocialeNom: true } });
      if (!organisation) throw new ErreurMetier("Client inconnu.", 404);
      const resultat = calculerDestinataires(p.cible, acteur.id, await lireEquipe(tx));
      if (!resultat.ok) throw new ErreurMetier(resultat.message, resultat.statut);
      const departement = p.cible.cible === "DEPARTEMENT" ? p.cible.departement : null;
      const personneId = p.cible.cible === "PERSONNE" ? p.cible.personneId : null;
      const commentaire = await tx.crmCommentaire.create({
        data: { organisationId, auteurId: acteur.id, texte: p.texte, cible: p.cible.cible, departementCible: departement, personneCibleId: personneId },
        select: { id: true },
      });
      if (resultat.destinataires.length) {
        await tx.crmDestinataireCommentaire.createMany({ data: resultat.destinataires.map((destinataireId) => ({ commentaireId: commentaire.id, destinataireId })) });
        // La cloche commune : jamais le texte du commentaire, seulement où le lire.
        await notifier(tx, resultat.destinataires.map((userId) => ({ userId, type: "pilot.commentaire" as const, cle: `commentaire-${commentaire.id}`,
          lien: lienFiche(organisationId), message: `Un commentaire vous attend sur la fiche ${organisation.raisonSocialeNom}.` })));
      }
      await journaliser(tx, { type: "COMMENTAIRE_ECRIT", organisationId, auteurId: acteur.id,
        resume: resumeCommentaireEcrit(p.cible.cible, departement),
        apres: { commentaireId: commentaire.id, cible: p.cible.cible, ...(departement ? { departement } : {}), ...(personneId ? { personneId } : {}),
          destinataires: resultat.destinataires.length } });
      return { id: commentaire.id, destinataires: resultat.destinataires.length };
    }).then((r) => { if (r.destinataires) prevenirLesCloches(); return r; });
  } catch (erreur) {
    // Une erreur de la base peut recopier le texte : elle est traduite, jamais relancée telle quelle.
    throw traduireErreurBase(erreur);
  }
}

/**
 * Supprime un commentaire pour de bon, avec ses destinataires (cascade) : son
 * texte ne survit nulle part. Seul l'auteur le supprime, et un
 * super-administrateur. La suppression est conditionnelle : la garde est dans
 * le `where` lui-même (auteur, sauf super-administrateur), et 0 ligne dit 404
 * si le commentaire n'existe plus, 403 s'il existe sans être à vous (son
 * auteur a pu disparaître entre-temps). Le journal garde l'identifiant,
 * l'auteur, la cible et le nombre de personnes prévenues, jamais le texte.
 */
export async function supprimerCommentaire(id: number, acteur: Acteur) {
  const superAdmin = acteur.role === "SUPER_ADMIN";
  await transactionJournalisee(async (tx) => {
    const c = await tx.crmCommentaire.findUnique({
      where: { id },
      select: { auteurId: true, organisationId: true, cible: true, departementCible: true, personneCibleId: true, _count: { select: { destinataires: true } } },
    });
    if (!c) throw new ErreurMetier("Commentaire inconnu.", 404);
    if (!peutSupprimerCommentaire(c.auteurId, acteur)) throw new ErreurMetier(MESSAGE_SUPPRESSION_REFUSEE, 403);
    const { count } = await tx.crmCommentaire.deleteMany({ where: { id, ...(superAdmin ? {} : { auteurId: acteur.id }) } });
    if (count !== 1) {
      const encore = await tx.crmCommentaire.findUnique({ where: { id }, select: { id: true } });
      throw encore ? new ErreurMetier(MESSAGE_SUPPRESSION_REFUSEE, 403) : new ErreurMetier("Commentaire inconnu.", 404);
    }
    await journaliser(tx, { type: "COMMENTAIRE_SUPPRIME", organisationId: c.organisationId, auteurId: acteur.id,
      resume: RESUME_COMMENTAIRE_SUPPRIME,
      avant: { commentaireId: id, auteurId: c.auteurId, cible: c.cible,
        ...(c.departementCible ? { departement: c.departementCible } : {}), ...(c.personneCibleId ? { personneId: c.personneCibleId } : {}),
        destinataires: c._count.destinataires } });
  });
}

/**
 * Marque lu par l'utilisateur courant. Idempotent : relu, il garde sa première
 * date de lecture. Refusé (403) s'il n'a pas été prévenu par ce commentaire,
 * 404 si le commentaire n'existe pas. Pas de ligne de journal : lire n'est pas
 * une décision, et ce serait du bruit dans la chronologie.
 */
export async function marquerLu(id: number, acteur: Acteur): Promise<{ luLe: string }> {
  const ligne = await prisma.crmDestinataireCommentaire.findUnique({
    where: { commentaireId_destinataireId: { commentaireId: id, destinataireId: acteur.id } }, select: { luLe: true },
  });
  if (!ligne) {
    const existe = await prisma.crmCommentaire.findUnique({ where: { id }, select: { id: true } });
    throw existe ? new ErreurMetier(MESSAGE_PAS_DESTINATAIRE, 403) : new ErreurMetier("Commentaire inconnu.", 404);
  }
  if (ligne.luLe) return { luLe: ligne.luLe.toISOString() };
  const maintenant = new Date();
  // Conditionnelle : deux appels en même temps ne se disputent pas la date.
  await prisma.crmDestinataireCommentaire.updateMany({ where: { commentaireId: id, destinataireId: acteur.id, luLe: null }, data: { luLe: maintenant } });
  const apres = await prisma.crmDestinataireCommentaire.findUnique({
    where: { commentaireId_destinataireId: { commentaireId: id, destinataireId: acteur.id } }, select: { luLe: true },
  });
  // Le commentaire a pu être supprimé entre-temps.
  if (!apres) throw new ErreurMetier("Commentaire inconnu.", 404);
  return { luLe: (apres.luLe ?? maintenant).toISOString() };
}
