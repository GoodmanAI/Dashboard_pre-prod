-- =============================================================================
-- Migration manuelle : retrait de l'ancienne table "Call"
-- =============================================================================
--
-- Contexte (22/10/2026, suite de la retention des appels,
-- plans/2026-09-retention-des-appels.md) : "Call" ne portait que des appels de
-- demonstration (2 120 lignes), videe le 19/10. Les appels reels sont dans
-- "CallConversation". Plus aucun code ne lit ni n'ecrit "Call" ; le modele, ses
-- deux enums et les scripts seed_calls.ts / seed_demo_calls.ts sont retires.
--
-- Refuse de supprimer si la table contient encore des lignes.
-- Idempotent. A appliquer APRES le deploiement du code (l'ancien client Prisma
-- connait encore le modele, le nouveau ne le connait plus).
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('"Call"') IS NOT NULL
     AND EXISTS (SELECT 1 FROM "Call") THEN
    RAISE EXCEPTION 'La table "Call" n''est pas vide : retrait annule.';
  END IF;
END $$;

DROP TABLE IF EXISTS "Call";
DROP TYPE IF EXISTS "CallIntent";
DROP TYPE IF EXISTS "CallStatus";

COMMIT;
