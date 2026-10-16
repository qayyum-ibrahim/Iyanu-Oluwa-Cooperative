# Build log (newest first)

## Step 2.5b (size M), 2026-10-16: staff accounts and stored permissions

**Works (verified on your machine: `db:deploy` applied the migration, `migrate dev` "Already in sync", `npm run check` clean, 18 files, 532 tests; live check "33 passed, 0 failed"; commit 5a1b368; I ran nothing in my sandbox):** `User.permissions` column and migration `20261016120000_user_permissions` (hand-written, like A-36). `UserRecord.permissions`, `NewUser.permissions`, `list()` and `setPermissions()` in the Store and both adapters. `server/src/staff.ts` (`createStaff`, `listStaff`, `setStaffPermissions`), `server/src/staff-routes.ts` (`POST /staff`, `GET /staff`, `PUT /staff/:id/permissions`), mounted in `app.ts`. `subjectOf` in `guards.ts` now reads the stored list. Expected `npm run check`: 18 test files, 532 tests. Expected live check: 33 passed.
**Stubbed:** no deactivate or reactivate staff (A-30), no change-own-password or reset (A-55), no audit viewer. No data route uses a guard yet.
**Tests:** 71 new by my count: `test/helpers/permissions-contract.ts` 9 cases x 2 adapters = 18, `test/staff.test.ts` 29 (createStaff 18, listStaff 3, setStaffPermissions 8), `test/staff-routes.test.ts` 24. Live check gains 14 checks.
**Not verified:** everything. No break-on-purpose run (owed; security code). Whether unseen test files (`auth-routes.test.ts`, `lockout.test.ts`, `tokens.test.ts`) still typecheck with the new `UserRecord` and `Store` shapes.
**Found along the way:**
1. 2.5a is verified on the owner's machine: commit 9f5cc96, 16 files, 461 tests, live check 19 of 19.
2. OQ-13 answered by the owner: the default list. Closed.
3. NEXT_FILES miss: the pack for this chat did not show `auth.ts`, `tokens.ts`, `sessions.ts`, `db.ts` or `server.ts`, so the owner pasted them. Why `NEXT_FILES.txt` lacked them was not seen. The new list is written from the 2.5c brief.
4. The STATUS note "mirror/DECISIONS.md must get D-33" is now out of date; D-34 must be added to the mirror by hand instead.
5. My bug: two tests used `const { permissions: _unused, ...rest }` to drop a key. The lint rule `no-unused-vars` flags it here (no underscore exception in `eslint.config.js`). Fixed by building the object without the key. Found by `npm run check` on the owner's machine (lint stage, 2 errors). Typecheck was clean, so the three unseen test files compile with the new `UserRecord` and `Store` shapes.
6. The 2.5b docs were committed without item 5. Added in the break-on-purpose step.
7. Break-on-purpose run for `staff.ts` and `guards.ts` (owner's machine, one mutation at a time, files restored with `git checkout`): 7 mutations, all caught. S1 mayManage always true (4 failed), S2 Super Admin not refused in setStaffPermissions (1), S3 listStaff includes Super Admin (3), S4 audit action renamed (1), G1 subjectOf ignores stored list (3), G2 permission check disabled (24), G3 inactive user allowed (2). A first run with all 7 applied at once (40 failed) could not show which test caught which, so it was redone one by one. Still owed: `parsePermissions` in `prisma-store.ts` (only the Prisma suite or live check can catch it).

## Step 2.5a (size M), 2026-10-16: route guards and GET /auth/me

**Works (not verified anywhere yet; I ran nothing in this chat):** `server/src/guards.ts`: `requireAuth` (Bearer header, access token check, user loaded from the store on every request, inactive and unknown users refused, one 401 body), `requirePermission` (403, or 401 if no guard ran before it), `getAuth`, `subjectOf`. `GET /auth/me` returns the user (no hash) and the permissions held. `app.ts` unchanged. Expected `npm run check`: 16 test files, 461 tests. Expected live check: 19 passed.
**Stubbed:** Staff hold no permissions (A-49) until 2.5b. No data route uses a guard yet. Failed guard attempts are not audited (A-52). No per-IP limit (A-42).
**Tests:** 72 new by my count: `test/guards.test.ts` 64 (requireAuth 16, requirePermission 48 = 22 Super Admin + 22 Staff + 4), `test/auth-me.test.ts` 8. The live check gains 7 checks.
**Not verified:** everything. No break-on-purpose run (owed; security code). The staff-with-grants case cannot be tested yet (no stored list). Whether `curl -K -` reads headers on stdin on your macOS curl (the live check will show it).
**Found along the way:**
1. 2.4c is verified on the owner's machine: commit 7f44280, `NEXT_FILES` paths all exist, `git status` clean.
2. Access tokens are stateless, so one stays valid until it expires even after sign-out (A-50). Pinned by design, not by a test.
3. `DEV_SETUP.md` was stale about `/auth`. Fixed in this step.

## Step 2.4c (size S), 2026-10-16: fix NEXT_FILES for 2.5a

**Works (not verified: docs only, nothing run):** `docs/NEXT_FILES.txt` replaced. It now lists the 18 paths that step 2.5a changes, imports, or needs to run `npm run check`. STATUS gains handoff rule 2 (write the list for the next step only).
**Tests:** none. Last `npm run check` on the owner's machine: 14 files, 389 tests (2.4b).
**Found along the way:**
1. NEXT_FILES miss: the list was the 2.4b list. It held `server.ts`, `owner.ts`, `schema.prisma` and `store-contract.ts`, which 2.5a does not touch. It lacked `auth.ts`, `sessions.ts`, `tokens.ts`, `store.ts`, `email.ts`, `password.ts`, `package.json`, `tsconfig.json`, `eslint.config.js` and `live-check-auth.sh`. The owner had to paste them. Why it was not rewritten at the end of 2.4b is not known (that message was not seen).
2. The 12 file sections in the 2.4b resume pack matched the old list exactly, so the pack script follows NEXT_FILES.txt.
3. `mirror/DECISIONS.md` was stale (stopped at D-30). The owner updated it with D-31 and D-32. The repo still wins if they differ.
4. Port 3000 was free (`lsof` printed nothing, verified on the owner's machine).
5. `DEV_SETUP.md` still says `/auth` is served "from step 2.4b". Not changed here. It is in the 2.5a list and gets fixed there.

## Step 2.4b (size M), 2026-10-16: serve the auth routes, live check

**Works (verified on your machine: `npm run check` clean, 14 files, 389 tests; `npm run typecheck` clean with the final `server.ts`; live check `sh scripts/live-check-auth.sh` printed "12 passed, 0 failed" against the real server and a real SQLite database; I ran nothing in my sandbox):** `server/src/server.ts` uses the Prisma store and `TOKEN_SECRET`, mounts `/auth`, reports a listen error, and stops cleanly on Ctrl+C. `scripts/live-check-auth.sh` runs 12 checks: health, wrong password, login, refresh, reuse, family revoke, second login, logout, refresh after logout.
**Stubbed:** no route guard, no staff accounts, no per-IP limit (A-42).
**Tests:** none new (389 total). The live check is the evidence.
**Not verified:** no break-on-purpose run (owed for the routes and `server.ts`). Lockout over HTTP beyond the one wrong try. Behaviour on a hosted server.
**Found along the way:**
1. My bug: the first `server.ts` printed "server listening" even when the port was busy, because it ignored the error passed to the `listen` callback. A stale node process held port 3000, so the old server answered and `/auth/login` returned 404. Fixed: it now prints "Could not listen on port N" and sets a failing exit code. Confirmed on your machine: typecheck clean, then "Could not listen" while the port was busy, then success once it was free.
2. The stale server kept coming back after `kill` (PIDs 1193, 90290, 90600). The cause was not shown. It is probably a `tsx watch` or an old tab. The live check passed after it was cleared.
3. The dev database was reset because the owner password was forgotten, and a new owner was created. Dev data is fictional only (D-08), so nothing real was lost. There is still no reset-password feature. If you want one, say so and it becomes a small step with a decision.
4. 2.4a is verified on your machine: 14 files, 389 tests, commit 99cdcab. The 2.4a entry, A-46 and TRACEABILITY R-18 are corrected here.
5. A-48: the server must be started from inside `server/`.

## Step 2.4a (size M), 2026-10-16: auth routes

**Works (verified on your machine: `npm run check` clean, 14 files, 389 tests, commit 99cdcab; I ran nothing in my sandbox):** `server/src/auth-routes.ts` (`POST /auth/login`, `/auth/refresh`, `/auth/logout`), `createApp(deps?)` in `app.ts` with a JSON error handler, `TOKEN_SECRET` name in `.env.example`. Expected `npm run check`: 14 test files, 389 tests.
**Stubbed:** `server.ts` is unchanged, so the running server does not serve `/auth` yet (step 2.4b). No route guard, no staff accounts, no per-IP limit (A-42 stays open).
**Tests:** 25 new in `test/auth-routes.test.ts` by my count (login 14, refresh 6, logout 2, createApp 3).
**Not verified:** break-on-purpose run (owed; security code). Live check (moved to 2.4b).
**Found along the way:**
1. Plan change: 2.4a is routes plus tests on the memory store. The live check moves to 2.4b, because `db.ts`, `prisma-store.ts`, `setup-owner.ts` and `prisma.config.ts` had not been shown.
2. NEXT_FILES miss: the list from 2.3e did not carry `auth.ts`, `store.ts`, `package.json`, `tsconfig.json` or `eslint.config.js`, so you had to paste them. `.env.example` was skipped by the resume script as "looks private" although it held a name only. NEXT_FILES for 2.4b lists what it needs.
3. `TRACEABILITY.md` R-18 was garbled and lacked the 2.3e tests. Fixed. R-25 is still skipped; I do not know what it was.
4. The files listed as "not seen" in STATUS (`sessions.ts`, `tokens.ts`, `email.ts`, `password.ts`, `app.ts`, `DEV_SETUP.md`) have now been seen.
5. `TOKEN_SECRET` is set in your `server/.env` (length 64, reported by you).

## Step 2.3e (size M), 2026-10-15: sign-in lockout

**Works (verified on your machine, output pasted: `migrate deploy` applied the migration, `migrate dev` "Already in sync", `npm run check` clean, 13 files, 364 tests; I ran nothing in my sandbox):** columns `User.failedLoginCount` and `User.lockedUntil`, migration `20261015130000_sign_in_lockout` (hand-written, like A-36). `getLockout`, `recordFailedLogin`, `clearLockout` on `UserStore` and in both adapters. `authenticate` takes an optional `now`, locks after 5 failures for 900 seconds, writes `account.locked`, refuses a locked user with reason `locked`, resets the count on success. Expected `npm run check`: 13 test files, 364 tests.
**Stubbed:** no route. Nothing calls `authenticate` yet. No manual unlock. No per-IP limit.
**Tests:** 31 new by my count: 10 contract cases per adapter (20, in `test/helpers/lockout-contract.ts`, called from `store-contract.ts`) and 11 in `test/lockout.test.ts`.
**Not verified:** no break-on-purpose run (owed; security code). The lockout race behaviour on a server database (A-44). Real timing of a locked sign-in (the test only counts that a hash is checked).
**Found along the way:**
1. `TRACEABILITY.md` was not seen in this chat, so it was not updated. It is in `NEXT_FILES.txt`.
2. `DATA_MODEL.md` says lockout fields arrive in Phase 2. It now lists them.
3. The existing auth tests and `test/sessions.test.ts` passed unchanged (verified on your machine).
4. The hand-written migration matches the schema: `migrate dev` reported "Already in sync" (same result as A-36).

## Step 2.3d-docs (size S), 2026-10-15: docs formatting fix

**Works (not verified: docs only, nothing run):** `docs/DECISIONS.md` and `docs/ASSUMPTIONS.md` replaced as whole files. Fixed missing spaces and backticks in D-20, D-21, D-23/D-24 (blank line between them), A-02, A-03, A-19, A-20 and A-36. Meaning unchanged. TRACEABILITY R-18 and STATUS updated.
**Tests:** none. Last `npm run check` on the owner's machine: 12 files, 333 tests (2.3d).
**Found along the way:**
1. 2.3d is verified on the owner's machine: 12 files, 333 tests, commit b8336e4. This closes the "not verified anywhere" notes in the 2.3d entry.
2. A-36 had the same garbling as the listed items. Fixed too.
3. `NEXT_FILES.txt` for 2.3e now lists `owner.ts`, `owner.test.ts` and `db.test.ts` as a precaution. I have not seen them.
4. D-27 still says storage and rotation come in step 2.3c. D-29 already notes the correction. I left D-27 as it was.

## Step 2.3d (size M), 2026-10-15: session logic

**Works (not verified anywhere yet; I ran nothing in this chat):** `server/src/sessions.ts`: `issueSession`, `refreshSession`, `signOut`, `SessionError`, `REFRESH_TOKEN_SECONDS` (7 days). Reuse of a used token revokes its family and writes `session.reuse_detected`. Sign-out revokes the family and writes `session.logout`. Inactive or missing user: all tokens revoked. Lost race: fails, no revoke (A-40). Expected `npm run check`: 12 test files, 333 tests.
**Stubbed:** no route, no lockout. Nothing calls `sessions.ts` yet.
**Tests:** 38 new in `test/sessions.test.ts` (issue 11, refresh 16, sign-out 8, audit rules 3), by my count.
**Not verified:** everything. No break-on-purpose run (owed; security code). The race test relies on lockstep async steps on the memory store.
**Found along the way:**
1. 2.3c is verified on the owner's machine: 11 files, 295 tests, `migrate deploy` applied, `migrate dev` "Already in sync" (A-36 settled). Commit 6d49656, pushed.
2. D-27 still says rotation comes in 2.3c. The real split is storage 2.3c, rotation 2.3d (D-28). D-29 notes this.
3. The stale comment in `tokens.ts` is fixed in this step.
4. My first design revoked the family on a lost race. I dropped it: the winner's new token could be created after the revoke and survive.

## Step 2.3c (size M), 2026-10-15: refresh-token storage
**Works (verified in my sandbox, Node v22.22.0, isolated project with the exact pins and real tsconfig and ESLint config: typecheck clean, lint clean, 128 tests = 74 tokens + 27 contract per adapter; the Prisma contract ran on migration SQL applied by hand with better-sqlite3, not through `prisma migrate deploy`):** table `RefreshToken`, migration `20261015090000_refresh_tokens` (hand-written, A-36), `RefreshTokenStore` (create, findByHash, consume, revokeFamily, revokeAllForUser) on the interface and in both adapters, 15 new contract cases per adapter. Expected `npm run check`: 11 test files, 295 tests.
**Stubbed:** no rotation logic, no route, no lockout. Nothing calls `refreshTokens` yet.
**Tests:** 30 new (15 per adapter, in the shared contract). Total 295 expected.
**Break on purpose (sandbox):** `tokens.ts` (owed from 2.3b): 29 bugs, 26 caught, 3 equivalent (non-constant-time compare, redundant `exp <= iat`, redundant stored-hash shape check; A-37). Storage: 33 bugs across both adapters. 2 escaped at first (copy protection in the memory adapter). I strengthened the copy test and both are now caught. One more related bug still escapes (`usedAt` not copied on a used record in the memory adapter; low risk, test code only). Code restored, 128 pass.
**Not verified:** the live migration check, the real Prisma migration engine, and the 31 auth tests against the real `email.ts` and `password.ts` (my sandbox used stand-ins for those two files). `npm run check` on the owner's machine: the first run showed 4 type errors in `test/auth.test.ts` (hand-built stores without `refreshTokens`) and a stale generated Prisma client (fixed by `npm run db:generate`).
**Found along the way:**
1. Plan change: 2.3c is storage only. Rotation logic (reuse detection) is 2.3d. Lockout is 2.3e.
2. My first copy-protection test was too weak: it changed only the record returned by `create`. Two bugs escaped. Fixed (see above).
3. A comment in `tokens.ts` still says "Rotation and storage come in step 2.3c". It is stale. Fix it when that file is next changed.
4. 2.3b is now verified on the owner's machine (11 files, 265 tests, commit c994af4).
5. My miss: the `NEXT_FILES.txt` from 2.3b did not list `test/auth.test.ts`, so I had not seen it. It builds four `Store` objects by hand. Fixed: `refreshTokens` added to each. The new `NEXT_FILES.txt` lists it, plus `email.ts` and `password.ts`, which my sandbox needs to run the auth tests.
6. The generated Prisma client is git-ignored. After a schema change, run `npm run db:generate` (or `npm run check`, which does it first) before an editor or `npm run typecheck` will see the new model.

## Step 2.3b (size S), 2026-10-15: access tokens and refresh-token primitives
**Works (not verified anywhere yet; I ran nothing in this chat):** `server/src/tokens.ts`: `createAccessToken`, `verifyAccessToken`, `readTokenSecret`, `assertSecretAllowed`, `createRefreshToken`, `hashRefreshToken`, `refreshTokenMatches`, `isRefreshTokenShape`, `TokenConfigError`. No new dependency. Expected `npm run check`: 11 test files, 265 tests.
**Stubbed:** no route, no stored refresh tokens, no rotation, no lockout. `TOKEN_SECRET` is not in `server/.env.example` yet (nothing reads it).
**Tests:** 74 new in `test/tokens.test.ts` (secret 13, access tokens 50, refresh tokens 11), by my count.
**Not verified:** everything. No break-on-purpose run (owed; security code). Lint (I have not seen `eslint.config.js`).
**Found along the way:**
1. Plan change: rotating refresh tokens need stored state, so 2.3b is the pure part only. 2.3c is refresh-token storage and rotation. 2.3d is lockout.
2. I did not edit `server/.env.example` (I have not seen it).

## Step 2.3a (size M), 2026-10-15: sign-in logic
**Works (verified on your machine: `npm run check` 10 files, 191 tests, reported 2026-10-15; also in my sandbox, Node v22.22.0, npm 10.9.4):** `server/src/auth.ts`: `authenticate(store, email, password)` returns `{ ok: true, user }` (no hash) or `{ ok: false }`. Every failure looks the same to the caller (unknown email, wrong password, bad input, inactive user). Reason codes (`invalid_input`, `unknown_email`, `bad_password`, `inactive`) go only to the audit `detail`. Writes `login.success` and `login.failure`. An unknown email still checks a dummy argon2 hash (timing). If the audit write fails, the error is thrown (no sign-in without its audit entry). Typecheck clean, lint clean, 41 tests pass in an isolated project (typescript 6.0.3, vitest 5.0.4, eslint 10.12.0, typescript-eslint 8.71.2, argon2 0.45.1, my own approximation of `tsconfig.json`). A live `tsx` run on an in-memory store printed the expected lines. `npm run check` on your machine: 10 test files, 191 tests (matches the expected count).
**Stubbed:** no token, no route, no lockout. No route uses `authenticate`.
**Tests:** 31 new in `test/auth.test.ts` (success 4, failure 9, bad input 14 cases, audit rules 4). Expected total 191.
**Break on purpose (sandbox):** 25 deliberate bugs, each caught. `auth.ts` (16): dummy hash skipped (1 test failed), inactive check removed (2), inactive checked before password (1), wrong password allowed (7), email not normalised (9), hash returned (1), success audit removed (3), success audit error swallowed (1), failure audit error swallowed (1), extra text in audit detail (18), unknown email gives a different result (2), non-text password unchecked (6), bad email throws (9), wrong action name (4), actor dropped for known user (2), password trimmed (1). `createOwner` (9, owed from 2.1b): guard removed (2), role wrong (3), audit entry removed (1), audit actor missing (1), password stored in clear (1), email not normalised (2), password policy skipped (1), blank name kept (1), name not trimmed (2). Code restored, 0 failed. This covers `owner.ts` with the memory store only. It does not cover `setup-owner.ts`.
**Not verified:** the live `tsx` check from the 2.3a message (output not reported). Whether commit 0c1fa80 is pushed. The step 1.4 break-on-purpose run (needs the real Prisma engine; still owed). Real timing of the unknown-email path (the test only counts that a hash is checked).
**Found along the way:**
1. My mistake: my first mutation run printed "1 failed" for every bug because my script read the "Test Files" line, not the "Tests" line. The caught or escaped verdicts were right, the counts were not. I fixed the script and reran. The counts above are from the rerun.
2. One mutation was labelled "typed email put in audit detail" but it appended the actor id, not the typed email. It is listed above as "extra text in audit detail".
3. `AuditStore` can only list entries by actor, so entries with no actor (`unknown_email`, `invalid_input`) cannot be read back. Tests use a wrapper that records each `append` call (A-28).
4. The Store has no way to deactivate a user. The inactive tests use a wrapper store that reports `isActive: false` (A-30).
5. `server/tsconfig.json` was not in the pack, so I could not use the real one. It is now in NEXT_FILES. The `NEXT_FILES.txt` from step 2.2a did not list it (miss).
6. STATUS said "not yet verified" for 2.2a. It is now verified on your machine (9 files, 160 tests, d10b19e).
7. Resume chat, 2026-10-15: you reported 2.3a verified (10 files, 191 tests). The real `server/tsconfig.json` has now been seen. Its `include` lists `test` twice (harmless).
8. `docs/DECISIONS.md` (D-20, D-21, D-23/D-24 spacing) and `docs/ASSUMPTIONS.md` (A-02, A-03, A-19, A-20) have garbled formatting in the repo itself, not only in the mirror. A whole-file fix is pending ("fix decisions"). TRACEABILITY skips R-25.

## Step 2.2a (size M), 2026-10-14: permission table
**Works (verified on your machine: 9 files, 160 tests, commit d10b19e, pushed; also in my sandbox, Node v22.22.0, npm 10.9.4):** `server/src/permissions.ts`: `PERMISSION_TABLE` (22 permissions), `isPermission`, `hasPermission`, `canGrant`, `normalizeStaffGrants`, `PermissionGrantError`. Typecheck clean and 38 tests pass in an isolated project (typescript 6.0.3, vitest 5.0.4, @types/node 22.20.5, the real tsconfig options, a stub `store.ts` with only `Role`). `npm run check` on your machine: 9 test files, 160 tests (matches the expected count).
**Stubbed:** no route or guard uses the table. No staff accounts. No stored staff permission lists.
**Tests:** 38 new in `test/permissions.test.ts` (table 4, matrix 6, hasPermission edge cases 4, canGrant 5, normalizeStaffGrants 19). Expected total 160.
**Break on purpose (sandbox):** 18 deliberate bugs, each caught: inactive check removed (4 failed), staffGrantable ignored (3), Staff always allowed (4), unknown permission not checked (1, also a type error), unknown role not refused (1), users.manage made grantable (6), payoff.process removed (8), key typo (6), isPermission accepts any string (3), canGrant without users.manage check (2), canGrant without staffGrantable check (2), upfront actor check removed (1), canGrant check removed in normalize (1), isArray check removed (4), table order lost (3), no dedupe (1), unknown entries skipped (6), error message echoes input (1). Code restored, 38 pass.
**Not verified:** the owed break-on-purpose run for step 1.4 (the one for 2.1b was done at 2.3a). Lint and typecheck passed on your machine in `npm run check`.
**Found along the way:**
1. My mistake: STATUS and BUILD_LOG said 120 tests for step 2.1b. Your pasted output shows 122 (110 + 12). Corrected below.
2. Step 2.1b is now verified on your machine: 8 files, 122 tests; the setup script created the owner, and a second run refused with "A Super Admin already exists. Nothing was changed."
3. I first gave permissions a `restricted` flag for `loans.disburse` and `payoff.process`. No test can reach that branch, because only the Super Admin holds `users.manage`. I removed it. DR-14 holds by construction and tests pin it (A-26).
4. No live check applies: no route uses the table yet.
5. `mirror/DECISIONS.md` is still stale, and the D-20 and D-21 formatting is still garbled in the copy I was shown. It may be a paste artifact. Fixing it needs a whole-file replacement. Say "fix decisions" and I do it as a small step.

## Step 2.1b (size M), 2026-10-14: owner setup script
**Works (verified on your machine, output pasted: 8 files, 122 tests; owner script created the owner once and refused the second run; I ran nothing in my sandbox):** `hasSuperAdmin` on the Store interface, `memory-store.ts` and `prisma-store.ts`. `src/owner.ts` (`createOwner`, `OwnerAlreadyExistsError`). `src/setup-owner.ts` and `npm run setup:owner`. Expected `npm run check`: 8 test files, 122 tests.
**Stubbed:** no route uses `createOwner`. No sign-in yet.
**Tests:** 12 new: 2 contract cases (1 per adapter, on a fresh empty store) and 10 in `test/owner.test.ts`. Total 122.
**Not verified:** everything above until the owner pastes the check output and the live-check output. The no-echo password prompt. A break-on-purpose run (not done; this is security code, so it is owed).
**Found along the way:**
1. The Prisma contract shares one database, so "no Super Admin yet" could not be tested there. `runStoreContract` now takes a third argument that gives a fresh empty store. The Prisma file builds one extra temporary database for it.
2. `hasSuperAdmin` counts inactive Super Admins too (A-24).
3. User creation and the audit write are two separate Store calls, not one transaction (A-25).
4. TRACEABILITY.md and DEV_SETUP.md were seen and updated as whole files. DEV_SETUP now has the database commands.
5. The prototype's permission list lives in `legacy-prototype/src/App.jsx`. I have not read it yet. It is in NEXT_FILES for step 2.2a.

## Step 2.1a (size S), 2026-10-14: password hashing and email normalising
**Works (verified on your machine, output pasted; also in my sandbox, Node v22.22.0, npm 10.9.4):** `server/src/password.ts` (`hashPassword`, `verifyPassword`, `assertPasswordAllowed`, `PasswordPolicyError`) and `server/src/email.ts` (`normalizeEmail`, `InvalidEmailError`). argon2 0.45.1, argon2id, library defaults read from a real hash: `m=65536,p=4,t=3`. One hash took 134 ms. Typecheck clean, 31 tests pass, live `tsx` run printed the expected lines. This was an isolated project with the exact pins and the real `tsconfig.json`, not the real `server/`.
**Stubbed:** nothing uses the modules yet. No route, no setup script.
**Tests:** 31 new (password 14, email 17). Expected total 110.
**Break on purpose (sandbox):** 12 deliberate bugs. 11 were caught at once. One escaped: removing the max-length guard in `verifyPassword` changed nothing, because a wrong long password fails anyway. I changed the test to use a hash made with raw argon2 from an over-length password, and the bug is then caught (1 failed). Code restored, 31 pass.
**Not verified:** hash time on your machine (the password tests took 1.8 s for 14 tests there, well inside the 30 s limit). The audit details (4 high findings, believed to be A-20).
**Found along the way:**
1. My miss: the `NEXT_FILES.txt` I wrote at step 1.5 did not list the adapters, contract tests or config files, so this chat could not build the owner setup script. I split the step (2.1a, 2.1b). The new `NEXT_FILES.txt` lists them.
2. The setup script needs a "does a Super Admin exist" guard. The Store has none. 2.1b adds `hasSuperAdmin` to the interface, both adapters and the contract.
3. The argon2 PHC string from this library writes its parameters in the order `m,p,t`. I used the real output in the live check.
4. TRACEABILITY.md and DECISIONS.md (repo copy) were not in the pack, so I could not edit them as whole files. D-22 and D-23 are given as text to add at the end of DECISIONS.md. TRACEABILITY is updated at 2.1b.
5. The `mirror/DECISIONS.md` copy in Project knowledge is stale (no D-22 or D-23, and D-20 is garbled).

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