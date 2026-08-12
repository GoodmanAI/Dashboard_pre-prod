-- CreateEnum
CREATE TYPE "CallIntent" AS ENUM ('RDV', 'INFO', 'URGENCE', 'ANNULATION', 'CONSULTATION');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('COMPLETED', 'ABANDONED', 'TRANSFERRED');

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "durationSec" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "intentCode" "CallIntent",
ADD COLUMN     "status" "CallStatus" NOT NULL DEFAULT 'COMPLETED';
