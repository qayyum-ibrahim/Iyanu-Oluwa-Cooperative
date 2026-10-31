# Dev setup
Machine: macOS, Node v22.14.0, npm 11.21.0 (owner, 2026-10-13). The server needs Node 22.13 or newer.

## Server (folder `server/`)
| Task | Command (run inside `server/`) |
|---|---|
| Install | `npm install` |
| Full check (generate, types, lint, tests) | `npm run check` |
| Tests only | `npm test` |
| Generate the Prisma client | `npm run db:generate` |
| Create or update the dev database after a schema change | `npx prisma migrate dev` (or `npm run db:migrate`) |
| Apply existing migrations to a database | `npm run db:deploy` |
| Reset the owner password | `npm run reset:owner` (needs a terminal; password typed twice, never in git or chat; ends the owner's sessions and clears the lock) |
| Run | `npm start` (port 3000, or `PORT=3456 npm start`); since E.4 it also serves the built web pages at http://localhost:3000 when `web/dist` exists (`npm run build` in `web/` first) |
| Run and reload on change | `npm run dev` |
| Health route | `curl -i http://localhost:3000/health` |
| Dev database | the Neon `dev` branch since E.2c (A-293): `npm run db:deploy` applies migrations through `DIRECT_URL`; `server/dev.db` deleted. Reset steps for Neon not written yet |
| Test database (E.2a, D-118) | from the repo root: `sh scripts/test-db.sh start`, `stop`, `status` or `reset` (local PostgreSQL 18.6, Homebrew `postgresql@18`, 127.0.0.1:54329, no password; used by the tests since E.2b; start it before `npm run check`) |

## Routes
Since E.4 (D-120) every route below also answers under `/api` (for example `GET /api/health`), and the server serves the files in `web/dist` with their own headers. `GET /health` is live. `POST /auth/login`, `/auth/refresh` and `/auth/logout` are served and live-checked (2.4b). `GET /auth/me` needs the header `Authorization: Bearer <access token>` and returns the user and the permissions held. `/staff` (2.5b) needs the same header and the `users.manage` permission, so only the Super Admin: `POST /staff` (create), `GET /staff` (list), `PUT /staff/:id/permissions` (replace the list), `POST /staff/:id/deactivate` and `POST /staff/:id/reactivate` (2.5c; deactivating ends the account's sessions at once), `PUT /staff/:id/password` (2.5d; sets a new password and ends the account's sessions). Any signed-in user may call `POST /auth/password` with `currentPassword` and `newPassword` (204; ends all their sessions, so they sign in again). Guards for data routes are in `server/src/guards.ts`: `requireAuth` (401), then `requirePermission` (403). `/members` (3.2): `POST /members` (needs `members.create`), `GET /members` and `GET /members/:id` (need `members.view`). Staff see only members they recorded; the Super Admin sees all. `GET /members?status=all` includes Inactive members; `?createdById=<user id>` works for the Super Admin only. `GET /members/:id/balances` (needs `members.view`), `POST /members/:id/reactivate` (needs `members.edit`). `/payments`: `POST /` (`payments.create`), `GET /` (`payments.view`). `/loans`: `POST /` (`loans.disburse`), `GET /` (`loans.view`). `/expenses`: `POST /` (`expenses.create`), `GET /` (`expenses.view`), `PUT /:id` (`expenses.edit`), `DELETE /:id` (`expenses.delete`). `/payoffs`: `POST /` (`payoff.process`). `/dashboard`: `GET /` (`dashboard`; query `month` "YYYY-MM", default this Lagos month; `createdById` for the Super Admin only). `/reports`: `GET /categories` (`reports.view`; query `fromDay` and `toDay` "YYYY-MM-DD", each optional; `createdById` for the Super Admin only). `/audit`: `GET /` (`users.manage`). Live check: `sh scripts/live-check-auth.sh` with the server running; it creates one fictional staff account and two fictional members per run.

## Web (folder `web/`)
| Task | Command (run inside `web/`) |
|---|---|
| Install | `npm install` |
| Full check (types, lint, tests) | `npm run check` |
| Run | `npm run dev` (port 5173; open http://localhost:5173) |

The dev server forwards `/api/...` to the API at `http://localhost:3000` with the `/api` prefix removed (`web/src/api-proxy.ts`). Set `API_TARGET` to use another address. Start the server first. Without the dev server: `npm run build` here, then `npm start` in `server/` and open http://localhost:3000 (E.4).

## Render (E.7, D-122)
Build command `sh scripts/render-build.sh` (from the repo root; installs both folders with `npm ci --include=dev`, builds `web/`, makes the Prisma client, runs `migrate deploy`). Start command `cd server && npm start`. Node version from `.node-version` (22.14.0). Do not run the build script on this machine: `npm ci` replaces `node_modules` and `db:deploy` uses `server/.env`. Full steps in `docs/DEPLOY.md` (E.8a). The hosted app uses the Neon root branch; `server/.env` keeps the `dev` branch (D-123).

## Rules
- Versions in `package.json` are exact. Change one only in a step that says so. Commit `package-lock.json`.
- Never commit `.env` files or `*.db` files (see `.gitignore`).
- Use fictional data only (D-08). The owner's real email is entered later, on the real database.
- `legacy-prototype/` is reference only. Do not install or run it.

## Settings (names only)
`PORT` (optional, default 3000). `DATABASE_URL` (required since E.2b, the pooled address, used by the app and the scripts). `DIRECT_URL` (the direct address, used by the Prisma CLI). `TEST_DATABASE_URL` (optional, tests only; a local PostgreSQL, default `postgresql://postgres@127.0.0.1:54329/postgres`). `TOKEN_SECRET` (at least 32 bytes; make your own value in `server/.env`; its name is in `server/.env.example`; the running server reads it from step 2.4b). Read by the server since E.6 (D-121, A-296): `SMS_PROVIDER` (`fake` by default, or `twilio`), `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_FROM`. With `SMS_PROVIDER=twilio` and any of the four missing, the server names the missing settings and stops. The start log says which provider is used. Since E.7 (D-122): `TRUST_PROXY_HOPS` (empty or 0 on this machine, so X-Forwarded-For is ignored; a whole number up to 5 on Render, set at E.8); any other value stops the server; the start log says "trusted proxies: N". More are added with the step that needs them.