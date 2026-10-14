# Build log (newest first)

## Step 1.5 (size S), 2026-10-14: in-memory adapter and store interface
**Works (verified on your machine, output pasted):** `npm run check` passes: generate, typecheck, lint, 5 test files, 79 tests (money 47, health 3, memory-store 11, prisma-store 11, db 7). The Prisma adapter passes the 11 shared tests on a real SQLite file built by the real migration. Committed `6ddf251` and pushed (output pasted).
**Also verified in my sandbox (Node v22.22.0):** the same 11 tests on both adapters (Prisma on hand-made tables). 10 deliberate bugs, each caught: duplicate check removed (1 test failed), unknown actor allowed (1), no copy returned (1), list ignores actor (1, memory), default role wrong (2), email compared ignoring case (1), duplicate error not mapped (1), unknown-actor error not mapped (1), list ignores actor (1, Prisma), role never saved (1). Code restored, 22 pass.
**Stubbed:** nothing writes to the store from a route.
**Tests:** 22 new (11 per adapter). Total 79.
**Not verified:** a break-on-purpose run on your machine (not needed for the step).
**Found along the way:**
1. Email case sensitivity is undecided (A-21).
2. `listByActor` order is not guaranteed.
3. `prisma generate` runs in my sandbox when `PRISMA_SCHEMA_ENGINE_BINARY` points at a stand-in file. Only `migrate` needs the real engine.
4. `test/db.test.ts` and `test/helpers/temp-db.ts` repeat setup code (left as is).
5. My mistake: I did not update `docs/NEXT_FILES.txt` in steps 1.4 and 1.5, so a new chat received no code files. Fixed: every step ends with the new `NEXT_FILES.txt` contents.
6. My mistake: STATUS was given as partial edits in step 1.5. It is now given whole.

## Step 1.4 (size M), 2026-10-14: database schema, first migration
**Works (verified on your machine, output pasted):** `npm install` (166 added, 394 audited), `prisma migrate dev --name init` created and applied `20261014160109_init`, `npm run check` passes: generate, typecheck, lint, 3 test files, 57 tests (50 old + 7 new). `.tables` lists AuditLog, User, _prisma_migrations. Also verified in my sandbox (Node v22.22.0, npm 10.9.4 and 11.21.0): exact-pinned install of prisma, @prisma/client, @prisma/adapter-better-sqlite3 and dotenv, and the SQLite driver storing 99999999999999 and 9223372036854775807 exactly.
**Stubbed:** nothing writes to `AuditLog`. No route uses the database.
**Tests:** 7 new in `server/test/db.test.ts` (default role and status, duplicate email, audit actor read back, audit with no actor, unknown actor rejected, user with audit rows cannot be deleted, INTEGER holds the A-17 cap and 2^63−1).
**Not verified:** no break-on-purpose run (Prisma cannot run in my sandbox: engine download blocked, 403). The BigInt check used a raw INTEGER column, not a Prisma BigInt model field.
**Found along the way:**
1. The first run failed because `prisma.config.ts` was in the wrong folder. Prisma then reported "datasource.url property is required". Signal: the line `Loaded Prisma config from prisma.config.ts.` was missing. After the owner moved the file into `server/`, everything passed.
2. `npm audit` shows 4 high findings, all through the Prisma CLI's own dependencies (A-20).
3. npm 11.21.0 prints an `install-scripts` warning for 5 packages. It had no effect on build or tests.
4. The Prisma SQLite docs page does not say an adapter is required. We use one (D-20).
5. TRACEABILITY.md was seen and updated for the first time. DEV_SETUP.md has not been seen, so it is not updated for the new commands.

