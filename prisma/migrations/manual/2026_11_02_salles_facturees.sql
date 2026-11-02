-- Migration manuelle : les salles d'un client, et celles qu'il paie, par produit
--
-- Plan workspace `plans/2026-11-salles-facturees-talk-konnect.md` (02/11/2026). Lyrae
-- facture à la salle : 325 € TTC par mois pour une salle de Talk, 95 € TTC pour une
-- salle de Konnect, quelle que soit la modalité. Un produit ne prend de RDV que dans
-- les salles payées.
--
-- AVANT, deux déclarations séparées : `talk.site.sallesParType` (UserProduct Talk) et
-- `konnect.salles` (UserProduct Konnect). Une salle physique est la même pour les deux
-- produits : elle est désormais déclarée une fois, au client (`userId`), avec une case
-- par produit.
--
--   "Salle"       une ligne par salle d'un client. Clé : (userId, poste), le
--                 `numeroPoste` d'Xplore normalisé (trim, majuscules). Une salle n'est
--                 donc jamais comptée deux fois, même si deux `codeSite` d'une même
--                 base Xplore la renvoient.
--   "TarifSalle"  le prix mensuel TTC d'une salle, par produit, en centimes.
--
-- RÈGLE DE TRANSITION (S6) : tant qu'aucune salle d'un client n'a la case d'un
-- produit, ce produit se comporte comme avant (aucun filtre). La reprise ci-dessous
-- coche Konnect pour les salles déjà ouvertes au portail, et laisse Talk décoché :
-- rien ne change en production au passage de ce fichier.
--
-- AUCUNE DONNÉE PATIENT. Hors `schema.prisma`, lue par le pool `pg`. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS "Salle" (
  "id"         serial PRIMARY KEY,
  "userId"     integer NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  -- Le site Xplore où la salle a été relevée (`codeSite`). Nul pour une salle reprise
  -- d'une ancienne déclaration, qui ne le disait pas : la facturation la range alors
  -- sous « site non précisé ».
  "codeSite"   varchar(20),
  "poste"      varchar(40) NOT NULL,
  -- Code robot canonique : RX, US, MG, CT, MR.
  "typeExamen" varchar(4) NOT NULL,
  "libelle"    varchar(40) NOT NULL,
  "talk"       boolean NOT NULL DEFAULT false,
  "konnect"    boolean NOT NULL DEFAULT false,
  "createdAt"  timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"  timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT "Salle_type_check" CHECK ("typeExamen" IN ('RX', 'US', 'MG', 'CT', 'MR')),
  CONSTRAINT "Salle_poste_check" CHECK ("poste" = upper(btrim("poste")) AND "poste" <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS "Salle_userId_poste_key" ON "Salle" ("userId", "poste");

CREATE TABLE IF NOT EXISTS "TarifSalle" (
  -- `talk` ou `konnect`.
  "produit"           varchar(20) PRIMARY KEY,
  "prixMensuelTtcCts" integer NOT NULL CHECK ("prixMensuelTtcCts" >= 0),
  "updatedAt"         timestamp with time zone NOT NULL DEFAULT NOW()
);

-- Prix donnés par Enzo le 02/11/2026. Jamais écrasés par un second passage.
INSERT INTO "TarifSalle" ("produit", "prixMensuelTtcCts") VALUES
  ('talk', 32500),
  ('konnect', 9500)
ON CONFLICT ("produit") DO NOTHING;

-- ── Reprise des deux anciennes déclarations ─────────────────────────────────
--
-- Talk : chaque salle de `talk.site.sallesParType`, case Talk DÉCOCHÉE (transition).
INSERT INTO "Salle" ("userId", "poste", "typeExamen", "libelle")
SELECT DISTINCT ON (up."userId", upper(btrim(s->>'poste')))
       up."userId", upper(btrim(s->>'poste')), t.type, left(btrim(s->>'libelle'), 40)
  FROM "ProductConfig" pc
  JOIN "UserProduct" up ON up."id" = pc."userProductId"
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(pc."valeur"->'sallesParType') = 'object'
         THEN pc."valeur"->'sallesParType' ELSE '{}'::jsonb END) AS t(type, liste)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(t.liste) = 'array' THEN t.liste ELSE '[]'::jsonb END) AS s
 WHERE pc."domaine" = 'talk.site'
   AND t.type IN ('RX', 'US', 'MG', 'CT', 'MR')
   AND btrim(coalesce(s->>'poste', '')) <> ''
   AND btrim(coalesce(s->>'libelle', '')) <> ''
ON CONFLICT ("userId", "poste") DO NOTHING;

-- Konnect : chaque salle de `konnect.salles.sallesParType`.
INSERT INTO "Salle" ("userId", "poste", "typeExamen", "libelle")
SELECT DISTINCT ON (up."userId", upper(btrim(s->>'poste')))
       up."userId", upper(btrim(s->>'poste')), t.type, left(btrim(s->>'libelle'), 40)
  FROM "ProductConfig" pc
  JOIN "UserProduct" up ON up."id" = pc."userProductId"
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(pc."valeur"->'sallesParType') = 'object'
         THEN pc."valeur"->'sallesParType' ELSE '{}'::jsonb END) AS t(type, liste)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(t.liste) = 'array' THEN t.liste ELSE '[]'::jsonb END) AS s
 WHERE pc."domaine" = 'konnect.salles'
   AND t.type IN ('RX', 'US', 'MG', 'CT', 'MR')
   AND btrim(coalesce(s->>'poste', '')) <> ''
   AND btrim(coalesce(s->>'libelle', '')) <> ''
ON CONFLICT ("userId", "poste") DO NOTHING;

-- … et la case Konnect cochée pour les salles qui étaient ouvertes au portail.
UPDATE "Salle" sa
   SET "konnect" = true, "updatedAt" = NOW()
  FROM "ProductConfig" pc
  JOIN "UserProduct" up ON up."id" = pc."userProductId"
 WHERE pc."domaine" = 'konnect.salles'
   AND sa."userId" = up."userId"
   AND jsonb_typeof(pc."valeur"->'ouvertes') = 'array'
   AND sa."poste" IN (
     SELECT upper(btrim(o)) FROM jsonb_array_elements_text(pc."valeur"->'ouvertes') AS o);

-- Contrôle : ce qui a été repris, par client. À lire avant le build.
SELECT "userId", count(*) AS salles,
       count(*) FILTER (WHERE "talk") AS talk,
       count(*) FILTER (WHERE "konnect") AS konnect
  FROM "Salle" GROUP BY "userId" ORDER BY "userId";

COMMIT;
