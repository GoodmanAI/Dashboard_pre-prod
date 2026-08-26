-- Migration manuelle : socle de configuration générique par centre et par domaine
--
-- Lot B du plan `plans/2026-08-config-unifiee-dashboard.md`. Treize domaines de
-- configuration restent à rapatrier depuis Konnect, et LyraeTalk en a cinq de son
-- côté, chacun dans sa table ad hoc. Créer une table par domaine coûterait treize
-- migrations, treize routes et treize écrans — pour des corpus de règles que le
-- client règle une fois à l'installation et ne touche plus.
--
-- Cette table porte les domaines de la seconde catégorie. Le critère de
-- répartition n'est PAS la taille du corpus mais **la fréquence d'édition par le
-- client** :
--   - édité au clic, écran riche  -> table typée dédiée (cf. `KonnectSettings`)
--   - réglé une fois, puis oublié -> ici, en JSONB versionné
--
-- Une ligne par (centre, domaine). Le produit n'est PAS stocké : il se déduit de
-- `userProductId` via `UserProduct` -> `Product`. Le dupliquer ici créerait deux
-- vérités qui pourraient diverger. La liste blanche des domaines et le produit
-- auquel chacun appartient vivent dans `src/lib/productConfig.ts`.
--
-- `version` s'incrémente à chaque écriture et sert d'**ETag HTTP** : la brique
-- consommatrice envoie `If-None-Match` et reçoit un 304 tant que rien n'a changé.
-- Sans cela, un catalogue de plusieurs centaines de lignes transiterait à chaque
-- lecture. Le patron est celui de `UserProduct.moduleInfoVersion`, qui rend déjà
-- ce service aux Module Info Items.
--
-- Pourquoi une migration manuelle plutôt que Prisma : la base porte déjà douze
-- tables absentes de `schema.prisma`. `prisma migrate dev` détecte cette dérive et
-- propose un reset qui les emporterait toutes.
--
-- Idempotent : sûr à rejouer.

BEGIN;

CREATE TABLE IF NOT EXISTS "ProductConfig" (
  "id"            serial PRIMARY KEY,
  "userProductId" integer NOT NULL,

  -- Slug du domaine, namespacé par produit : « konnect.regles-fusion »,
  -- « talk.sms-confirmation ». La liste blanche est dans le code, pas ici : une
  -- contrainte CHECK obligerait une migration à chaque nouveau domaine, ce qui
  -- annulerait le bénéfice du socle.
  "domaine"       text    NOT NULL,

  -- Contenu du domaine. Sa forme n'est connue que du produit consommateur ; le
  -- Dashboard le stocke et le restitue sans l'interpréter. Objet JSON à la
  -- racine (jamais un scalaire) pour rester extensible sans casser les lecteurs.
  "valeur"        jsonb   NOT NULL DEFAULT '{}'::jsonb,

  -- Incrémentée à chaque écriture. Sert d'ETag ; jamais remise à zéro.
  "version"       integer NOT NULL DEFAULT 1,

  "createdAt"     timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT NOW(),

  -- Un seul enregistrement par centre et par domaine : c'est ce qui permet
  -- l'UPSERT `ON CONFLICT` côté route.
  CONSTRAINT "ProductConfig_userProductId_domaine_key"
    UNIQUE ("userProductId", "domaine")
);

-- Lecture par centre puis domaine : c'est l'accès de la brique consommatrice.
-- L'index unique ci-dessus couvre déjà (userProductId, domaine) ; celui-ci sert
-- l'écran d'administration qui liste tous les domaines d'un centre.
CREATE INDEX IF NOT EXISTS "ProductConfig_userProductId_idx"
  ON "ProductConfig" ("userProductId");

-- Le centre disparaît -> ses configurations aussi. Pas d'orphelins : un
-- `userProductId` réattribué hériterait sinon de la configuration d'un autre
-- client. Ajoutée séparément pour rester idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductConfig_userProductId_fkey'
  ) THEN
    ALTER TABLE "ProductConfig"
      ADD CONSTRAINT "ProductConfig_userProductId_fkey"
      FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
