-- Migration manuelle : ajout d'un contactEmail sur Ticket
--
-- Objectif : permettre au client de renseigner UN mail dedie a la reception
-- des notifications de cloture (RESOLVED / CLOSED). Utile car tous les
-- comptes CLIENT n'ont pas forcement une adresse email surveillee : la
-- creation d'un ticket devient l'occasion d'indiquer "envoyer les updates
-- ici" explicitement.
--
-- Comportement applicatif :
--   - contactEmail est renseigne a la CREATION (required cote endpoint)
--   - Pour les notifs de cloture (RESOLVED / CLOSED), on envoie le mail
--     PRIORITAIREMENT sur contactEmail. Fallback sur User.email si
--     contactEmail est absent (cas des tickets historiques crees avant
--     cette migration).
--
-- Compatibilite :
--   - Colonne NULLABLE : les tickets deja crees restent valides sans mail
--     de contact explicite (fallback user.email suffit).
--
-- Idempotent : safe a rejouer.

BEGIN;

ALTER TABLE "Ticket"
  ADD COLUMN IF NOT EXISTS "contactEmail" varchar(320);

COMMIT;

-- Verif :
--   \d "Ticket"   -- doit contenir "contactEmail" varchar(320) nullable
--
-- Rollback :
--   ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "contactEmail";
