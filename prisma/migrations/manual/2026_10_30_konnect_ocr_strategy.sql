-- 30/10/2026 : la façon de lire les ordonnances de Konnect (OCR v2) se règle au Dashboard.
--
-- Plan workspace `plans/2026-10-ocr-v2-integration.md`, décision C-OCRV2.8.2 de Konnect :
-- la console de Konnect ne règle plus la stratégie de lecture, le Dashboard la porte et la
-- descend par `GET /api/konnect-configuration` (`ocr_strategy`). Réglage de l'exploitant
-- (ADMIN), comme le consentement `cloudOcrActif` posé à côté.
--
-- NULL : le cabinet suit le défaut de la plateforme (`tesseract_only`), et Konnect garde la
-- stratégie qu'il a en place. Idempotent, additif : à passer AVANT le build.

ALTER TABLE "KonnectSettings" ADD COLUMN IF NOT EXISTS "ocrStrategy" TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KonnectSettings_ocrStrategy_check'
  ) THEN
    ALTER TABLE "KonnectSettings"
      ADD CONSTRAINT "KonnectSettings_ocrStrategy_check"
      CHECK ("ocrStrategy" IS NULL OR "ocrStrategy" IN ('tesseract_only', 'vision_shadow', 'vision_first'));
  END IF;
END $$;
