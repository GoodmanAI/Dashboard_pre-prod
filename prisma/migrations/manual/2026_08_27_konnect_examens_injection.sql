-- Migration manuelle : code RIS avec injection sur le mapping d'examens Konnect
--
-- Lot C, troisieme ticket. Le mapping portait un seul code RIS par examen. Le
-- portail en a besoin de deux quand l'examen existe en version injectee : le RIS
-- distingue « IRM du genou » et « IRM du genou avec injection » par deux codes.
--
-- LyraeTalk a exactement le meme champ, `codeExamenClientInject` dans
-- TalkSettings.exams : ce n'est pas une specificite de Konnect, c'est une realite
-- des RIS que le mapping de Konnect ne portait pas encore.
--
-- Nullable : la plupart des examens n'ont pas de variante injectee, et forcer une
-- valeur obligerait a inventer un code.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE "KonnectExamens"
  ADD COLUMN IF NOT EXISTS "codeExamenInjection" text NOT NULL DEFAULT '';
