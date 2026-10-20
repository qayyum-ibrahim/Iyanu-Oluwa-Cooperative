# Data model
Last updated: step 4.5. Schema file: `server/prisma/schema.prisma`. Database: SQLite for development (A-04).

## Conventions
- Money columns: `BigInt`, whole kobo (D-15).
- Timestamps: UTC. Business dates and month boundaries use Africa/Lagos (D-16).
- IDs: UUID strings.
- Balances are never stored. They are derived from append-only lines (D-17).
- Audit log rows and payments are only ever added. No update or delete code is planned.
- Never put passwords, secrets, tokens, idempotency keys or personal data in `AuditLog.detail`.

## Tables
| Table | Key fields | Notes |
|---|---|---|
| User | id, email (unique), passwordHash, displayName, role (SUPER_ADMIN or STAFF), isActive, failedLoginCount, lockedUntil, permissions | Lockout fields added in 2.3e (D-30); read them with `getLockout`. `permissions` (2.5b, D-34) is JSON text of permission names, used by Staff only; it is part of `UserRecord`. |
| AuditLog | id, createdAt, actorId (nullable), action, entityType, entityId, detail | Actor is empty for system or setup-script actions. A user with audit rows cannot be deleted (DR-15). |
| RefreshToken | id, userId, familyId, tokenHash (unique), createdAt, expiresAt, usedAt, revokedAt | Only the SHA-256 hash is stored (A-33). One family per sign-in, shared by its rotations. Deleted with its user (D-28). |
| Member | id, seq (unique), fullName, phone, address, occupation, status (ACTIVE or INACTIVE), createdById, createdAt | Step 3.1, D-40. The Membership ID (`IO-001`) is made from `seq` and is not stored as text. `createdById` is the user who recorded the member (DR-13, DR-15); a user with members cannot be deleted. Personal data (A-05): fictional data only (D-08). Phone, address and occupation are empty text when not given. |
| Payment | id, memberId, method (CASH or BANK_TRANSFER), totalKobo (BigInt), idempotencyKey (nullable), requestHash (nullable), createdById, createdAt | Step 4.2, D-44; key columns added in 4.5 (D-48). Append-only. Unique on (createdById, idempotencyKey); old rows and any payment saved without a key have both columns empty. A member or user with payments cannot be deleted. |
| PaymentLine | id, paymentId, position, category (text), amountKobo (BigInt) | Step 4.2. Unique on (paymentId, position). The lines add up to the payment total; the logic code checks it (DR-02). |

## Not yet modelled
Loans, expenses, balances. See PHASE_PLAN.md.