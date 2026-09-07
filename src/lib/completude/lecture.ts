import { db } from "@/lib/db";
import { PRODUITS, type SlugProduit } from "@/lib/produits";
import { statutDepuisBase, type StatutCentre } from "@/lib/centreStatut";
import { evaluerCentre, type Completude } from "./index";
import type { ConfigTalk } from "./talk";
import type { ConfigKonnect } from "./konnect";

/**
 * La lecture en base d'un centre, pour les deux produits.
 *
 * **Une seule requête par produit dans tout le dépôt.** Elle vivait en deux
 * exemplaires — `talk-installation` et `konnect-installation` — chacun avec ses
 * propres règles écrites en SQL au milieu des jointures : `performed AND
 * btrim(codeExamenClient) <> ''` dit qu'un examen est utilisable, mais il fallait
 * lire la requête pour le savoir, et rien ne garantissait que les deux pages en
 * jugeaient pareil.
 *
 * Ici, la requête ne fait plus que **lire**. Ce qui est exigé, et à partir de
 * quand une information manque, est déclaré dans `talk.ts` et `konnect.ts`.
 *
 * Chaque centre porte deux choses distinctes :
 *   - `config` : ce que le registre évalue ;
 *   - le reste : ce que les écrans affichent sans en juger (nom du bot, listes
 *     de codes, compteurs). Les séparer évite qu'un champ d'affichage se
 *     retrouve dans une règle, où il n'aurait aucun sens.
 */

type Commun = {
  userProductId: number;
  userId: number;
  clientNom: string | null;
  clientEmail: string | null;
  statut: StatutCentre;
};

export type CentreTalk = Commun & {
  /** Affichage seul : jamais exigé, mais utile pour reconnaître un centre. */
  botName: string | null;
  /** Une ligne `TalkSettings` existe : sans elle, le robot tourne sur ses défauts. */
  aDesReglages: boolean;
  aSmsConfirmation: boolean;
  aDepotOrdonnances: boolean;
  config: ConfigTalk;
};

export type CentreKonnect = Commun & {
  /** Taille du catalogue, tous examens confondus. Sert à situer `examensAvecCode`. */
  examensTotal: number;
  config: ConfigKonnect;
};

function objet(valeur: unknown): Record<string, any> {
  return valeur && typeof valeur === "object" && !Array.isArray(valeur)
    ? (valeur as Record<string, any>)
    : {};
}

function tableau(valeur: unknown): any[] {
  return Array.isArray(valeur) ? valeur : [];
}

function textes(valeur: unknown): string[] {
  return tableau(valeur).filter((v): v is string => typeof v === "string");
}

