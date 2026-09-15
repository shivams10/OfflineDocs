-- CreateTable
CREATE TABLE "DocDraft" (
    "docId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "update" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocDraft_pkey" PRIMARY KEY ("docId","userId")
);

-- CreateTable
CREATE TABLE "DocPresence" (
    "docId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocPresence_pkey" PRIMARY KEY ("docId","userId")
);

-- CreateIndex
CREATE INDEX "DocDraft_userId_idx" ON "DocDraft"("userId");

-- CreateIndex
CREATE INDEX "DocPresence_docId_lastSeenAt_idx" ON "DocPresence"("docId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "DocDraft" ADD CONSTRAINT "DocDraft_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocDraft" ADD CONSTRAINT "DocDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocPresence" ADD CONSTRAINT "DocPresence_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocPresence" ADD CONSTRAINT "DocPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
