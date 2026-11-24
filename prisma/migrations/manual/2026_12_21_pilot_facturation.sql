-- C-95. Additif et idempotent. Aucun modèle miroir Dashboard.
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'FORMATION_POC_CREEE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'FORMATION_POC_PRIX_RENSEIGNE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'FORMATION_POC_FACTURE_EMISE';

CREATE TABLE IF NOT EXISTS "CrmFormationPoc" (
  "organisationId" integer PRIMARY KEY REFERENCES "CrmOrganisation"(id) ON DELETE CASCADE,
  "cycleId" uuid NOT NULL UNIQUE,
  "debuteLe" date NOT NULL,
  "grilleId" integer REFERENCES "CrmGrilleTarifaire"(id) ON DELETE SET NULL,
  "montantCentimes" integer CHECK ("montantCentimes" >= 0),
  "factureEmiseLe" date CHECK ("factureEmiseLe" >= "debuteLe"),
  "comptabiliseeLe" timestamp(3),
  "creeLe" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CrmFormationPoc_debuteLe_idx" ON "CrmFormationPoc"("debuteLe");

-- Reprise du PREMIER POC, courant ou clos, dédupliqué par UUID.
-- Le prix est celui de sa grille historique ; aucune valeur par défaut.
INSERT INTO "CrmFormationPoc" ("organisationId", "cycleId", "debuteLe", "grilleId", "montantCentimes")
SELECT c."organisationId", c.id, c."debuteLe", g.id, t."montantHtCentimes"
FROM (
  SELECT DISTINCT ON ("organisationId") * FROM (
    SELECT "organisationId", id, "debuteLe" FROM "CrmCyclePoc"
    UNION
    SELECT id, "pocCycleId", "pocDebuteLe" FROM "CrmOrganisation" WHERE "pocCycleId" IS NOT NULL AND "pocDebuteLe" IS NOT NULL
  ) cycles ORDER BY "organisationId", "debuteLe", id
) c
LEFT JOIN LATERAL (SELECT id FROM "CrmGrilleTarifaire" WHERE "applicableLe" <= c."debuteLe" ORDER BY "applicableLe" DESC LIMIT 1) g ON true
LEFT JOIN "CrmTarif" t ON t."grilleId" = g.id AND t.code = 'FORMATION_POC' AND t.type = 'PRESTATION' AND t.base = 'PAR_ORGANISATION'
ON CONFLICT ("organisationId") DO NOTHING;

-- Le nouveau rôle est disponible sur la page Tarifs. Une grille passée reste intacte.
-- Le prix métier se saisit dans une nouvelle grille ou sur la formation sans prix.
