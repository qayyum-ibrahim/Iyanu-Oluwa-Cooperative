# Data model
Last updated: step 1.4. Schema file: `server/prisma/schema.prisma`. Database: SQLite for development (A-04).

## Conventions
- Money columns: `BigInt`, whole kobo (D-15). None exist yet.
- Timestamps: UTC. Business dates and month boundaries use Africa/Lagos (D-16).
- IDs: UUID strings.
- Balances are never stored. They are derived from append-only lines (D-17).
- Audit log rows are only ever added. No update or delete code is planned.
- Never put passwords, secrets or personal data in `AuditLog.detail`.

## Tables (step 1.4)
| Table | Key fields | Notes |
|---|---|---|
| User | id, email (unique), passwordHash, displayName, role (SUPER_ADMIN or STAFF), isActive | Permissions table and sign-in lockout fields arrive in Phase 2 (OQ-13). |
| AuditLog | id, createdAt, actorId (nullable), action, entityType, entityId, detail | Actor is empty for system or setup-script actions. A user with audit rows cannot be deleted (DR-15). |

## Not yet modelled
Members, payments, loans, expenses, permissions, sessions. See PHASE_PLAN.md.