-- CreateTable
CREATE TABLE "ClassContentComment" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "classContentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "ClassContentComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassContentComment_classId_classContentId_idx" ON "ClassContentComment"("classId", "classContentId");

-- AddForeignKey
ALTER TABLE "ClassContentComment" ADD CONSTRAINT "ClassContentComment_classId_classContentId_fkey" FOREIGN KEY ("classId", "classContentId") REFERENCES "ClassContent"("classId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassContentComment" ADD CONSTRAINT "ClassContentComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