export async function lireCentresTalk(
  userProductId?: number
): Promise<CentreTalk[]> {
  const res = await db.query<any>(
    `
    SELECT up."id"                                   AS "userProductId",
           u."id"                                    AS "userId",
           u."name"                                  AS "clientNom",
           u."email"                                 AS "clientEmail",
           cs."statut"                               AS "statut",
           ts."botName"                              AS "botName",
           (ts."userProductId" IS NOT NULL)          AS "aDesReglages",
           (sms."userProductId" IS NOT NULL)         AS "aSmsConfirmation",
           (po."userProductId" IS NOT NULL)          AS "aDepotOrdonnances",
           COALESCE(cc."codes",   ARRAY[]::text[])   AS "codesCentres",
           COALESCE(nb."numeros", ARRAY[]::text[])   AS "numeros",
           ts."centerName", ts."address", ts."address2",
           ts."centerPhone", ts."centerMail", ts."centerWebsite",
           ts."welcomeMsg",
           ts."examsAccepted"                        AS "examsAccepted",
           ts."fullPlanningNotes"                    AS "fullPlanningNotes",
           COALESCE(ex."attribues", 0)::int          AS "examensAvecCode",
           COALESCE(em."lignes", '[]'::jsonb)        AS "mappings",
           COALESCE(mi."n", 0)::int                  AS "faq"
      FROM "UserProduct" up
      JOIN "Product" p ON p."id" = up."productId"
      LEFT JOIN "User" u ON u."id" = up."userId"
      LEFT JOIN "CentreStatut" cs ON cs."userProductId" = up."id"
      LEFT JOIN (
        SELECT "userProductId", array_agg("externalCenterCode" ORDER BY "externalCenterCode") AS "codes"
          FROM "ExternalCenterMapping" GROUP BY "userProductId"
      ) cc ON cc."userProductId" = up."id"
      LEFT JOIN (
        SELECT "userId", array_agg("number" ORDER BY "number") AS "numeros"
          FROM "UserNumber" WHERE "removedAt" IS NULL GROUP BY "userId"
      ) nb ON nb."userId" = up."userId"
      LEFT JOIN "TalkSettings" ts ON ts."userProductId" = up."id"
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS "attribues"
          FROM jsonb_array_elements(
                 CASE jsonb_typeof(ts."exams") WHEN 'array' THEN ts."exams" ELSE '[]'::jsonb END
               ) AS e
         WHERE btrim(COALESCE(e ->> 'codeExamenClient', '')) <> ''
      ) ex ON true
      LEFT JOIN "SmsConfirmationConfig" sms ON sms."userProductId" = up."id"
      LEFT JOIN "PrescriptionConfig" po ON po."userProductId" = up."id"
      LEFT JOIN (
        SELECT "userProductId",
               jsonb_agg(jsonb_build_object(
                 'examCode', "examCode", 'fr', "fr", 'diminutif', "diminutif"
               )) AS "lignes"
          FROM "ExamMapping" GROUP BY "userProductId"
      ) em ON em."userProductId" = up."id"
      LEFT JOIN (
        SELECT "userProductId", COUNT(*) AS "n"
          FROM "ModuleInfoItem" GROUP BY "userProductId"
      ) mi ON mi."userProductId" = up."id"
     WHERE up."removedAt" IS NULL
       AND lower(p."name") = lower($1)
       AND ($2::int IS NULL OR up."id" = $2::int)
     ORDER BY u."name" ASC NULLS LAST, up."id" ASC
    `,
    [PRODUITS.talk.nom, userProductId ?? null]
  );

  return res.rows.map((r) => ({
    userProductId: r.userProductId,
    userId: r.userId,
    clientNom: r.clientNom,
    clientEmail: r.clientEmail,
    statut: statutDepuisBase(r.statut),
    botName: r.botName,
    aDesReglages: r.aDesReglages,
    aSmsConfirmation: r.aSmsConfirmation,
    aDepotOrdonnances: r.aDepotOrdonnances,
    config: {
      userProductId: r.userProductId,
      userId: r.userId,
      codesCentres: textes(r.codesCentres),
      numeros: textes(r.numeros),
      centerName: r.centerName,
      address: r.address,
      address2: r.address2,
      centerPhone: r.centerPhone,
      centerMail: r.centerMail,
      centerWebsite: r.centerWebsite,
      welcomeMsg: r.welcomeMsg,
      examensAcceptes: objet(r.examsAccepted),
      notesPlanning: objet(r.fullPlanningNotes),
      examensAvecCode: r.examensAvecCode,
      mappings: tableau(r.mappings),
      faq: r.faq,
    },
  }));
}

