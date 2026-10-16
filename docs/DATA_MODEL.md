# Data model
Last updated: step 2.5b. Schema file: `server/prisma/schema.prisma`. Database: SQLite for development (A-04).

## Conventions
- Money columns: `BigInt`, whole kobo (D-15). None exist yet.
- Timestamps: UTC. Business dates and month boundaries use Africa/Lagos (D-16).
- IDs: UUID strings.
- Balances are never stored. They are derived from append-only lines (D-17).
- Audit log rows are only ever added. No update or delete code is planned.
- Never put passwords, secrets, tokens or personal data in `AuditLog.detail`.

## Tables
| Table | Key fields | Notes |
|---|---|---|
| User | id, email (unique), passwordHash, displayName, role (SUPER_ADMIN or STAFF), isActive, failedLoginCount, lockedUntil, permissions | Lockout fields added in 2.3e (D-30); read them with `getLockout`. `permissions` (2.5b, D-34) is JSON text of permission names, used by Staff only; it is part of `UserRecord`. |
| AuditLog | id, createdAt, actorId (nullable), action, entityType, entityId, detail | Actor is empty for system or setup-script actions. A user with audit rows cannot be deleted (DR-15). |
| RefreshToken | id, userId, familyId, tokenHash (unique), createdAt, expiresAt, usedAt, revokedAt | Only the SHA-256 hash is stored (A-33). One family per sign-in, shared by its rotations. Deleted with its user (D-28). |

## Not yet modelled
Members, payments, loans, expenses. See PHASE_PLAN.md.