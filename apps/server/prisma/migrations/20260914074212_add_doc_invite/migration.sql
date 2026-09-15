-- CreateTable
CREATE TABLE "DocInvite" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "CollaboratorRole" NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocInvite_email_idx" ON "DocInvite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DocInvite_docId_email_key" ON "DocInvite"("docId", "email");

-- AddForeignKey
ALTER TABLE "DocInvite" ADD CONSTRAINT "DocInvite_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocInvite" ADD CONSTRAINT "DocInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
