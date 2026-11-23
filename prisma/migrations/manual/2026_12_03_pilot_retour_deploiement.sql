-- Trois étapes de check-list issues du retour client du 05/11/2026 (CHOIX.md,
-- C-52). Additif et idempotent : les énumérations ne se renomment jamais, on
-- ajoute des valeurs. Le référentiel (mode, produits, durée) vit dans
-- src/lib/checklist/definition.ts, pas ici (C-05).
--
-- ALTER TYPE ... ADD VALUE ne doit pas être suivi, dans la même transaction,
-- d'un usage de la nouvelle valeur : ce fichier n'en fait aucun.
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'ACCES_DASHBOARD_ENTRAINEMENT';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'FORMATION_DASHBOARD';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'TEST_CRENEAUX';