## Step 1.3 (size S), 2026-10-14: money module
**Works (verified in my sandbox; your check pending):** `server/src/money.ts` with `parseNaira`, `formatNaira`, `sumKobo`, `MoneyError` and the `Kobo` type (D-15, DR-01, DR-02 sum). `npm run check` passes: typecheck, lint, 2 test files, 50 tests. A live run printed `₦20,000.50`, `₦20,000.00` and the rejection message for `"1.234"`. Sandbox: Node v22.22.0, npm 10.9.4.
**Stubbed:** nothing in the module. No route, database column or screen uses it yet.
**Tests:** 47 new in `server/test/money.test.ts` (valid input 10, invalid text 17, non-string input 6, format 9, round trip 1, sum 4). Total 50.
**Break on purpose (sandbox):** 10 deliberate bugs, each caught by failing tests: 3 decimals allowed (2 failed), padding on the wrong side (2), cap removed (1), format loses kobo padding (6), sum skips first value (2), minus sign accepted (1), format loses minus sign (1), numbers converted to text (3), wrong divisor in format (8), spaces trimmed (2). Code restored, 50 pass.
**Not verified:** anything on the owner's machine (Node v22.14.0, npm 11.21.0). Whether the database column accepts the largest allowed amount (A-03, step 1.4).
**Found along the way:**
1. The ZIP used JavaScript numbers with a 0.01 tolerance (step 0.1 item 8). The new tests pin exact sums with no tolerance, and `0.1 + 0.2` equals `0.3`.
2. `JSON.stringify` throws "Do not know how to serialize a BigInt" (checked in my sandbox, Node v22.22.0). So amounts must cross the API as strings (A-18). Phase 4 must follow this.
3. My first live-check command failed: `tsx -e` runs the code as CommonJS, so `import` did not work. The command given to the owner uses `import()` and printed the expected lines in my sandbox.
4. Claude has not seen TRACEABILITY.md, so it was not updated for steps 1.2 and 1.3. The owner is asked to paste it.

## Step 1.2 (size M), 2026-10-13: server skeleton
**Works (verified on your machine, outputs pasted):** `server/` with Express 5.3.0, strict TypeScript 6.0.3, ESLint, Vitest and Supertest. The test run passed (3 of 3). `GET /health` answered 200 with `{"status":"ok"}` and no `X-Powered-By` header. `npm install` added 227 packages with 0 vulnerabilities. Committed and pushed as `272e2b4` (reported by owner). Also verified in my sandbox: typecheck, lint, tests and a live run (Node v22.22.0, npm 10.9.4).
**Stubbed:** no database, auth or other routes. `web/` is still empty.
**Tests:** 3 (health route: 200 and body, no `x-powered-by` header, 404 on unknown route). No break-on-purpose run, because the step has no security, money or data code.
**Not verified:** the typecheck and lint stages on the owner's machine (the paste showed only the test summary). Step 1.3 asks for the full output. Prisma, zod, argon2, exceljs and the web packages were not installed.
**Found along the way:**
1. D-13 candidate typescript 7.0.2 conflicts with typescript-eslint 8.71.2, whose registry peer range is `typescript >=4.8.4 <6.1.0`. Pinned 6.0.3 instead (D-19, A-16). I did not test TypeScript 7 itself.
2. The owner's step 1.1 output showed the demo password in 3 files (`preview.html` 2 lines, `README.md` 1 line, `src/App.jsx` 3 lines, 6 lines in all) and none after redaction.
3. TRACEABILITY.md was not in the resume pack and was not changed.
4. `npm install` took 38 minutes on the owner's machine (`audited 228 packages in 38m`, pasted). Cause unknown, probably the network.
5. My expected `git status` output showed `?? server/` as one line. Git listed the new files one by one because `server/.gitkeep` was already tracked. Harmless.

## Step 1.1 (size S), 2026-10-13: repo skeleton
**Works (verified on your machine, outputs pasted):** `.gitignore`, `web/` and `server/` folders, and `legacy-prototype/` copied from the ZIP folder. The demo password `IYANU@2026` is replaced by `REDACTED` in the copy (3 files, 6 lines; second grep found no match). No `node_modules` was copied. `.DS_Store` is ignored. The owner confirmed the password was never used for a real account (reported by owner).
**Stubbed:** `web/` and `server/` held only `.gitkeep`.
**Tests:** 0 (none apply).
**Not verified:** the prototype was never installed, built or run. Its demo login no longer works. That is fine, because it is reference only.
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