# Open questions
"Needed by" is the phase that cannot finish without an answer.

| ID | Question | Who answers | Needed by | Default until answered |
|---|---|---|---|---|
| OQ-00 | Mr. Aro to sign off the money rules in DOMAIN_RULES with real figures | Owner / Mr. Aro | Phase 6 | Rules stay "proposed" |
| OQ-01 | Where is it hosted, who runs it, and which production database? | Owner | Phase 10 | SQLite for dev only |
| OQ-02 | Owner's email for the Super Admin account | Owner | Phase 2 | Entered when the setup script runs. Never in git. |
| OQ-03 | Owner's OS and Node version. Answered 2026-10-13: macOS, Node v22.14.0, npm 11.21.0 | Owner | Closed | n/a |
| OQ-04 | Deadline, definition of done, credit situation | Owner | Phase 1 | Lean mode, no deadline |
| OQ-05 | SMS message text. Provider answered 2026-10-20: Twilio, real adapter after the fake is wired (D-49). | Owner | Phase 4 | Fake adapter, placeholder text |
| OQ-06 | Can a member be paid off while holding an active loan? | Owner | Phase 6 | No. Blocked (as in the ZIP). |
| OQ-07 | Can an Inactive member be reactivated? By whom? | Owner | Phase 6 | No reactivation feature |
| OQ-08 | Who may edit an expense, and must old values be kept? | Owner | Phase 5 | Edits allowed with permission; old values go in the audit log |
| OQ-09 | Can staff pick members created by other staff when recording a payment? Answered 2026-10-17: no, own members only. | Owner | Closed | n/a |
| OQ-10 | Can a pay-off be reversed or corrected? | Owner | Phase 6 | No. A correction is a new reversing entry. |
| OQ-11 | Does Total Expenditures include Member Withdrawal outflows? Does Income include Loan Repaid and Loan Interest? | Owner | Phase 7 | Expenditure includes all non-deleted outflows. Income includes all payment lines. |
| OQ-12 | Any real data in anyone's browser (`iyanu_oluwa_react_v2`)? | Owner | Phase 10 | No real data |
| OQ-13 | Final staff permission list. Answered 2026-10-16: the default (the 22 permissions in `permissions.ts`) | Owner | Closed | n/a |
| OQ-14 | Are non-refundable balances (e.g. Development Levy) shown on the member profile? Answered 2026-10-17: yes, under "Retained by cooperative", not counted in payout. | Owner | Closed | n/a |
| OQ-15 | Change-password design. Answered 2026-10-16: the default below (accepted by the owner). Built in 2.5d (D-36) and 2.5e (D-38). | Owner | Closed | Proposed default: a signed-in user changes their own password by giving the current one (all their sessions end); the Super Admin sets a new password for a Staff account (their sessions end); a forgotten owner password is reset by a terminal script (2.5e). No email links, no forced change on next sign-in. |
| OQ-16 | Can a loan be edited or deleted after it is given (for example a wrong amount)? If yes, who, and what happens to its Loan expense and repayments? | Owner | Phase 5 | No. No loan edit or delete route (D-54, A-149). |