-- CreateEnum
CREATE TYPE "ClassAssetType" AS ENUM ('FOLDER', 'FILE');

-- CreateTable
CREATE TABLE "ClassAsset" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "ClassAssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "fileKey" TEXT,

    CONSTRAINT "ClassAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassAsset_classId_parentId_idx" ON "ClassAsset"("classId", "parentId");

-- AddForeignKey
ALTER TABLE "ClassAsset" ADD CONSTRAINT "ClassAsset_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassAsset" ADD CONSTRAINT "ClassAsset_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ClassAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassAsset" ADD CONSTRAINT "ClassAsset_fileKey_fkey" FOREIGN KEY ("fileKey") REFERENCES "File"("key") ON DELETE SET NULL ON UPDATE CASCADE;
