import { db } from "@/lib/db";

/**
 * Logo du client, commun à Talk et Konnect (28/11/2026). Plan
 * `lyrae/plans/2026-11-logo-du-client.md`, table `ClientLogo` (SQL manuel
 * `2026_12_26_logo_client.sql`).
 *
 * Trois lecteurs : le portail Konnect (`/api/konnect-logo`, qu'il tire et met en cache
 * par ETag), l'écran de Paramétrage (`/api/logo-client`) et l'aperçu des liens SMS
 * (`/c/{code}/logo`, `/d/{code}/logo`). Le logo est une image publique : il figure sur le
 * site du centre, aucune donnée patient ici.
 */

/** Ce que le portail patient sait afficher, et rien d'autre. */
export const TYPES_LOGO = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

/**
 * Ce que les aperçus de lien affichent : pas le SVG (Google Messages, WhatsApp et iMessage
 * l'ignorent). Un client au logo SVG garde le logo Neuracorp dans ses SMS.
 */
export const TYPES_APERCU = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * 512 Ko. Un logo de bandeau fait quelques dizaines de kilo-octets ; au-delà, c'est une
 * photo déposée par erreur. Le portail le charge sur son premier écran, souvent en 4G.
 */
export const TAILLE_MAX_LOGO = 512 * 1024;

export type LogoClient = { contenu: Buffer; type: string; nom: string | null; maj: Date };

/** Le client (`User.id`) d'un produit, ou `null` si le produit n'existe pas. */
export async function clientDuProduit(userProductId: number): Promise<number | null> {
  const r = await db.query<{ userId: number }>(
    `SELECT "userId" FROM "UserProduct" WHERE "id" = $1 AND "removedAt" IS NULL LIMIT 1`,
    [userProductId]
  );
  return r.rows[0]?.userId ?? null;
}

/** Le logo du client, ou `null` s'il n'en a pas. `maj` reste lu même sans logo (ETag). */
export async function lireLogoClient(
  userId: number
): Promise<{ logo: LogoClient | null; maj: Date | null }> {
  const r = await db.query<{
    contenu: Buffer | null;
    type: string | null;
    nom: string | null;
    maj: Date | null;
  }>(`SELECT "contenu", "type", "nom", "maj" FROM "ClientLogo" WHERE "userId" = $1 LIMIT 1`, [
    userId,
  ]);
  const l = r.rows[0];
  if (!l) return { logo: null, maj: null };
  if (!l.contenu || !l.type || !l.maj) return { logo: null, maj: l.maj };
  return { logo: { contenu: l.contenu, type: l.type, nom: l.nom, maj: l.maj }, maj: l.maj };
}

/**
 * Empreinte du logo, servie en `ETag`. Dérivée de la date de dépôt, pas du contenu : deux
 * dépôts du même fichier doivent quand même invalider le cache de Konnect.
 */
export function empreinteLogo(maj: Date | null, octets: number): string {
  if (!maj) return '"vide"';
  return `"${maj.getTime()}-${octets}"`;
}

/** Contrôle d'un fichier déposé : message pour le client, ou `null` s'il est bon. */
export function erreurFichierLogo(fichier: File): string | null {
  if (!TYPES_LOGO.has(fichier.type)) {
    return "Format non accepté. Déposez un PNG, un JPEG, un WEBP ou un SVG.";
  }
  if (fichier.size > TAILLE_MAX_LOGO) return "Fichier trop lourd. La limite est de 512 Ko.";
  if (fichier.size === 0) return "Le fichier est vide.";
  return null;
}

export async function ecrireLogoClient(userId: number, fichier: File): Promise<void> {
  const contenu = Buffer.from(await fichier.arrayBuffer());
  // Nom tronqué : purement informatif, l'écran l'affiche pour que le client reconnaisse
  // ce qu'il a déposé.
  await db.query(
    `INSERT INTO "ClientLogo" ("userId", "contenu", "type", "nom", "maj", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT ("userId") DO UPDATE
       SET "contenu" = EXCLUDED."contenu", "type" = EXCLUDED."type", "nom" = EXCLUDED."nom",
           "maj" = NOW(), "updatedAt" = NOW()`,
    [userId, contenu, fichier.type, fichier.name.slice(0, 200)]
  );
}

/**
 * Retire le logo. `maj` est avancée, pas effacée : c'est elle qui porte l'ETag, et Konnect
 * doit voir que quelque chose a changé pour vider son propre cache.
 */
export async function retirerLogoClient(userId: number): Promise<void> {
  await db.query(
    `UPDATE "ClientLogo"
        SET "contenu" = NULL, "type" = NULL, "nom" = NULL, "maj" = NOW(), "updatedAt" = NOW()
      WHERE "userId" = $1`,
    [userId]
  );
}

/** Chemin du logo Neuracorp, image d'aperçu par défaut (sous `/images/`, permis sur les sous-domaines patient). */
export const LOGO_NEURACORP = "/images/logos/neuracorp-ai-icon_fond.png";

/**
 * Réponse d'une route d'image d'aperçu (`/c/{code}/logo`, `/d/{code}/logo`) : le logo du
 * centre, sinon une redirection vers celui de Neuracorp. `base` est l'adresse publique du
 * sous-domaine : derrière nginx, l'hôte de la requête n'est pas fiable.
 */
export async function reponseImageApercu(userId: number | null, base: string): Promise<Response> {
  const logo = userId ? await logoPourApercu(userId) : null;
  if (!logo) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${base}${LOGO_NEURACORP}`, "Cache-Control": "public, max-age=300" },
    });
  }
  return new Response(new Uint8Array(logo.contenu), {
    status: 200,
    headers: {
      "Content-Type": logo.type,
      "Content-Length": String(logo.contenu.length),
      // Une heure : l'aperçu se fabrique une fois par lien ; un logo changé se voit au
      // SMS suivant, qui porte un autre lien.
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Le logo à mettre dans l'aperçu d'un lien SMS, pour le centre d'un lien (`centerId`).
 * `null` : pas de logo, ou un SVG que les aperçus n'affichent pas.
 */
export async function logoPourApercu(userId: number): Promise<LogoClient | null> {
  const { logo } = await lireLogoClient(userId);
  return logo && TYPES_APERCU.has(logo.type) ? logo : null;
}
