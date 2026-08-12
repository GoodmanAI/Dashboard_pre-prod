/*
  Warnings:

  - You are about to drop the column `attente` on the `LyraeExplainDetails` table. All the data in the column will be lost.
  - You are about to drop the column `borne` on the `LyraeExplainDetails` table. All the data in the column will be lost.
  - You are about to drop the column `examen` on the `LyraeExplainDetails` table. All the data in the column will be lost.
  - You are about to drop the column `rdv` on the `LyraeExplainDetails` table. All the data in the column will be lost.
  - You are about to drop the column `secretaire` on the `LyraeExplainDetails` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "LyraeExplainDetails" DROP COLUMN "attente",
DROP COLUMN "borne",
DROP COLUMN "examen",
DROP COLUMN "rdv",
DROP COLUMN "secretaire",
ADD COLUMN     "metricsByMonth" JSONB NOT NULL DEFAULT '[]';
