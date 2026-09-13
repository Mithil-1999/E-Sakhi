-- CreateEnum
CREATE TYPE "coordinate_source" AS ENUM ('EXACT', 'APPROXIMATE', 'UNKNOWN');

-- AlterTable
ALTER TABLE "stations" ADD COLUMN     "coordinate_source" "coordinate_source" NOT NULL DEFAULT 'UNKNOWN';
