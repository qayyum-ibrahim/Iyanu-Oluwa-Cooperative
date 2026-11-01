# Client testing on the hosted app (step E.9)
Written at step E.9 (D-127, A-313). For the owner, and the parts marked "for the client" to pass on.
Fictional data only (D-08). Never paste an address, password or secret in chat or put it in git.

## 1. Before you hand over (owner)
1. `docs/DEPLOY.md` steps 1 to 9 are done, and the last push to `main` is deployed.
2. SMS stays off: `SMS_PROVIDER` is `fake` on Render. No text message reaches any phone. The payment screen may still say "SMS receipt sent."; that is the fake sender, and nothing is sent (OQ-17).
3. The client signs in with your Super Admin account (D-127). Only one Super Admin can exist.
   - Sign in on the hosted address and open **Change password**. Set a new password for the test only. Do not reuse a password you use anywhere else.
   - Changing the password signs out every other session of that account (each sign-in in place ends within 15 minutes).
   - Send the address, your account's email and the test password to the client through a private channel (not a group, not email in plain text if you can avoid it).
4. Tell the client the rules in section 2.

## 2. Rules (for the client)
- Use made-up data only: made-up names, phone numbers and amounts. No real member, no real phone number, no real bank detail.
- The email of any staff account you make can be made up (for example `ade.test@example.com`). The app sends no email.
- Five wrong passwords in a row lock the account for 15 minutes. The Super Admin account is shared with the owner, so a lock stops both of you.
- What you do as the Super Admin shows in the Audit log under the owner's name.
- Everything you enter is deleted when testing ends.
- Text message receipts are switched off for the test. The app may say "SMS receipt sent.", but no message is sent.
- The first page can be slow to open if nobody used the app for a while.

## 3. What to test (for the client)
Tick each line, and report anything that looks wrong, is slow, or is hard to understand. Try it on a computer and on a phone.

**Sign in and staff**
1. Sign in. Open **Change password** (you may look, but do not change it; tell the owner if you want it changed).
2. **Staff & access**: make two staff accounts with made-up names and emails. Give one every right, the other only "View members", "Add members", "View payments" and "Record payments".
3. Sign out and sign in as each staff account. Check that the second one sees only its own pages and only the members it added.
4. As the Super Admin: change a staff account's rights, deactivate it, reactivate it, and set its password.

**Members and money**

5. **Members**: add three members. Search for one. Use the Status filter.
6. Open a member. Record a payment with two or three categories, for example ₦20,000 as Shares ₦5,000, Savings ₦10,000, Development Levy ₦5,000. The parts must add up to the total exactly.
7. Give a member a loan. Record a payment with a "Loan Repaid" line. Check the outstanding amount. Try to repay more than is outstanding (the app should refuse).
8. Pay off a member with no active loan. Check the payout is the sum of Shares, Savings, Special Savings, Special Deposit and Building Funds only, and that the member becomes Inactive. Reactivate the member.
9. **Expenses**: record expenses in a few categories, including "Others" with a note. Edit one. Delete one.

**Reports**

10. **Dashboard**: check the totals against what you entered. Try the date filters.
11. **Categories**: check the totals by category.
12. **Exports**: download one Excel file and one PDF, with more than one kind in one file, and one member's file. Open them and check the figures.
13. **Audit log**: find the actions you did today.

## 4. How to report (for the client)
Send one message per problem to the owner, with:

| Field | Example |
|---|---|
| Date and time | 3 Nov, 10:15 |
| Account | Super Admin, or the staff account's made-up name |
| Device and browser | iPhone, Safari |
| Page | Members, member detail |
| What you did | Recorded ₦20,000 with three parts |
| What you expected | The payment is saved |
| What happened | An error: "..." (copy the words) |
| Screenshot | Yes or no (made-up data only) |

Wishes and ideas are welcome too. Mark them "idea" so they are not mixed with faults.

## 5. When testing ends (owner)
1. Change the Super Admin password again (**Change password**), so the client's sign-in ends.
2. Pass the client's reports to Claude, one step per fault or wish.
3. Before go-live, every row on the hosted database is reset (D-123 item 4). The reset is its own step, with your word, as it deletes data.
