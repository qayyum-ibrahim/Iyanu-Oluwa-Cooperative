# Traceability
Source: PDF = Context Memory PDF section. Owner = chat 2026-10-13. Test column fills in as tests are written.

| ID | Requirement | Source | Phase | Screen | Test | Status |
|---|---|---|---|---|---|---|
| R-01 | Add member, auto Membership ID | PDF §5 | 3 | Members | TBD | Prototype only |
| R-02 | Active/Inactive/All filter; Active default; inactive searchable | PDF §5 | 3 | Members | TBD | Prototype only |
| R-03 | New member goes to Record Payment; "Save without payment" | PDF §6 | 4 | Members, Payments | TBD | Prototype only |
| R-04 | Payment form field order | PDF §6 | 4 | Payments | TBD | Prototype only |
| R-05 | Breakdown equals total exactly | PDF §6, §13 | 4 | Payments | TBD | Prototype only |
| R-06 | SMS toggle on by default; button labels; failure reported, no duplicate | PDF §6 | 4 | Payments | TBD | Prototype (no SMS) |
| R-07 | Loan Repaid reduces outstanding; no over-repayment | PDF §6, §7 | 4 | Payments, Loans | TBD | Prototype only |
| R-08 | Loan creation, one active, On Loan badge, Fully Repaid | PDF §7, D-02 | 5 | Loans, Members | TBD | Prototype only |
| R-09 | Loan expense counted once | PDF §4, D-03 | 5 | Loans, Expenses | TBD | Prototype only |
| R-10 | Expense categories and fields (reference, attachment note, Others text) | PDF §8 | 5 | Expenses | TBD | Partly in prototype |
| R-11 | Expense table, filters, edit, soft-delete | PDF §8, D-10 | 5 | Expenses | TBD | Missing |
| R-12 | Pay-off: confirmation shows refundable balances; atomic; no double submit | PDF §5, D-12 | 6 | Member detail | TBD | Prototype only |
| R-13 | Pay-off button only in member detail, at the bottom | PDF §5 | 6 | Member detail | TBD | Prototype only |
| R-14 | Automatic Inactive rule | D-11 | 6 | Members | TBD | Prototype (different rule) |
| R-15 | Dashboard: income and expenditure cards, month and all time, recent expenses | PDF §8, §9 | 7 | Dashboard | TBD | Partly in prototype |
| R-16 | Member Withdrawal card (month, all time) | PDF §9 | 7 | Dashboard | TBD | Prototype only |
| R-17 | Totals match lists and exports; Lagos month-end tested | PDF §9 | 7 | Dashboard | TBD | Missing |
| R-18 | Email + password login; owner from setup script | D-06, D-24, D-26, D-30, D-31 | 2 | Login | test/password.test.ts (14), test/email.test.ts (17), test/owner.test.ts (10), test/store-contract (hasSuperAdmin, refresh tokens, lockout), test/auth.test.ts (31), test/tokens.test.ts (74), test/sessions.test.ts (38), test/lockout.test.ts (11), test/auth-routes.test.ts (25) | Hashing, email rules, owner creation (2.1a, 2.1b), sign-in logic (2.3a), access tokens (2.3b), refresh-token storage (2.3c), session logic (2.3d) and lockout (2.3e) done and verified on owner's machine. Routes done and verified on the owner machine (2.4a, memory store); served by the running server and live-checked on the owner machine (2.4b, 12 of 12). Login screen missing. |
| R-19 | Staff accounts, deny-by-default permissions, server-side | PDF §10, D-04, D-25, D-33, D-34 | 2 | Staff & Access | test/permissions.test.ts (38), test/guards.test.ts (64), test/auth-me.test.ts (8), test/staff.test.ts (29), test/staff-routes.test.ts (24), test/helpers/permissions-contract.ts (9 per adapter) | Permission table and guards verified on owner's machine (2.2a, 2.5a). Stored permission lists, create and list staff, change permissions written in 2.5b, not verified until you run the checks. No data route uses a guard yet. No deactivate or password change. |
| R-20 | Staff data scope; Super Admin filter | PDF §10, D-04 | 2-7 | All lists | TBD | Client-only |
| R-21 | Restricted permissions granted only by Super Admin | D-05, DR-14 | 2 | Staff & Access | test/permissions.test.ts (canGrant, normalizeStaffGrants), test/staff.test.ts (DR-14 cases), test/staff-routes.test.ts | Rule in logic (2.2a) and enforced on the `/staff` routes (2.5b, not verified yet) |
| R-22 | Activity log of key actions | PDF §12 | 2-8 | Staff & Access | test/db.test.ts, test/store-contract (audit), test/owner.test.ts (owner.setup entry), test/auth.test.ts (login entries), test/auth-routes.test.ts (login.success entry) | Table and store interface exist; `owner.setup`, `login.success` and `login.failure` are written. No way yet to list entries with no actor. |
| R-23 | Excel exports: members, transactions, expenses, combined cashflow, single category | PDF §11 | 8 | Export | TBD | Partial |
| R-24 | Atomic writes; actor on every record | PDF §4 | 1-6 | n/a | test/db.test.ts, test/store-contract (audit actor), test/owner.test.ts (actor), test/auth.test.ts (actor) | Audit actor only; other records later |
| R-26 | Fake SMS adapter behind an interface | D-07 | 4 | Payments | TBD | Missing |
| R-27 | Money as whole kobo | D-15 | 1 | n/a | test/money.test.ts (47) | Module done (1.3); no money column yet |
| R-28 | Add "Building Funds" category | D-12 | 3-4 | Payments | TBD | Missing |