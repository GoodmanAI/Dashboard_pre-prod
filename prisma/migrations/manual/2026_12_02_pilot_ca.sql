-- Réel mensuel figé (incrément J). Une ligne par mois, organisation, produit et
-- centre, jamais réécrite après figeLe (C-16). Aucun type neuf : le fichier
-- n'emploie que CrmUniteVariable, posé par 2026_10_26_crm_pilot.sql.
CREATE TABLE IF NOT EXISTS "CrmCaMensuel" (
  "id" SERIAL NOT NULL,
  "mois" TIMESTAMP(3) NOT NULL,
  "organisationId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "centreId" INTEGER,
  "recurrentCentimes" INTEGER NOT NULL DEFAULT 0,
  "variableCentimes" INTEGER NOT NULL DEFAULT 0,
  "miseEnServiceCentimes" INTEGER NOT NULL DEFAULT 0,
  "volumeVariable" INTEGER,
  "uniteVariable" "CrmUniteVariable",
  "figeLe" TIMESTAMP(3) NOT NULL,
  "cle" TEXT NOT NULL,
  CONSTRAINT "CrmCaMensuel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmCaMensuel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmCaMensuel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmCaMensuel_cle_key" ON "CrmCaMensuel"("cle");
CREATE INDEX IF NOT EXISTS "CrmCaMensuel_mois_idx" ON "CrmCaMensuel"("mois");
CREATE INDEX IF NOT EXISTS "CrmCaMensuel_organisationId_mois_idx" ON "CrmCaMensuel"("organisationId", "mois");
