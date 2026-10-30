# Sources
Order of trust (highest first): code shown > docs > supplied material > Claude's knowledge > earlier chat memory.

| Source | What was taken | Trust |
|---|---|---|
| Owner answers in chat, 2026-10-13 | Decisions D-01 to D-12 | High. Relayed by the project lead. Money rules still need sign-off by Mr. Aro (OQ-00). |
| Universal Project Rules PDF (9 pp) | Process, step format, engineering standards | High for process |
| Project Context Memory PDF (10 pp, prepared 2026-10-12) | Requested behaviour, acceptance checklist | Medium. It says the ZIP was never inspected. Its stack (Next.js, Prisma, SQLite) conflicts with the ZIP. |
| ZIP `src/App.jsx` (203 lines) | What the prototype does today | Medium. Read only. Never run. |
| ZIP `README.md` | Claims about features and default login | Low. Claims only. |
| ZIP `PRODUCTION_SCHEMA_AND_API.md` | Pay-off and zero-balance ideas, route list | Low. Uses decimal money. No users, actors or audit. |
| ZIP `package.json`, `vite.config.js`, `index.html`, `main.jsx` | Tooling of the prototype | Medium. Dependencies use `latest`. |
| ZIP `src/index.css` | Colours and responsive breakpoints | Partly read. Enough for colour tokens. Read the rest when the UI is touched. |
| ZIP `preview.html` | Nothing | Ignore. Older copy with no staff, SMS or Excel code. |
| npm registry lookup, 2026-10-13 | Candidate versions (see D-13) | Medium. Lookup only. Compatibility not tested. |
| OWASP cheat sheets (Password Storage, Authentication, HTML5 Security, Session Management, JSON Web Token, Forgot Password), RFC 5321, RFC 3696 erratum 1690, RFC 2104, RFC 9110, RFC 6750, Node.js crypto docs; read 2026-10-29 at 9.4 (A-286) | Readings for the sign-in and token review items | High for the RFCs and verbatim OWASP text; Medium for the parts read only as a summary (Session Management after "Secure Attribute", Node.js timingSafeEqual) |
| Render docs (free, disks, deploys, TLS, regions, monorepo, Node version, web services, terms, acceptable use), Neon docs (pricing, plans, scale to zero, regions, connection pooling, Prisma guide), Prisma docs (PostgreSQL, database drivers); read 2026-10-29 at E.0 (A-289) | Hosting and database facts for the test deploy (D-116) | High for quoted text; npm versions not read (403) |
| npm registry (`npm view`) and Prisma docs (PostgreSQL, database drivers), Neon Prisma guide; read 2026-10-29 at E.1 (A-290) | Adapter versions, dates and dependencies; the adapter choice (D-117) | High for `npm view` output; High for quoted docs text |
| Homebrew docs (Support Tiers, postgresql@18 formula), Colima README and FAQ, Neon docs (Postgres version policy, branching, plans), Docker Hub postgres page, Prisma docs (PostgreSQL, database drivers, prisma.config reference), Neon getting-started prompt (read, not followed), local `--help` of initdb, pg_ctl, pg_isready, postgres; read 2026-10-29 at E.2a (A-291) | Test database choice and script flags; config names (D-118) | High for quoted docs text and local help output |
| Prisma v7 transactions page (and the unversioned Prisma 8 page), PostgreSQL error codes appendix, `@prisma/adapter-pg` 7.10.1 `dist/index.mjs` and `dist/index.d.ts` (local); read 2026-10-30 at E.2b (A-292); the PostgreSQL isolation page failed to load | Isolation level, the P2034 and commit-conflict errors, the adapter's `schema` option (D-119) | High for quoted text and local code; the isolation page not checked |
| Express 5 API pages (express.static, router, application in part), OWASP Content Security Policy and HTTP Headers cheat sheets, `send` 1.2.1 `index.js` (local); read 2026-10-30 at E.4 (A-294) | Serving the web pages, their headers and the `/api` mount (D-120) | High for quoted text and local code; Medium for the application page, read partly as a summary |
| Twilio docs (Messages resource, requests to Twilio, API keys, errors 21211, 21614, 21608, test credentials, free trial, trials, Nigeria SMS guidelines, SMS character limit), the twilio-node README and package.json, `npm view twilio`; read 2026-10-30 at E.5 (A-295) | The SMS request, login, settings and limits; plain HTTPS over the library (D-121) | High for quoted text and `npm view` output; Medium for the Messages resource page past its first part (read as a summary) |
