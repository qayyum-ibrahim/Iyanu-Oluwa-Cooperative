-- AlterTable
ALTER TABLE "Loan" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Loan" ADD COLUMN "requestHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Loan_createdById_idempotencyKey_key" ON "Loan"("createdById", "idempotencyKey");
