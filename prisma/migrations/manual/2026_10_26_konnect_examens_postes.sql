-- =============================================================================
-- Migration manuelle : les salles d'un examen du portail Konnect
-- =============================================================================
--
-- Contexte (plan workspace plans/2026-10-salles-ouvertes-konnect.md) : Konnect se
-- facture par salle. L'equipe ouvre des salles au portail (domaine ProductConfig
-- `konnect.salles`, sans migration) ; le centre peut en plus choisir, examen par
-- examen, les salles ou l'examen se fait, comme pour LyraeTalk.
--
--  - "KonnectExamens"."postes" : numeros de poste Xplore (normalises, majuscules)
--    choisis pour l'examen. Vide = toutes les salles ouvertes de son type.
--
-- Additif et idempotent. A appliquer AVANT le deploiement du code qui lit la
-- colonne. L'ancien code tourne sur la nouvelle base sans la voir.
-- =============================================================================

BEGIN;

ALTER TABLE "KonnectExamens"
  ADD COLUMN IF NOT EXISTS "postes" text[] NOT NULL DEFAULT '{}';

COMMIT;
