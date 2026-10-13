# Build log (newest first)

## Step 1.1 (size S), 2026-10-13: repo skeleton
**Works (after your check):** `.gitignore`, `web/` and `server/` folders, and `legacy-prototype/` copied from the ZIP folder. The demo password `IYANU@2026` is replaced by `REDACTED` in the copy. The owner confirmed it was never used for a real account (reported by owner).
**Stubbed:** `web/` and `server/` hold only `.gitkeep`.
**Tests:** 0 (none apply).
**Not verified:** the prototype still has not been installed, built or run. Redaction means its demo login no longer works. That is fine, because it is reference only.
**Found along the way:**
1. The 0.2 entry was missing from this log. It is added below, rebuilt from STATUS and the git log.
2. STATUS wording about `NEXT_FILES.txt` was unclear. Fixed: files appear under `===== FILE: path =====` headings, and no heading means no files (owner's wording).
3. The snapshot of 2026-10-13 showed no `mm.md` and no modified files, so 0.1c item 4 looks resolved. Owner to confirm.

## Step 0.2 (size S), 2026-10-13: one-command resume routine
**Works:** `scripts/resume-pack.sh` is tracked in git, and the pack attached to the chat after it had STATUS, the log, open questions, assumptions and the snapshot (reported by owner).
**Not verified:** I have not seen the script itself. This entry was rebuilt in step 1.1 from STATUS and the commit messages (`af1a23d`, `0ef4601`).
**Tests:** 0 (none apply).

## Step 0.1c (size S), 2026-10-13: switch test fixes
**Works:** A fresh chat read the resume pack and replied in the required format. It did not invent facts about files it had not seen (reported by owner, verified on your machine).
**Fixed:** STATUS is replaced whole. It now has the correct "Last updated" line, the machine versions and the next steps with sizes. BUILD_LOG is replaced whole, because the entries were out of order in the repo.
**Tests:** 0 (none apply).
**Found along the way:**
1. My mistake: I gave three separate edits for STATUS. One did not apply (git showed 4 deletions, expected 5). The guide says to give such a file whole.
2. `.DS_Store` is untracked. Step 1.1 adds `.gitignore`.
3. The fresh chat could not size step 1.1 because STATUS did not list it. STATUS now lists the next steps.
4. A second fresh chat found BUILD_LOG entries out of order and STATUS showing as modified after commit. It also found an untracked `mm.md` that no doc mentions. Causes are not yet known. Open until the owner answers.

## Step 0.1b (size S), 2026-10-13: machine check
**Works:** `ls docs` on the owner's machine shows all 11 documents (verified on your machine). Node v22.14.0 and npm 11.21.0 reported by owner (verified on your machine).
**Verified in my sandbox:** registry `engines` fields of the D-13 candidates accept Node v22.14.0. Lookup only, no install.
**Not verified:** installs and builds. Whether `argon2` installs on the owner's macOS (A-10).
**Tests:** 0 (none apply).

## Step 0.1 (size M), 2026-10-13: Phase 0 documents
**Works:** 11 documents written. No code.
**Stubbed:** nothing.
**Tests:** 0 (none apply).
**Not verified:** the ZIP app was never installed, built or run by us. Package versions in D-13 are lookups only.

### Found along the way (from reading the ZIP)
1. The ZIP is React/Vite with localStorage. The PDF assumes Next.js, Prisma and an existing SMS integration. Neither the stack nor the SMS code exists.
2. Seed data: member `m2` has a ₦4,000 "Loan Repaid" payment but no loan exists for `m2`.
3. Auto-Inactive runs in a UI effect, not in an atomic transaction. Balances are clamped at zero, which can hide negative values.
4. The pay-off button is hidden (not disabled with a reason) when the member has an active loan or zero balance.
5. "Today" is taken from the UTC date, not Lagos time.
6. Payment and loan dropdowns list only members the user created (the visibility filter applies to members).
7. Passwords are plaintext in localStorage. The default login is printed on the login screen and in the README.
8. Money uses JavaScript numbers with a 0.01 tolerance.
9. All dependencies in the ZIP use `latest`. No tests, no lint, no check script.
10. `PRODUCTION_SCHEMA_AND_API.md` uses `Decimal` money and has no users, actors or audit.
11. npm: Prisma CLI `latest` is a release candidate (8.0.0-rc.22); the client `latest` is 7.10.0. We chose the 7.10.0 pair.
12. The first `npm view typescript version` call returned only a notice. A second call gave 7.0.2.