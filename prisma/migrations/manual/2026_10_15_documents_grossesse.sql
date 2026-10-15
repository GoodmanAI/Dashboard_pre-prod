-- =============================================================================
-- Migration manuelle : documents reserves aux patientes dont une grossesse est
-- possible (attestation de non-grossesse)
-- =============================================================================
--
-- Contexte (plan workspace plans/2026-10-attestation-grossesse.md, DECISIONS.md
-- du 15/10/2026) : un document demande peut ne valoir que pour une patiente de
-- 12 a 55 ans (ou de sexe ou d'age inconnu). Le canal calcule le booleen
-- `grossessePossible` et l'envoie a /api/prescriptions/init ; le Dashboard ne
-- recoit ni l'age ni le sexe.
--
-- "grossesseSeulement" exclut "mineursSeulement" : les routes refusent un
-- document qui porte les deux.
--
-- Additif et idempotent. A appliquer AVANT le deploiement du code qui lit la
-- colonne. L'ancien code tourne sur la nouvelle base sans la voir.
-- =============================================================================

BEGIN;

ALTER TABLE "DocumentDemande"
  ADD COLUMN IF NOT EXISTS "grossesseSeulement" boolean NOT NULL DEFAULT false;

COMMIT;
