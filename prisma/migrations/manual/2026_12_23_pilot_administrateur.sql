-- Administrateur de Pilot (24/11/2026, plan 2026-11-pilot-dans-le-dashboard.md, « Cloisons »).
-- Un compte ADMIN qui a, dans Pilot seulement, les pouvoirs du super-administrateur :
-- l'équipe (sans les accès au Dashboard), les alertes confiées, les fiches. Coché par le
-- SUPER_ADMIN seul. Additif et idempotent.
ALTER TABLE "CrmAccesPilot" ADD COLUMN IF NOT EXISTS "administrateur" boolean NOT NULL DEFAULT false;
