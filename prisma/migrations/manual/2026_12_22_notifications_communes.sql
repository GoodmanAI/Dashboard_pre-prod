-- Notifications communes au Dashboard et à Pilot (plan lyrae/plans/2026-11-pilot-dans-le-dashboard.md, lot P6).
--
-- Jusqu'ici `Notification` ne servait qu'aux tickets du support. Pilot y écrit
-- désormais pour une demande reçue, un commentaire reçu, une alerte confiée, et la
-- même cloche les montre dans les deux espaces.
--
-- Nommé 2026_12_22 pour passer APRÈS les 26 fichiers de Pilot (2026_10_26 à
-- 2026_12_21), dans l'ordre des noms. Additif et rejouable : trois colonnes
-- facultatives et un index unique. Les notifications existantes (tickets) gardent
-- `type`, `lien` et `cle` à NULL et s'affichent comme avant.
--
-- Index unique (userId, cle) : PostgreSQL tient les NULL pour distincts, les
-- tickets (cle NULL) ne sont donc jamais en conflit entre eux.

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "lien" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "cle"  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_cle_key" ON "Notification" ("userId", "cle");
