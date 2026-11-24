-- Deux étapes propres au produit NoShow (CHOIX.md, C-56). Additif et idempotent :
-- les énumérations ne se renomment jamais, on ajoute des valeurs. Le référentiel
-- (mode, produits, durée) vit dans src/lib/checklist/definition.ts (C-05).
--
-- Le produit lui-même est une ligne de la table Product du Dashboard : il n'est
-- jamais créé ici. En local, le seed le pose comme décor.
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'MESSAGES_RAPPEL';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'PREMIER_RAPPEL';
