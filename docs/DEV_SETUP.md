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
| Create the owner (Super Admin) | `npm run setup:owner` (needs a terminal; password typed, never in git or chat) |
| Run | `npm start` (port 3000, or `PORT=3456 npm start`) |
| Run and reload on change | `npm run dev` |
| Health route | `curl -i http://localhost:3000/health` |
| Reset the dev database | delete `server/dev.db`, then `npm run db:deploy` |

## Rules
- Versions in `package.json` are exact. Change one only in a step that says so. Commit `package-lock.json`.
- Never commit `.env` files or `*.db` files (see `.gitignore`).
- Use fictional data only (D-08). The owner's real email is entered later, on the real database.
- `web/` has no setup yet. `legacy-prototype/` is reference only. Do not install or run it.

## Settings (names only)
`PORT` (optional, default 3000). `DATABASE_URL` (optional for the setup script; default `file:./dev.db`). More are added with the step that needs them.