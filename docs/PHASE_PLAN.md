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