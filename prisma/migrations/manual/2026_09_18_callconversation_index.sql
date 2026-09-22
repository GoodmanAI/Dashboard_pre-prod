-- Migration manuelle : index sur les appels (`CallConversation`)
--
-- POURQUOI. La table n'a que sa cle primaire. Or toutes les pages de LyraeTalk la
-- lisent par centre et par periode : statistiques d'appels, liste des appels,
-- incidents, accueil, vue d'ensemble admin, planning complet. Sans index, chaque
-- lecture parcourt la table entiere, tous centres confondus, et la page
-- « Statistiques d'appels » en fait plusieurs par affichage.
--
-- AVANT D'APPLIQUER : regarder ce qui existe deja, un index a pu etre pose a la main.
--   \d "CallConversation"
--
-- COMMENT. `CONCURRENTLY` ne verrouille pas la table en ecriture (le robot continue
-- d'y ecrire les appels pendant la construction), mais il ne peut PAS tourner dans une
-- transaction : lancer ce fichier avec psql SANS `-1` / `--single-transaction`.
--   psql "$DATABASE_URL" -f prisma/migrations/manual/2026_09_18_callconversation_index.sql
-- Si une construction est interrompue, l'index reste marque INVALID : le supprimer
-- (`DROP INDEX CONCURRENTLY "<nom>"`) puis relancer.
--
-- Idempotent : `IF NOT EXISTS`. Additif : aucune colonne, aucune donnee touchee.

-- Le filtre de toutes les pages : un centre, une periode, du plus recent au plus ancien.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CallConversation_userProductId_createdAt_idx"
  ON "CallConversation" ("userProductId", "createdAt" DESC);

-- La vue « tous les centres » des statistiques produit filtre sur la date seule.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CallConversation_createdAt_idx"
  ON "CallConversation" ("createdAt");

-- Les incidents : seuls les appels signales, sur tout l'historique d'un centre. Index
-- partiel (tres peu de lignes). Prisma ne sait pas l'exprimer : il ne vit qu'ici.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CallConversation_userProductId_flagged_idx"
  ON "CallConversation" ("userProductId", "createdAt" DESC)
  WHERE "flagged";
