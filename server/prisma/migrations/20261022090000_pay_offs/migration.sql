-- CreateTable
CREATE TABLE "PayOff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "totalKobo" BIGINT NOT NULL,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayOff_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayOff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayOffLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payOffId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    CONSTRAINT "PayOffLine_payOffId_fkey" FOREIGN KEY ("payOffId") REFERENCES "PayOff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PayOff_memberId_idx" ON "PayOff"("memberId");

-- CreateIndex
CREATE INDEX "PayOff_createdById_idx" ON "PayOff"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "PayOff_createdById_idempotencyKey_key" ON "PayOff"("createdById", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PayOffLine_payOffId_position_key" ON "PayOffLine"("payOffId", "position");

