-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
ALTER TYPE "user_role" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "stations" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "updated_by" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" "user_status" NOT NULL DEFAULT 'ACTIVE';

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
