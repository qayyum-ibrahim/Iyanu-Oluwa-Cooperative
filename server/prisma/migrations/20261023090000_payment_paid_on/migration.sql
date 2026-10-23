-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "totalKobo" BIGINT NOT NULL,
    "paidOn" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Edited by hand (step U.4a): rows saved before this step get the day of createdAt in Lagos
-- (UTC+1, no daylight saving). createdAt is ISO 8601 text with its offset, which date() reads.
INSERT INTO "new_Payment" ("createdAt", "createdById", "id", "idempotencyKey", "memberId", "method", "paidOn", "requestHash", "totalKobo") SELECT "createdAt", "createdById", "id", "idempotencyKey", "memberId", "method", date("createdAt", '+1 hour'), "requestHash", "totalKobo" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE INDEX "Payment_memberId_idx" ON "Payment"("memberId");
CREATE INDEX "Payment_createdById_idx" ON "Payment"("createdById");
CREATE UNIQUE INDEX "Payment_createdById_idempotencyKey_key" ON "Payment"("createdById", "idempotencyKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