export async function lireCentresKonnect(
  userProductId?: number
): Promise<CentreKonnect[]> {
  const res = await db.query<any>(
    `
    SELECT up."id"                                   AS "userProductId",
           u."id"                                    AS "userId",
           u."name"                                  AS "clientNom",
           u."email"                                 AS "clientEmail",
           cs."statut"                               AS "statut",
           m."tenantId"                              AS "tenantId",
           ris."valeur" ->> 'base_url'               AS "risBaseUrl",
           ris."valeur" ->> 'code_site'              AS "risCodeSite",
           (s."userProductId" IS NOT NULL)           AS "aDesParametres",
           s."telephoneSecretariat"                  AS "telephoneSecretariat",
           COALESCE(e."total", 0)::int               AS "examensTotal",
           COALESCE(e."avecCode", 0)::int            AS "examensAvecCode",
           COALESCE(e."reservables", 0)::int         AS "examensReservables",
           COALESCE(si."codesPostaux", '[]'::jsonb)  AS "sitesCodesPostaux"
      FROM "UserProduct" up
      JOIN "Product" p ON p."id" = up."productId"
      LEFT JOIN "User" u ON u."id" = up."userId"
      LEFT JOIN "CentreStatut" cs ON cs."userProductId" = up."id"
      LEFT JOIN "KonnectTenantMapping" m ON m."userProductId" = up."id"
      LEFT JOIN "KonnectSettings" s ON s."userProductId" = up."id"
      LEFT JOIN (
        SELECT "userProductId",
               COUNT(*) AS "total",
               COUNT(*) FILTER (
                 WHERE "performed" AND btrim(COALESCE("codeExamenClient", '')) <> ''
               ) AS "avecCode",
               COUNT(*) FILTER (
                 WHERE "performed" AND "reservableEnLigne"
                   AND btrim(COALESCE("codeExamenClient", '')) <> ''
               ) AS "reservables"
          FROM "KonnectExamens" GROUP BY "userProductId"
      ) e ON e."userProductId" = up."id"
      LEFT JOIN (
        SELECT "userProductId", jsonb_agg("codePostal") AS "codesPostaux"
          FROM "KonnectSites" GROUP BY "userProductId"
      ) si ON si."userProductId" = up."id"
      LEFT JOIN "ProductConfig" ris
        ON ris."userProductId" = up."id" AND ris."domaine" = 'konnect.ris-identite'
     WHERE up."removedAt" IS NULL
       AND lower(p."name") = lower($1)
       AND ($2::int IS NULL OR up."id" = $2::int)
     ORDER BY u."name" ASC NULLS LAST, up."id" ASC
    `,
    [PRODUITS.konnect.nom, userProductId ?? null]
  );

  return res.rows.map((r) => ({
    userProductId: r.userProductId,
    userId: r.userId,
    clientNom: r.clientNom,
    clientEmail: r.clientEmail,
    statut: statutDepuisBase(r.statut),
    examensTotal: r.examensTotal,
    config: {
      userProductId: r.userProductId,
      userId: r.userId,
      tenantId: r.tenantId,
      risBaseUrl: r.risBaseUrl,
      risCodeSite: r.risCodeSite,
      aDesParametres: r.aDesParametres,
      telephoneSecretariat: r.telephoneSecretariat,
      examensAvecCode: r.examensAvecCode,
      examensReservables: r.examensReservables,
      sitesCodesPostaux: tableau(r.sitesCodesPostaux),
    },
  }));
}

/** Un centre, son statut et son verdict de complétude, produits confondus. */
export type CentreEvalue = {
  userProductId: number;
  userId: number;
  clientNom: string | null;
  produit: SlugProduit;
  statut: StatutCentre;
  completude: Completude;
};

/** Lit et évalue les deux produits. Sans argument : tout le parc. */
export async function lireEtEvaluer(
  userProductId?: number
): Promise<CentreEvalue[]> {
  const [talk, konnect] = await Promise.all([
    lireCentresTalk(userProductId),
    lireCentresKonnect(userProductId),
  ]);

  return [
    ...talk.map((c) => ({
      userProductId: c.userProductId,
      userId: c.userId,
      clientNom: c.clientNom,
      produit: "talk" as const,
      statut: c.statut,
      completude: evaluerCentre(
        { produit: "talk", config: c.config },
        { userId: c.userId }
      ),
    })),
    ...konnect.map((c) => ({
      userProductId: c.userProductId,
      userId: c.userId,
      clientNom: c.clientNom,
      produit: "konnect" as const,
      statut: c.statut,
      completude: evaluerCentre(
        { produit: "konnect", config: c.config },
        { userId: c.userId }
      ),
    })),
  ];
}
