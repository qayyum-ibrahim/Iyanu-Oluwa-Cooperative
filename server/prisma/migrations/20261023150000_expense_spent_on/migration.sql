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
    "spentOn" TEXT NOT NULL,
    "loanId" TEXT,
    "payOffId" TEXT,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    CONSTRAINT "Expense_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_payOffId_fkey" FOREIGN KEY ("payOffId") REFERENCES "PayOff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Edited by hand (step U.6a, as U.4a and U.5a): a Loan expense gets its loan's givenOn; every other
-- row saved before this step gets the day of createdAt in Lagos (UTC+1, no daylight saving).
-- createdAt is ISO 8601 text with its offset, which date() reads.
INSERT INTO "new_Expense" ("amountKobo", "category", "createdAt", "createdById", "deletedAt", "deletedById", "description", "id", "idempotencyKey", "loanId", "method", "narration", "payOffId", "requestHash", "spentOn") SELECT "amountKobo", "category", "createdAt", "createdById", "deletedAt", "deletedById", "description", "id", "idempotencyKey", "loanId", "method", "narration", "payOffId", "requestHash", COALESCE((SELECT "givenOn" FROM "Loan" WHERE "Loan"."id" = "Expense"."loanId"), date("createdAt", '+1 hour')) FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_loanId_key" ON "Expense"("loanId");
CREATE UNIQUE INDEX "Expense_payOffId_key" ON "Expense"("payOffId");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");
CREATE INDEX "Expense_createdAt_idx" ON "Expense"("createdAt");
CREATE INDEX "Expense_spentOn_idx" ON "Expense"("spentOn");
CREATE UNIQUE INDEX "Expense_createdById_idempotencyKey_key" ON "Expense"("createdById", "idempotencyKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
