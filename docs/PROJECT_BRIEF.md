# Project brief: IYANU-OLUWA Cooperative Management
Confirmed at the Understanding Gate, 2026-10-13. Change this file only when scope changes.

## Purpose
A web app for IYANU-OLUWA Cooperative Multipurpose Society. Client: Mr. Opeyemi Aro. Developer: TeeWise Digital.
It manages members and their category balances, payments, loans, expenses, member pay-off (exit), staff permissions, a dashboard, Excel exports and an activity log. Money is in naira (NGN). Payment methods: Cash and Bank Transfer.

## Users
| Role | Needs |
|---|---|
| Super Admin (owner) | See all data. Manage staff and permissions. Grant loan and pay-off permissions. Filter by own / one user / all users. |
| Staff | Do only what the Super Admin grants. See only their own records by default. |

## Features (must / should / could)
| Rank | Feature |
|---|---|
| Must | Email + password sign-in; server-side permission checks; audit log |
| Must | Members: add, list, Active/Inactive/All filter, profile with balances |
| Must | Payment form with breakdown that equals the total |
| Must | Loans (one active per member) and repayment through "Loan Repaid" |
| Must | Expenses with categories, filters, edit, soft-delete |
| Must | Member pay-off (refundable categories only) and automatic Inactive rule |
| Must | Dashboard: income, expenditure (month and all time), withdrawals, recent expenses |
| Must | Real .xlsx exports, filtered by permission |
| Should | SMS toggle on the payment form, with a fake provider behind an interface |
| Should | New member goes straight to first payment; "Save without payment" |
| Could | Real SMS provider; UI converted to TypeScript; printable receipts |
| Not now | Next.js; real member data; real SMS sending |

## Data
Member names, phones, addresses, occupations (personal data). Balances, loans, payouts (money). No health data. Only fictional data until the go-live gates pass (D-08).

## Constraints
- Keep the existing green and brown design, layout and responsive behaviour.
- Do not remove existing working features.
- Secrets never go in git or chat.
- All sensitive actions are checked on the server.

## Integrations
SMS: fake adapter now. Provider: unknown (OPEN_QUESTIONS OQ-05).

## Out of scope for now
Migration of real data, production hosting, real SMS.