# Phase plan (may change)
Sizes: S one change, M several files, L split it. You say "continue" to start each phase.

| Phase | Scope | Exit evidence |
|---|---|---|
| 0 | Intake, gate, these documents | You commit the docs |
| 1 | Foundation: repo layout, move prototype to `legacy-prototype/`, server skeleton, `npm run check`, money module (kobo), database setup, in-memory test adapter | Check passes. Live check: server health route answers. |
| 2 | Sign-in, setup script for owner, permission table, staff accounts, audit log | Role × permission test passes. Live login works. |
| 3 | Members, Building Funds category, derived balances | Tests pass. Live check on Members screen. |
| 4 | Payments, breakdown check, Loan Repaid, SMS interface with fake provider, first-payment flow | Tests pass. Live payment recorded. |
| 5 | Loans and expenses (filters, edit, soft-delete, link) | Tests pass. Totals reconcile. |
| 6 | Pay-off and automatic Inactive. Needs OQ-00, OQ-06, OQ-07. | Worked examples confirmed by owner. |
| 7 | Dashboard and reports; Lagos month-end tests | Totals match lists |
| 8 | Excel exports | Files open as .xlsx; filters and permissions verified |
| 9 | Hardening: security review, backups, accessibility | Review items closed |
| 10 | Release: acceptance sign-off, go-live checklist, parallel running | Checklist passed |

## Phase 1 steps (first look)
- 1.1 (S) Repo skeleton and `legacy-prototype/` copy. Needs your `node -v; npm -v`.
- 1.2 (M) Server skeleton, pinned versions, `npm run check`.
- 1.3 (S) Money module with tests.
- 1.4 (M) Database schema (users, audit) and migration.
- 1.5 (S) In-memory adapter for tests.

## Phase 5 steps (planned at 5.0, D-54)
Phase 4 leftovers: the Loan Repaid effect moves here (5.5). The first-payment flow waits for the screens. Each money step is followed by a break-on-purpose step. An M step may split when it starts. Steps with a migration need the owner's word before `migrate`.
- 5.1 (S) `server/src/expense-categories.ts`: the DR-11 list; "Loan" and "Membership Withdrawal" system-only (A-148). Pure logic and tests.
- 5.1b (S) Start the server with `node --import tsx` (D-56, A-153). Added at 5.2 after a start-up test failed. Done.
- 5.2 (M) Expense table and store (both adapters, shared contract, migration): category, amount (BigInt kobo), method, description, "Others" narration, optional unique `loanId`, `createdById`, `createdAt`, `deletedAt`, `deletedById`.
- 5.3 (M) Loan table and store (both adapters, shared contract, migration): `memberId`, principal (BigInt kobo), optional interest note (A-146), notes, `createdById`, `createdAt`. Plus nullable `PaymentLine.loanId`. Outstanding and status worked out on read (A-144).
- 5.4 (M) `POST /loans` (permission `loans.disburse`, A-149): member visible and Active, no active loan; loan, its Loan expense and the audit entry in one transaction (DR-08, DR-10).
- 5.5 (M) Loan Repaid effect in `createPayment`: lines linked to the active loan; no active loan or more than outstanding is refused (DR-08, DR-09, A-145).
- 5.6 (S) `GET /loans` and one member's loans, with outstanding and status.
- 5.7 (M) `POST /expenses` (only categories that can be picked by hand).
- 5.8 (M) Expense list with filters.
- 5.9 (M) Expense edit (OQ-08 default) and soft-delete (DR-12).
- 5.2b (S) Break-on-purpose for the expenses store and migration. Added at 5.2. Done: 43 of 45 caught.
- 5.2c (S) One contract case for the M16 gap (A-155): a rollback keeps the expenses saved before it. Then rerun `mutate-5.2b.mjs`. Added at 5.2b.
Exit "totals reconcile" is defined at 5.8.