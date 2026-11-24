-- Lot V : la check-list suit le déroulé réel d'un déploiement (CHOIX.md, C-85),
-- d'après la checklist de déploiement Talk / Konnect du 06/11/2026.
-- Additif et idempotent : les énumérations ne se renomment jamais, on ajoute des
-- valeurs. Le référentiel (phase, mode, produits, durée) vit dans
-- src/lib/checklist/definition.ts, pas ici (C-05).
--
-- ALTER TYPE ... ADD VALUE ne doit pas être suivi, dans la même transaction,
-- d'un usage de la nouvelle valeur : ce fichier n'en fait aucun.

-- Passation
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'PASSATION';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'PRECADRAGE_INTERNE';
-- Cadrage
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'PARCOURS_PATIENT';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'CONTACTS_FACTURATION';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'RESPONSABLE_DESIGNE';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'LISTE_ELEMENTS';
-- Paramétrage et formation
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'REGLES_EXAMENS';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'LECTURE_ORDONNANCE';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'MESSAGES_PATIENTS';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'FORMATION_CONFIRMEE';
-- Go / no-go
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'DATE_DEMARRAGE_CONFIRMEE';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'PV_RECETTE';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'TOP_FACTURATION';
-- Suivi
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'SUIVI_J1';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'SUIVI_S1';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'BILAN_M1';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'ESSAI_VALIDE';

-- Le contact à qui la facturation s'adresse. L'étape CONTACTS_FACTURATION se
-- coche seule dès qu'un contact du compte porte cette mention : une seule vérité.
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "facturation" BOOLEAN NOT NULL DEFAULT false;
