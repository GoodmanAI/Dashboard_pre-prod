import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { db } from "@/lib/db";
import { produitDepuisNom, type SlugProduit } from "@/lib/produits";

/**
 * Amorce la configuration d'un produit qu'on vient d'affilier à un centre.
 *
 * **Le défaut que ça referme** (lot 4A, 15/09/2026). `POST /api/admin/create-client`
 * créait le compte et ses `UserProduct`, et **rien d'autre**. Conséquence pour LyraeTalk :
 * `GET /api/configuration` répond **404** tant que personne n'a enregistré une première
 * fois, donc le robot ne peut pas lire un centre neuf et l'écran de paramétrage s'ouvre
 * sur une erreur. Le client découvrait son produit par un message d'échec.
 *
 * ## Elle ne pré-remplit RIEN, et c'est délibéré
 *
 * Elle crée une ligne vide, pas une configuration par défaut. La différence est tout le
 * sujet : le registre de complétude (`src/lib/completude/talk.ts`) juge sur les CHAMPS,
 * jamais sur l'existence de la ligne, donc un centre amorcé continue d'afficher « tout
 * reste à faire ». C'est la vérité, et elle doit le rester : une ligne pré-remplie qui
 * ferait passer un contrôle au vert serait plus nuisible que le 404 qu'on corrige.
 *
 * Vérifié avant d'écrire : `aDesReglages` (« une ligne existe ») n'est l'exigence
 * d'aucun des douze contrôles du registre.
 *
 * ## LyraeKonnect ne reçoit pas de configuration, mais il reçoit une IDENTITÉ
 *
 * Deux choses différentes, et la distinction est le sujet du lot 4E.
 *
 * Pas de configuration : `lireConfig()` rend `KONNECT_DEFAUTS` quand aucune ligne
 * n'existe, sans en créer, et le portail tourne en fail-closed. Insérer une ligne ne
 * changerait rien au comportement, mais ferait apparaître comme « configuré » un cabinet
 * qui ne l'est pas. On s'abstient, et ce n'est pas un oubli.
 *
 * Une identité, si : depuis le 15/09/2026, affilier LyraeKonnect **attribue son
 * identifiant de cabinet**. Il naissait chez Konnect et se recopiait à la main ; il naît
 * ici, et Konnect vient le lire. Voir `attribuerIdentiteKonnect`.
 *
 * ## Idempotente
 *
 * Elle est appelée aux deux endroits qui affilient un produit, dont l'un peut ré-affilier
 * un produit précédemment retiré (`UserProduct.removedAt` remis à `null`). Elle ne doit
 * jamais écraser une configuration existante : d'où le `upsert` sans `update`.
 */
export async function amorcerProduit(
  userProductId: number,
  nomDuProduit: string | null | undefined
): Promise<void> {
  const produit = produitDepuisNom(nomDuProduit);
  if (!produit) return;
  await amorcerParSlug(userProductId, produit.slug);
}

export async function amorcerParSlug(
  userProductId: number,
  slug: SlugProduit
): Promise<void> {
  if (slug === "konnect") {
    await attribuerIdentiteKonnect(userProductId);
    return;
  }
  if (slug !== "talk") return;

  await prisma.talkSettings.upsert({
    where: { userProductId },
    // Une configuration déjà là ne bouge pas. C'est ce qui rend l'appel sûr sur une
    // ré-affiliation : le centre retrouve ses réglages, il ne repart pas de zéro.
    update: {},
    create: { userProductId },
  });
}

/**
 * Un slug lisible, dérivé du nom du centre, au format qu'exige le portail.
 *
 * `^[a-z0-9]+(?:-[a-z0-9]+)*$` : pas d'accent, pas d'espace, pas de tiret en bord. Le
 * suffixe est l'identifiant de l'affiliation, ce qui garantit l'unicité sans dépendre du
 * nom : deux centres d'un même groupe s'appellent souvent pareil.
 */
export function slugCabinet(nom: string | null | undefined, userProductId: number): string {
  const base = (nom ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base ? `${base}-${userProductId}` : `centre-${userProductId}`;
}

/**
 * Attribue l'identifiant de cabinet du portail, à l'affiliation du produit.
 *
 * ## Ce que ça referme
 *
 * L'identifiant naissait chez Konnect (`POST /console/cabinets`, par curl, avec l'UUID
 * rendu par sa base), puis se recopiait à la main dans l'écran « Identifiants
 * externes ». Deux outils, un copier-coller, et un Dashboard incapable de vérifier que
 * l'UUID saisi désignait quelque chose : l'écran le disait lui-même.
 *
 * Il naît maintenant ici, et Konnect tire la liste des cabinets attendus pour les créer
 * lui-même. Le sens de circulation ne change pas : le Dashboard ne peut pas appeler
 * Konnect, c'est une lecture de plus sur le pont.
 *
 * ## `DO NOTHING`, jamais `DO UPDATE`
 *
 * Réattribuer un identifiant à un cabinet qui en a déjà un couperait un portail en
 * service de toute sa configuration, et laisserait chez Konnect un cabinet orphelin
 * portant des rendez-vous. Une ré-affiliation doit retrouver son identité, pas en
 * recevoir une neuve.
 *
 * ## Elle ne fait pas échouer l'affiliation
 *
 * Si la colonne `slug` n'existe pas encore (migration manuelle non passée), on pose
 * l'identifiant sans elle plutôt que de refuser d'affilier le produit. Le cabinet sera
 * simplement invisible de la liste des cabinets attendus, ce que l'écran d'installation
 * signale déjà.
 */
export async function attribuerIdentiteKonnect(userProductId: number): Promise<void> {
  const centre = await prisma.userProduct.findUnique({
    where: { id: userProductId },
    select: { user: { select: { name: true, email: true } } },
  });
  const nom = centre?.user?.name?.trim() || centre?.user?.email || null;

  try {
    await db.query(
      `INSERT INTO "KonnectTenantMapping" ("userProductId", "tenantId", "slug")
       VALUES ($1, $2, $3)
       ON CONFLICT ("userProductId") DO NOTHING`,
      [userProductId, randomUUID(), slugCabinet(nom, userProductId)]
    );
  } catch (err: any) {
    // `42703` = colonne inconnue : la migration manuelle n'est pas passée sur cette
    // base. On retombe sur l'ancienne forme, sans slug.
    if (err?.code !== "42703") throw err;
    await db.query(
      `INSERT INTO "KonnectTenantMapping" ("userProductId", "tenantId")
       VALUES ($1, $2)
       ON CONFLICT ("userProductId") DO NOTHING`,
      [userProductId, randomUUID()]
    );
  }
}
