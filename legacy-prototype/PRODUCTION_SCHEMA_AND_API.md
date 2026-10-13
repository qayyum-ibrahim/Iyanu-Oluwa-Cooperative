# Production Schema & API Changes for the Two New Features

## 1. Prisma schema changes

The current demo stores data in localStorage because the supplied React project does not contain a Prisma backend. For the real Prisma implementation, preserve the current Member, Loan and Expense relations and add transaction typing/lines:

```prisma
model Transaction {
  id        String   @id @default(cuid())
  memberId  String
  date      DateTime
  method    String
  type      String   @default("PAYMENT") // PAYMENT | PAY_OFF
  reason    String?
  createdAt DateTime @default(now())
  member    Member   @relation(fields: [memberId], references: [id])
  lines     TransactionLine[]

  @@index([memberId, date])
  @@index([type])
}

model TransactionLine {
  id            String @id @default(cuid())
  transactionId String
  category      String
  amount        Decimal
  transaction   Transaction @relation(fields: [transactionId], references: [id])

  @@index([transactionId, category])
}

model Member {
  id             String @id @default(cuid())
  membershipId   String @unique
  fullName       String
  phone          String?
  address        String?
  occupation     String?
  status         String   @default("ACTIVE")
  dateJoined     DateTime
  inactiveReason String?
  inactiveDate   DateTime?
  transactions   Transaction[]
  loans          Loan[]
}

model Expense {
  id          String   @id @default(cuid())
  date        DateTime
  category    String
  description String?
  amount      Decimal
  method      String
  memberId    String?
  loanId      String?
  payoff      Boolean  @default(false)
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
}
```

For a stricter design, use Prisma enums for `TransactionType`, `MemberStatus`, payment methods and system categories.

## 2. API routes

Recommended routes:

- `POST /api/members` — create active member
- `GET /api/members?status=ACTIVE|INACTIVE|ALL` — member list/filter
- `GET /api/members/:id` — profile + balances
- `GET /api/members/:id/balances` — category balances
- `POST /api/members/:id/payoff` — atomic pay-off/exit
- `POST /api/transactions` — normal payment or repayment
- `POST /api/loans` — issue loan
- `GET /api/members/:id/loans` — member loan history
- `POST /api/expenses` — record expense

## 3. Pay-off transaction rule

The server should execute pay-off in one database transaction:

1. Lock/read the member's current balances.
2. Reject if the member has an outstanding active loan.
3. Create a `PAY_OFF` transaction with one line for each positive member balance.
4. Create a `Membership Withdrawal` expense for the total pay-off.
5. Set member status to `INACTIVE` with reason `MEMBER_PAYOFF`.
6. Commit everything together; roll back if any step fails.

## 4. Automatic zero-balance rule

Run the zero-balance check after every transaction that can change a member balance. A member is automatically changed to `INACTIVE` only when:

- they have financial transaction history;
- every withdrawable category balance is exactly zero; and
- they have no outstanding active loan.

A newly created member with no transaction history remains ACTIVE so the first-payment workflow can be completed.

## 5. New-member flow

`POST /api/members` should return the created member ID. The frontend then navigates to `/transactions` with the new member preselected, e.g. `/transactions?memberId=<id>&firstPayment=1`.

A secondary `saveWithoutPayment` action can keep the admin on Members.
