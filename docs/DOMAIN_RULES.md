# Domain rules
Status: **confirmed** (project lead, 2026-10-13), **requested** (Context Memory PDF), **proposed** (Claude, needs confirmation). All money rules need sign-off by Mr. Aro with real figures (OQ-00).

| ID | Rule | Status |
|---|---|---|
| DR-01 | Money is NGN, whole kobo. | proposed (guide) |
| DR-02 | A payment's breakdown lines must add up to the total exactly. ₦20,000 = ₦5,000 + ₦10,000 + ₦5,000 is saved. A breakdown of ₦19,999 is rejected. | requested |
| DR-03 | Refundable categories: Shares, Savings, Special Savings, Special Deposit, Building Funds. All others are not refundable. | confirmed |
| DR-04 | Payment categories: Shares, Savings, Special Savings, Development Levy, Loan Repaid, Loan Interest, Entrance Fee, Stationeries, Empowerment Repaid, Committee Gift, Special Deposit, Investment Repaid, Investment Income, Building Funds (new). "Membership Withdrawal" is system-only and cannot be chosen in a payment. | proposed (from the ZIP plus D-12) |
| DR-05 | Pay-off pays the sum of refundable balances. It creates one PAY_OFF transaction and one Member Withdrawal outflow, in one database transaction. Refundable balances become ₦0. Non-refundable amounts stay on record and are kept by the cooperative. | confirmed (categories); proposed (rest) |
| DR-06 | Pay-off is blocked while the member has an active loan. | proposed (OQ-06) |
| DR-07 | Automatic Inactive: only if the member has payment history, every refundable balance is ₦0, and there is no active loan. Checked on the server inside the same transaction. A new member with no history stays Active. | confirmed |
| DR-08 | Loan: one active per member. Outstanding = principal − repaid. Repayment above outstanding is rejected. At ₦0 outstanding the status becomes Fully Repaid and the loan stays in history. Example: ₦300,000 loan, ₦20,000 repaid → ₦280,000 outstanding. | confirmed (one loan, interest note); requested (example); proposed (rejection) |
| DR-09 | Only "Loan Repaid" lines change a loan. Other lines never do. | requested |
| DR-10 | A loan disbursement creates exactly one linked expense (category Loan). It is counted once in expenditure. | confirmed |
| DR-11 | Expense categories: Loan, Expenses, Allowances, Members Credit, Membership Withdrawal, Asset Purchase, Office Maintenance, Payment to Union, Payment to Apexes, Others (free-text narration). | requested |
| DR-12 | Expense soft-delete removes it from totals and keeps it in the audit log. Loan-linked and pay-off expenses cannot be deleted. | confirmed |
| DR-13 | Staff see only their own records unless the Super Admin grants more. Server enforces this on every query and export. | confirmed |
| DR-14 | Loan disbursement and pay-off permissions can only be granted by the Super Admin. | confirmed |
| DR-15 | The person who records an item is recorded as the actor. | requested |

## Worked example for DR-05 (amounts are made up)
Member balances: Shares ₦12,000, Savings ₦8,000, Special Savings ₦5,000, Development Levy ₦1,000, Entrance Fee ₦2,000.
Payout = ₦12,000 + ₦8,000 + ₦5,000 = **₦25,000**. Development Levy ₦1,000 and Entrance Fee ₦2,000 are not paid out. The refundable balances are now ₦0, so the member becomes Inactive (if no active loan).
Status: categories confirmed by the project lead. The amounts are illustrative. Real figures await Mr. Aro (OQ-00).