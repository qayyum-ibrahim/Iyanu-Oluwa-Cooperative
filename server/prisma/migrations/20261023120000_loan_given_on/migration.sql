-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "principalKobo" BIGINT NOT NULL,
    "interestNote" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "givenOn" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Loan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Loan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Edited by hand (step U.5a, as U.4a): rows saved before this step get the day of createdAt in
-- Lagos (UTC+1, no daylight saving). createdAt is ISO 8601 text with its offset, which date() reads.
INSERT INTO "new_Loan" ("createdAt", "createdById", "givenOn", "id", "idempotencyKey", "interestNote", "memberId", "notes", "principalKobo", "requestHash") SELECT "createdAt", "createdById", date("createdAt", '+1 hour'), "id", "idempotencyKey", "interestNote", "memberId", "notes", "principalKobo", "requestHash" FROM "Loan";
DROP TABLE "Loan";
ALTER TABLE "new_Loan" RENAME TO "Loan";
CREATE INDEX "Loan_memberId_idx" ON "Loan"("memberId");
CREATE INDEX "Loan_createdById_idx" ON "Loan"("createdById");
CREATE UNIQUE INDEX "Loan_createdById_idempotencyKey_key" ON "Loan"("createdById", "idempotencyKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
