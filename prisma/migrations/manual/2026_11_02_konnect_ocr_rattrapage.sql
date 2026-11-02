-- 02/11/2026 : quatrième façon de lire les ordonnances de Konnect, `vision_rattrapage`.
--
-- Konnect C-OCRV2.10 (plan workspace `plans/2026-10-ocr-v2-integration.md`) : nos serveurs
-- (Tesseract) lisent d'abord ; le prestataire vision ne relit que l'ordonnance où aucun
-- examen n'a été reconnu. Choix d'Enzo du 01/11/2026 après le comparatif sur 164
-- ordonnances réelles annotées. La valeur est AJOUTÉE, aucune n'est renommée.
--
-- Additif et idempotent : la contrainte est remplacée par la même, élargie. À passer AVANT
-- le build. Konnect doit être déployé avec sa migration 0102 avant qu'un centre reçoive
-- cette valeur : un Konnect plus ancien la ramène à `tesseract_only` (fail-closed).

ALTER TABLE "KonnectSettings" DROP CONSTRAINT IF EXISTS "KonnectSettings_ocrStrategy_check";
ALTER TABLE "KonnectSettings"
  ADD CONSTRAINT "KonnectSettings_ocrStrategy_check"
  CHECK ("ocrStrategy" IS NULL OR "ocrStrategy" IN ('tesseract_only', 'vision_shadow', 'vision_first', 'vision_rattrapage'));
