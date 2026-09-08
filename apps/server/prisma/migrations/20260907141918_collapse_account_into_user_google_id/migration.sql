-- Collapse the one-row-per-OAuth-identity `Account` table into a `googleId` column on
-- `User`. Google is the only sign-in provider, so the indirection bought nothing.

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropTable
DROP TABLE "Account";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
