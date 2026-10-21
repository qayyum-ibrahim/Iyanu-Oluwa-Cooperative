-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "narration" TEXT NOT NULL DEFAULT '',
    "loanId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    CONSTRAINT "Expense_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amountKobo", "category", "createdAt", "createdById", "deletedAt", "deletedById", "description", "id", "loanId", "method", "narration") SELECT "amountKobo", "category", "createdAt", "createdById", "deletedAt", "deletedById", "description", "id", "loanId", "method", "narration" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_loanId_key" ON "Expense"("loanId");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");
CREATE INDEX "Expense_createdAt_idx" ON "Expense"("createdAt");
CREATE TABLE "new_PaymentLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "loanId" TEXT,
    CONSTRAINT "PaymentLine_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentLine_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PaymentLine" ("amountKobo", "category", "id", "paymentId", "position") SELECT "amountKobo", "category", "id", "paymentId", "position" FROM "PaymentLine";
DROP TABLE "PaymentLine";
ALTER TABLE "new_PaymentLine" RENAME TO "PaymentLine";
CREATE INDEX "PaymentLine_loanId_idx" ON "PaymentLine"("loanId");
CREATE UNIQUE INDEX "PaymentLine_paymentId_position_key" ON "PaymentLine"("paymentId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

