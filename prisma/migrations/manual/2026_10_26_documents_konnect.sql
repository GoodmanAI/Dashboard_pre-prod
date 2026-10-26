-- =============================================================================
-- Migration manuelle : un interrupteur Konnect pour chaque document demande
-- =============================================================================
--
-- Contexte (plan workspace plans/2026-10-konnect-questionnaires-centre.md,
-- DECISIONS.md du 26/10/2026) : le client met un questionnaire a disposition
-- de LyraeTalk (`disponible`, inchange) et, a part, de Konnect
-- (`disponibleKonnect`), chacun depuis sa section du Dashboard.
--
-- Reprise : `disponibleKonnect` recopie `disponible`. Avant ce lot, un document
-- mis a disposition valait pour les deux canaux ; rien ne change tant que le
-- client ne decoche pas.
--
-- Additif et idempotent (la reprise ne tourne qu'a la creation de la colonne).
-- A appliquer AVANT le deploiement du code qui lit la colonne. L'ancien code
-- tourne sur la nouvelle base sans la voir.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'DocumentDemande' AND column_name = 'disponibleKonnect'
  ) THEN
    ALTER TABLE "DocumentDemande"
      ADD COLUMN "disponibleKonnect" boolean NOT NULL DEFAULT false;
    UPDATE "DocumentDemande" SET "disponibleKonnect" = "disponible";
  END IF;
END $$;

COMMIT;
