/*
  Warnings:

  - The `provider` column on the `Account` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Account" DROP COLUMN "provider",
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'google';

-- DropEnum
DROP TYPE "AuthProvider";

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerUserId_key" ON "Account"("provider", "providerUserId");
