# Decisions
Format: ID, date, decision, alternatives, consequences, approved by.

**D-01 (2026-10-13) Architecture.** Keep the React/Vite UI. Add a server API and a database. Alternative: Next.js (rejected). Consequence: the ZIP's localStorage logic is replaced by API calls. Approved: project lead, chat.

**D-02 (2026-10-13) Loans.** One active loan per member. Interest is information only, with no formula. Approved: project lead.

**D-03 (2026-10-13) Loan in expenditure.** A loan is counted once, through its linked Loan expense. Approved: project lead.

**D-04 (2026-10-13) Access.** Super Admin plus permission-based staff. Staff see their own records. Approved: project lead.

**D-05 (2026-10-13) Restricted permissions.** Only the Super Admin can grant loan disbursement and pay-off permissions. Approved: project lead.

**D-06 (2026-10-13) Authentication.** Email and password. The first owner password is set by a setup script. No default password in git. Approved: project lead.

**D-07 (2026-10-13) SMS.** Fake provider behind an interface. Save the payment first, then report any SMS failure separately. Approved: project lead.

**D-08 (2026-10-13) Data.** Fictional data only until all go-live gates pass. Approved: project lead.

**D-09 (2026-10-13) Delivery.** Lean mode. Whole files pasted in chat. Node version checked by command. Approved: project lead.

**D-10 (2026-10-13) Expense deletion.** Soft-deleted expenses leave the totals and stay in the audit log. Loan-linked and pay-off expenses cannot be deleted. Approved: project lead.

**D-11 (2026-10-13) Automatic Inactive.** A member becomes Inactive only if they have payment history, every refundable balance is zero, and they have no active loan. Approved: project lead.

**D-12 (2026-10-13) Refundable categories.** Shares, Savings, Special Savings, Special Deposit, Building Funds. All other categories are not refundable. Building Funds is a new category. Approved: project lead.

**D-13 (2026-10-13) Stack.** Proposed by Claude in the Understanding Report. Accepted when the project lead replied "Understood, start".
Server: TypeScript (strict), Express 5, Prisma with SQLite for development, Zod for input checks, Vitest and Supertest for tests, ESLint, `exceljs` for Excel, `argon2` for passwords. UI: React and Vite.
Looked up on 2026-10-13 from the npm registry (latest tag unless noted). Compatibility is not yet tested. Final pins are set at step 1.2.
typescript 7.0.2, express 5.3.0, @types/express 5.0.6, prisma 7.10.0 (the `prev` tag), @prisma/client 7.10.0, zod 4.6.7, vitest 5.0.4, supertest 7.3.1, eslint 10.12.0, tsx 4.23.15, exceljs 4.4.0, argon2 0.45.1, vite 8.3.4, react 19.3.0, react-dom 19.3.0, @vitejs/plugin-react 6.1.2.
Alternative: Fastify. Reason for Express: common and well known.

**D-14 (2026-10-13) Repo layout.** `docs/`, `legacy-prototype/` (frozen copy of the ZIP, reference only), `web/` (UI, grown from the prototype), `server/`. Two `package.json` files, no workspaces.

**D-15 (2026-10-13) Money.** Whole kobo as `BigInt`. No decimals. Input with more than 2 decimal places is rejected. Nothing is divided, so no rounding rule is needed.

**D-16 (2026-10-13) Time.** Store UTC. Business dates and month boundaries use Africa/Lagos.

**D-17 (2026-10-13) Balances.** Derived from append-only transaction lines. No stored balance. No clamping of negatives; an action that would make a balance negative is rejected. Corrections are reversing entries.

**D-18 (2026-10-13) UI language.** The UI stays JSX for now. The server is strict TypeScript. Converting the UI is "could", not planned.
**D-19 (2026-10-13) Server pins (step 1.2).** D-13 left final pins to step 1.2. Chosen: express 5.3.0, typescript 6.0.3, @types/node 22.20.5, @types/express 5.0.6, @types/supertest 7.2.1, supertest 7.3.1, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, tsx 4.23.15, all exact. TypeScript 6.0.3 replaces the D-13 candidate 7.0.2, because typescript-eslint 8.71.2 accepts only `typescript <6.1.0` (registry lookup, 2026-10-13). Alternative: TypeScript 7.0.2 without a working linter (rejected). Consequence: revisit when typescript-eslint supports TypeScript 7 (A-16). prisma, @prisma/client, zod, exceljs and argon2 are pinned at the step that first uses them. Approved: chosen by Claude as the conventional option under D-13; project lead may overrule.
