import type { Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { libelleCible } from "./libelles";
import { peutSupprimerCommentaire } from "./regles";

type Acteur = { id: number; role: string };

/** Le fil d'une fiche. Une requête pour les commentaires (le nombre de prévenus et la ligne de l'utilisateur viennent avec), une pour le total. */
const choix = (moi: number) => ({
  id: true, organisationId: true, texte: true, cible: true, departementCible: true, personneCibleId: true, creeLe: true, auteurId: true,
  auteur: { select: { name: true } },
  personneCible: { select: { name: true } },
  _count: { select: { destinataires: true } },
  destinataires: { where: { destinataireId: moi }, select: { luLe: true } },
}) satisfies Prisma.CrmCommentaireSelect;

type Lu = Prisma.CrmCommentaireGetPayload<{ select: ReturnType<typeof choix> }>;

/** Un commentaire prêt à afficher : dates en ISO, noms résolus, ce que l'utilisateur courant en fait. */
function enLigne(c: Lu, moi: Acteur) {
  const mienne = c.destinataires[0];
  return {
    id: c.id, organisationId: c.organisationId, texte: c.texte, creeLe: c.creeLe.toISOString(),
    auteurId: c.auteurId, auteur: c.auteur?.name ?? "Compte supprimé",
    cible: c.cible, departement: c.departementCible, personneId: c.personneCibleId,
    /** Qui est prévenu, en clair : « Personne », « Toute l'équipe », « Département Projet » ou le nom. */
    cibleLibelle: libelleCible(c.cible, c.departementCible, c.personneCible?.name ?? null),
    nombreDestinataires: c._count.destinataires,
    /** Pour l'utilisateur courant : a-t-il été prévenu, et l'a-t-il lu (null s'il n'a pas été prévenu). */
    pourMoi: mienne !== undefined,
    lu: mienne === undefined ? null : mienne.luLe !== null,
    peutSupprimer: peutSupprimerCommentaire(c.auteurId, moi),
  };
}
export type LigneCommentaire = ReturnType<typeof enLigne>;

export const TAILLE_PAGE_COMMENTAIRES = 30;

/** Le curseur de page : `creeLe~id` du dernier commentaire rendu, comme la chronologie. Ce n'est pas du texte saisi, il peut aller dans l'adresse. */
export function lireCurseurCommentaires(texte: string | null | undefined): { creeLe: Date; id: number } | null {
  if (!texte) return null;
  const [date, id] = texte.split("~");
  const creeLe = new Date(date ?? "");
  const n = Number(id);
  if (!date || Number.isNaN(creeLe.getTime()) || !Number.isInteger(n) || n <= 0) return null;
  return { creeLe, id: n };
}

/**
 * Le fil d'une fiche, du plus récent au plus ancien (l'identifiant départage
 * deux commentaires du même instant). `curseur` : ce qui vient après.
 * Sans requête par ligne : le nombre de prévenus et la ligne de l'utilisateur
 * courant viennent de la même lecture.
 */
export async function chargerFil(organisationId: number, moi: Acteur, curseur: { creeLe: Date; id: number } | null = null, limite = TAILLE_PAGE_COMMENTAIRES) {
  const [organisation, commentaires, total] = await Promise.all([
    prisma.crmOrganisation.findUnique({ where: { id: organisationId }, select: { id: true } }),
    prisma.crmCommentaire.findMany({
      where: { organisationId, ...(curseur ? { OR: [{ creeLe: { lt: curseur.creeLe } }, { creeLe: curseur.creeLe, id: { lt: curseur.id } }] } : {}) },
      select: choix(moi.id), orderBy: [{ creeLe: "desc" }, { id: "desc" }], take: limite + 1,
    }),
    prisma.crmCommentaire.count({ where: { organisationId } }),
  ]);
  if (!organisation) throw new ErreurMetier("Client inconnu.", 404);
  const page = commentaires.slice(0, limite);
  const dernier = page.at(-1);
  return {
    commentaires: page.map((c) => enLigne(c, moi)),
    total,
    suite: commentaires.length > limite,
    curseur: commentaires.length > limite && dernier ? `${dernier.creeLe.toISOString()}~${dernier.id}` : null,
  };
}

/** Une page du fil, telle que la fiche et `GET …/commentaires` la rendent. */
export type PageFil = Awaited<ReturnType<typeof chargerFil>>;

/** Un commentaire, pour la réponse à son écriture. */
export async function chargerCommentaire(id: number, moi: Acteur) {
  const c = await prisma.crmCommentaire.findUnique({ where: { id }, select: choix(moi.id) });
  return c ? enLigne(c, moi) : null;
}

export const MAXIMUM_NON_LUS = 50;

/**
 * Les commentaires qui vous préviennent et que vous n'avez pas lus : le bloc
 * « Pour vous » de la page Aujourd'hui, du plus récent au plus ancien. `total`
 * est le compte exact (la pastille), `commentaires` les `limite` plus récents.
 * Deux requêtes, sans requête par ligne.
 */
export async function commentairesNonLus(utilisateurId: number, limite = MAXIMUM_NON_LUS) {
  const where = { destinataireId: utilisateurId, luLe: null } satisfies Prisma.CrmDestinataireCommentaireWhereInput;
  const [lignes, total] = await Promise.all([
    prisma.crmDestinataireCommentaire.findMany({
      where, take: limite, orderBy: [{ commentaire: { creeLe: "desc" } }, { commentaireId: "desc" }],
      select: { commentaire: { select: {
        id: true, organisationId: true, texte: true, cible: true, departementCible: true, creeLe: true,
        auteur: { select: { name: true } }, organisation: { select: { raisonSocialeNom: true } },
      } } },
    }),
    prisma.crmDestinataireCommentaire.count({ where }),
  ]);
  return {
    total,
    commentaires: lignes.map(({ commentaire: c }) => ({
      id: c.id, organisationId: c.organisationId, organisationNom: c.organisation.raisonSocialeNom, texte: c.texte,
      creeLe: c.creeLe.toISOString(), auteur: c.auteur?.name ?? "Compte supprimé",
      cible: c.cible, cibleLibelle: libelleCible(c.cible, c.departementCible, null),
    })),
  };
}
export type CommentairesNonLus = Awaited<ReturnType<typeof commentairesNonLus>>;

/** Le nombre seul, pour la pastille de la coquille : une requête. */
export async function compterCommentairesNonLus(utilisateurId: number): Promise<number> {
  return prisma.crmDestinataireCommentaire.count({ where: { destinataireId: utilisateurId, luLe: null } });
}
