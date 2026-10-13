# IYANU-OLUWA Cooperative Management App

A complete, runnable React/Vite cooperative management application for managing members, contributions, member balances, pay-offs/exits, expenses, loans, categories and CSV exports.

## Included functionality

- Administrator sign-in
- Dashboard with cooperative activity summary
- Member registration
- Automatic membership IDs
- Active / Inactive / All member filtering
- Member search and profile view
- Member contribution balances by category
- New member → first payment workflow
- Multiple payment-category breakdowns
- Cash and bank-transfer recording
- Loan creation and repayment tracking
- Outstanding-loan protection during member exit
- Member Pay-Off / Exit workflow
- Pay-Off transaction + Membership Withdrawal expense
- Automatic inactive status when a member reaches zero balance and has no outstanding loan
- Expense recording
- Category totals
- Filtered Excel (.xlsx) and CSV exports for members, transactions, expenses and combined records
- Member withdrawals: this-month and all-time dashboard totals
- Staff account creation with granular permission checkboxes
- Staff data ownership and Super Admin filtering by own records, individual staff member, or all users
- Activity log for member, payment, expense, loan, payoff and staff actions
- Payment form ordered as member, date, method, total, then category breakdown; breakdown must match the total
- SMS receipt preference toggle (default on) saved with each payment; a provider integration is still required to send actual SMS
- Browser persistence using localStorage
- Responsive desktop/mobile interface

## Administrator access

**Username:** `admin`  
**Password:** `REDACTED`

The first Super Admin account is seeded in browser data. Change the default password and migrate authentication to a secure server-side implementation before real-world use.

## Run the application

Requirements: Node.js 18+ recommended.

```bash
npm install
npm run dev
```

Open the URL shown by Vite, normally:

```text
http://localhost:5173
```

## Production build

```bash
npm run build
npm run preview
```

## Important security and deployment note

This ZIP is the React/Vite browser-based project supplied for this update, not a Next.js/Prisma application. The added staff login and permission checks are a **prototype-level convenience only**: users, passwords, permissions, activity, and cooperative records are stored in browser `localStorage`. They are not server-enforced, encrypted, or shared across devices, and must not be treated as secure authorization for real financial records. Before public or multi-device production use, migrate these features to server-side authentication, a database, hashed passwords, API-level authorization, and audited server-side transactions. SMS receipt preferences are stored, but actual SMS delivery requires an SMS provider and server integration.

Operational data persists in the browser's localStorage, so it survives refreshes and browser restarts on the same device/browser.

It is not yet a multi-user server/database system. For deployment where multiple administrators/devices must share one authoritative database, the same business rules should be moved to a server API and database with authenticated sessions and atomic financial transactions.

## Reset test data

The app initializes with sample members, transactions, a sample outstanding loan, expenses and one inactive paid-off member. To reset the browser back to the original demo state, remove the site's localStorage key:

```text
iyanu_oluwa_react_v2
```

or clear the site's browser storage.
