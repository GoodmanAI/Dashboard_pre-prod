import { prisma } from "@/lib/prisma";

/**
 * Groupes de centres qui se voient entre eux.
 * -----------------------------------------------------------------------------
 * Certains clients exploitent plusieurs centres sous des comptes distincts, sans
 * relation `managerId` en base : chaque centre doit pouvoir basculer sur les
 * autres depuis le sélecteur du header, et lire leurs données.
 *
 * Ce fichier est la SEULE déclaration de ces groupes. Elle vivait auparavant en
 * deux exemplaires, `SPECIAL_CENTRE_PAIRS` dans `auth-helpers.ts` et une chaîne
 * de `if (data.id == 7 || data.id == 8)` dans `CentreContext.tsx`. Les deux ne
 * savaient exprimer que des PAIRES, ce qui suffisait à Montchanin / Le Creusot
 * mais pas au groupe Quimper, qui compte trois centres.
 *
 * À terme cela doit vivre en base (une table `GroupeCentre`, ou `managerId`).
 * En attendant, une seule liste, et les deux consommateurs la lisent.
 *
 * ── Deux façons de désigner un centre, et pourquoi ────────────────────────────
 * `userIds` désigne des `User.id`, `userProductIds` des `UserProduct.id`. Les
 * deux sont acceptés parce que les groupes historiques ont été écrits en
 * `User.id` et qu'on ne les réécrit pas à l'aveugle : se tromper couperait
 * l'accès croisé d'un client qui fonctionne aujourd'hui. Les nouveaux groupes
 * sont déclarés en `userProductId`, l'identifiant qu'emploient le reste du
 * workspace et la configuration de LyraeTalk (cf. `GLOSSARY.md`).
 *
 * `scripts/verif-groupes-centres.ts` affiche ce que chaque groupe résout
 * réellement en base : le passer avant de déployer une modification d'ici.
 */
export type GroupeCentre = {
  /** Nom lisible, pour le diagnostic seulement. */
  nom: string;
  /** Membres désignés par `User.id`. */
  userIds?: number[];
  /** Membres désignés par `UserProduct.id`. */
  userProductIds?: number[];
};

export const GROUPES_CENTRES: GroupeCentre[] = [
  // Historique, déclaré en User.id. Ne pas convertir en userProductId sans
  // avoir passé scripts/verif-groupes-centres.ts sur la base de production.
  { nom: "Montchanin / Le Creusot", userIds: [7, 8] },
  { nom: "Le Clipper / Epsilon", userIds: [12, 13] },

  // Groupe Quimper (RIM29SUD) : trois centres, un seul numéro d'appel.
  // Ajouté le 2026-09-04, en même temps que l'attribution des statistiques au
  // centre effectif (cf. plans/2026-09-attribution-stats-multisite.md).
  {
    nom: "Quimper / Fouesnant / Pont-l'Abbé",
    userProductIds: [18, 20, 21],
  },
];

/** Les `User.id` d'un groupe, `userProductIds` résolus au passage. */
async function membresDuGroupe(groupe: GroupeCentre): Promise<Set<number>> {
  const membres = new Set<number>(groupe.userIds ?? []);

  if (groupe.userProductIds?.length) {
    const produits = await prisma.userProduct.findMany({
      where: { id: { in: groupe.userProductIds } },
      select: { userId: true },
    });
    for (const p of produits) membres.add(p.userId);
  }

  return membres;
}

/**
 * Les autres centres du groupe de `userId`, en `User.id`.
 * Tableau vide si le centre n'appartient à aucun groupe, ce qui est le cas
 * courant.
 */
export async function centresLies(userId: number): Promise<number[]> {
  if (!Number.isFinite(userId)) return [];

  for (const groupe of GROUPES_CENTRES) {
    // Chemin rapide : la plupart des groupes sont déclarés en User.id, on évite
    // une requête sur chaque contrôle d'accès.
    if (groupe.userIds?.includes(userId)) {
      const membres = await membresDuGroupe(groupe);
      membres.delete(userId);
      return [...membres];
    }
  }

  // Groupes déclarés en userProductId : il faut la base pour savoir si l'appelant
  // en fait partie.
  const groupesParProduit = GROUPES_CENTRES.filter(
    (g) => g.userProductIds?.length
  );
  if (groupesParProduit.length === 0) return [];

  for (const groupe of groupesParProduit) {
    const membres = await membresDuGroupe(groupe);
    if (!membres.has(userId)) continue;
    membres.delete(userId);
    return [...membres];
  }

  return [];
}

/** `targetUserId` est-il dans le même groupe que `userId` ? */
export async function estCentreLie(
  userId: number,
  targetUserId: number
): Promise<boolean> {
  if (userId === targetUserId) return true;
  const lies = await centresLies(userId);
  return lies.includes(targetUserId);
}
