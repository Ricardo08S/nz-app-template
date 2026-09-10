-- CreateTable
CREATE TABLE "ClassInvitation" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "classRole" "ClassRole" NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "ClassInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassInvitation_classId_username_key" ON "ClassInvitation"("classId", "username");

-- AddForeignKey
ALTER TABLE "ClassInvitation" ADD CONSTRAINT "ClassInvitation_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
