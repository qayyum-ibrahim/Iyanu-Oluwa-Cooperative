# Assumptions
Status: confirmed / illustrative / verify.

| ID | Assumption | Status | Who verifies |
|---|---|---|---|
| A-01 | Owner's machine runs Node v22.14.0 and npm 11.21.0 (reported 2026-10-13). The server packages pinned in step 1.2 declare Node requirements that accept v22.14.0 (registry lookup). A clean `npm install` on the owner's machine succeeded on 2026-10-14 (pasted: 227 packages added, 0 vulnerabilities, 38 minutes). The full `npm run check` on the owner's machine is confirmed at step 1.3. | confirmed | Owner (output pasted at step 1.3) |
| A-02 | Prisma 7.10.0(CLI and client) is chosen because on 2026-10-13 the CLIlatesttag was a release candidate (8.0.0-rc.22) while the clientlatest was 7.10.0. Clean install, generate, migrate and tests all worked on the owner's machine on 2026-10-14 (reported by owner, output pasted). | confirmed | Owner (step 1.4 output) |
| A-03 | Money is stored as BigIntkobo. On the owner's machine a raw SQLite INTEGER column held the A-17 cap and 2^63−1 exactly (test intest/db.test.ts). Prisma's BigInt path on a real money column is checked in Phases 3 and 4. | verify | Claude at Phases 3 and 4 |
| A-04 | SQLite for development. Production database is undecided until hosting is known. | verify | Owner (OQ-01) |
| A-05 | Member personal data (name, phone, address) has legal handling duties in Nigeria. I have not checked what they are. | verify | Owner with a legal adviser |
| A-06 | The cooperative has record-keeping, audit and reporting duties set by its regulator. I have not checked what they are. | verify | Owner with the regulator or an adviser |
| A-07 | Nigeria stays on UTC+1 all year with no daylight saving. I believe this is right. | verify | Claude, before Phase 7 |
| A-08 | `exceljs` 4.4.0 is acceptable for .xlsx output. I did not check how actively it is maintained. | verify | Claude at step 8.1 |
| A-09 | The `xlsx` npm package (latest on npm is 0.18.5) has known security advisories. I believe so but did not check. We will not use it. | verify | Claude at step 8.1 |
| A-10 | `argon2` (native module) installs on the owner's machine. If not, use a pure-JS alternative. | verify | Owner at step 2.1 |
| A-11 | Staff see only members and records they created (as the ZIP does today). | illustrative | Owner (OQ-09) |
| A-12 | Membership ID format `IO-001`, `IO-002` stays. | illustrative | Owner |
| A-13 | The label "Building Funds" is used exactly as the owner wrote it. | verify | Owner |
| A-14 | Names and amounts in the ZIP seed are fictional. | confirmed | Owner (D-08) |
| A-15 | Express 5 is acceptable as the server framework. Fastify was the alternative. | illustrative | Owner |
| A-16 | TypeScript 6.0.3 is used because typescript-eslint 8.71.2 declares peer `typescript <6.1.0` (registry lookup). TypeScript 7 itself was not tested. Revisit when typescript-eslint lists TypeScript 7 support. | verify | Claude, at the start of Phase 9 and whenever typescript-eslint changes |
| A-17 | Money input is capped at 12 digits of naira (₦999,999,999,999.99, which is 99,999,999,999,999 kobo, under 10^14). This is a safety cap chosen by Claude, not a rule from the owner. 10^14 is far below 2^63 (about 9.2 × 10^18) and below JavaScript's largest safe integer (about 9.0 × 10^15). Whether the database column accepts it is checked at step 1.4 (A-03). | illustrative | Owner (no real amount comes near ₦1 trillion) |
| A-18 | Amounts cross the API as strings such as "20000.50", never as JSON numbers, because JSON numbers are floats and `JSON.stringify` throws on `BigInt` (checked in Claude's sandbox, Node v22.22.0). The parser rejects commas, spaces, signs, symbols and 3 or more decimals, and accepts zero (a caller must require above zero where needed). Display format is `₦20,000.00`: comma groups, always 2 decimals, and `-₦5.50` for negatives. | illustrative | Owner (display format); Claude at Phase 4 (API shape) |
| A-19 | The SQLite driver adapter @prisma/adapter-better-sqlite3 7.10.0 is used (better-sqlite312.11.1). It installed and ran on the owner's macOS (all 7 db tests passed). npm 11.21.0 prints aninstall-scripts warning for 5 packages. It did not stop the build or the tests. The production database and adapter follow OQ-01. | confirmed for development | Owner (OQ-01 for production) |
| A-20 | The 4 high npm audit findings (deepmerge-ts7.1.5,mysql23.15.3) come only through the Prisma CLI dev dependency and are accepted for now. With dev, peer and optional dependencies omitted, audit reports 0 (Claude's sandbox). Whether production needs the CLI formigrate deploy is open. | verify | Claude at Phase 9 and whenever Prisma is updated |
| A-21 | Email addresses are matched exactly, with letter case significant, in both store adapters (SQLite default for a unique index; same in memory). Phase 2 sign-in must decide whether to lower-case emails. | verify | Owner at Phase 2 |