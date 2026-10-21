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
- 5.3 (M) Loan table and store (both adapters, shared contract, migration): `memberId`, principal (BigInt kobo), optional interest note (A-146), notes, `createdById`, `createdAt`. Outstanding and status worked out on read (A-144). Done (D-57).
- 5.3b (M) Nullable `PaymentLine.loanId` and a foreign key on `Expense.loanId`, both to `Loan`, with store checks for an unknown loan in both adapters (A-151, A-157). Split from 5.3. Done (D-58).
- 5.3c (S) Break-on-purpose for the loans store, 5.3b and their migrations. Done: 58 of 59 caught (EK7 test gap, A-160).
- 5.4 (M) `POST /loans` (permission `loans.disburse`, A-149): member visible and Active, no active loan; loan, its Loan expense and the audit entry in one transaction (DR-08, DR-10). Done (D-59).
- 5.4c (M) `Idempotency-Key` header on `POST /loans`, as D-48 for payments (D-60). Needs a migration. Added at 5.4 by the owner. Done (D-61).
- 5.4d (S) One break-on-purpose run for 5.4 and 5.4c (owner's choice). Done: 79 of 80 caught (L20, A-164).
- 5.4e (S, proposed at 5.4d) One test for the replay expense lookup (A-164), then rerun L20. Done: L20 caught.
- 5.5 (M) Loan Repaid effect in `createPayment`: lines linked to the active loan; no active loan or more than outstanding is refused (DR-08, DR-09, A-145). Done (D-62).
- 5.5b (S) Break-on-purpose for 5.5 (`payments.ts` Loan Repaid code, the two route codes). Done: 17 of 19 caught (P15, P16 equivalent as tested, A-166).
- 5.6 (S) `GET /loans` and one member's loans, with outstanding and status. Done (D-63): one member only, `memberId` required (A-167).
- 5.6b (S, proposed at 5.6) Break-on-purpose for `listLoans` and `GET /loans`. Done: 30 of 32 caught (G12, R2 equivalent, A-168).
- 5.7 (M) `POST /expenses` (only categories that can be picked by hand). Done (D-64).
- 5.7c (M) `Idempotency-Key` header on `POST /expenses`, as D-61 for loans: nullable `idempotencyKey` and `requestHash` on `Expense`, unique on creator and key, `expenses.findByKey` in both adapters. Needs a migration. Added at 5.7 by the owner (option A). Done (D-65).
- 5.7d (S) One break-on-purpose run for 5.7 and 5.7c. Done: 82 of 84 caught (R10 unreachable, KP2 race only, A-171).
- 5.8 (M) Expense list with filters.
- 5.9 (M) Expense edit (OQ-08 default) and soft-delete (DR-12).
- 5.2b (S) Break-on-purpose for the expenses store and migration. Added at 5.2. Done: 43 of 45 caught.
- 5.2c (S) One contract case for the M16 gap (A-155): a rollback keeps the expenses saved before it. Then rerun `mutate-5.2b.mjs`. Added at 5.2b. Done: 44 of 45 caught.
Exit "totals reconcile" is defined at 5.8.