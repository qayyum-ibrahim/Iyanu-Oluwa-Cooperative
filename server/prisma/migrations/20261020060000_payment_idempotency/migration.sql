-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN "requestHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_createdById_idempotencyKey_key" ON "Payment"("createdById", "idempotencyKey");