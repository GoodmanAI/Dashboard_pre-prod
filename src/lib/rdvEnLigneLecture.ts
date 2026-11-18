import { db } from "@/lib/db";
import { PRODUITS } from "@/lib/produits";
import { DOMAINE_RDV_EN_LIGNE, lireRdvEnLigne } from "@/lib/rdvEnLigne";
import { cheminEnLigne, sallesDuPortail } from "@/lib/konnectSallesPortail";

/**
 * Ponts de Talk vers Konnect (18/11/2026), lecture serveur. Plan
 * `lyrae/plans/2026-11-ponts-talk-konnect.md` §7 ; contrat `init-config.md`.
 *
 * Le robot ne propose le lien que si le client a **aussi** le produit Konnect
 * (décision 3 d'Enzo) : on cherche l'affiliation Konnect du même client que celle de
 * Talk. Talk et Konnect désignent un examen par le même code du référentiel
 * NEURACORP (`codeExamen`, `N01MR053`) : vérifié le 18/11 sur Menton, 264 codes de
 * part et d'autre, tous communs. Le robot croise donc sans table de correspondance.
 */

/** L'affiliation Konnect active du client qui porte cette affiliation Talk, ou `null`. */
export async function konnectDuClient(talkUserProductId: number): Promise<number | null> {
  const res = await db.query<{ id: number }>(
    `SELECT k."id"
       FROM "UserProduct" t
       JOIN "UserProduct" k ON k."userId" = t."userId" AND k."removedAt" IS NULL
       JOIN "Product" p ON p."id" = k."productId"
      WHERE t."id" = $1
        AND lower(p."name") = lower($2)
      ORDER BY k."id"
      LIMIT 1`,
    [talkUserProductId, PRODUITS.konnect.nom]
  );
  return res.rows[0]?.id ?? null;
}

/** L'adresse de la page de prise de RDV en ligne saisie pour ce Konnect, ou `null`. */
export async function urlRdvEnLigne(konnectUserProductId: number): Promise<string | null> {
  const res = await db.query<{ valeur: unknown }>(
    `SELECT "valeur" FROM "ProductConfig"
      WHERE "userProductId" = $1 AND "domaine" = $2 LIMIT 1`,
    [konnectUserProductId, DOMAINE_RDV_EN_LIGNE]
  );
  return lireRdvEnLigne(res.rows[0]?.valeur ?? null).url;
}

export type RdvEnLignePourRobot = {
  url: string;
  /**
   * Les seuls examens réservables en ligne, par code NEURACORP. Un code absent n'est
   * pas réservable en ligne (rappel, non pratiqué, sans code RIS ou sans salle) : le
   * robot ne le propose pas, sauf examen encore inconnu (plan §7).
   */
  examens: Record<string, { reservable: true; fileAttente: boolean }>;
};

/**
 * Le bloc `site.rdvEnLigne` d'`init-config`, ou `null` si le client n'a pas Konnect
 * ou si l'adresse n'est pas saisie. Mêmes règles que le catalogue de Konnect
 * (`cheminEnLigne`) : un examen pratiqué, avec un code RIS, réservable et avec une
 * salle ouverte.
 */
export async function rdvEnLignePourRobot(
  talkUserProductId: number
): Promise<RdvEnLignePourRobot | null> {
  const konnect = await konnectDuClient(talkUserProductId);
  if (konnect === null) return null;
  const url = await urlRdvEnLigne(konnect);
  if (!url) return null;

  const [lignes, salles] = await Promise.all([
    db.query<{
      codeExamen: string;
      typeExamen: string | null;
      typeExamenClient: string;
      postes: string[] | null;
      reservableEnLigne: boolean;
      fileAttente: boolean;
    }>(
      `SELECT "codeExamen", "typeExamen", "typeExamenClient", "postes",
              "reservableEnLigne", "fileAttente"
         FROM "KonnectExamens"
        WHERE "userProductId" = $1
          AND "performed"
          AND btrim("codeExamenClient") <> ''`,
      [konnect]
    ),
    sallesDuPortail(konnect),
  ]);

  const examens: RdvEnLignePourRobot["examens"] = {};
  for (const l of lignes.rows) {
    const chemin = cheminEnLigne(l, salles.config);
    if (chemin.reservable) {
      examens[l.codeExamen] = { reservable: true, fileAttente: chemin.fileAttente };
    }
  }
  return { url, examens };
}
