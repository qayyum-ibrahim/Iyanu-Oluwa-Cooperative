-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Expense" ADD COLUMN "requestHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Expense_createdById_idempotencyKey_key" ON "Expense"("createdById", "idempotencyKey");
