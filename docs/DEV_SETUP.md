# Dev setup
Machine: macOS, Node v22.14.0, npm 11.21.0 (owner, 2026-10-13). The server needs Node 22.13 or newer.

## Server (folder `server/`)
| Task | Command (run inside `server/`) |
|---|---|
| Install | `npm install` |
| Full check (types, lint, tests) | `npm run check` |
| Tests only | `npm test` |
| Run | `npm start` (port 3000, or `PORT=3456 npm start`) |
| Run and reload on change | `npm run dev` |
| Health route | `curl -i http://localhost:3000/health` |

## Rules
- Versions in `package.json` are exact. Change one only in a step that says so. Commit `package-lock.json`.
- Never commit `.env` files or `*.db` files (see `.gitignore`).
- `web/` has no setup yet. `legacy-prototype/` is reference only. Do not install or run it.

## Settings (names only)
`PORT` (optional, default 3000). More are added with the step that needs them.