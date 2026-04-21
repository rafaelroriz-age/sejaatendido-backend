-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN "appleUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_appleUserId_key" ON "Usuario"("appleUserId");
