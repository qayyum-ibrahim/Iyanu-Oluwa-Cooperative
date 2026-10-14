# Assumptions
Status: confirmed / illustrative / verify.

| ID | Assumption | Status | Who verifies |
|---|---|---|---|
| A-01 | Owner's machine runs Node v22.14.0 and npm 11.21.0 (reported 2026-10-13). The server packages pinned in step 1.2 declare Node requirements that accept v22.14.0 (registry lookup). A clean install and check passed in Claude's sandbox (Node v22.22.0, npm 10.9.4), not yet on the owner's machine. | verify | Owner at step 1.2 (run `npm install`, `npm run check`) |
| A-02 | Prisma `7.10.0` (CLI and client) is chosen because on 2026-10-13 the CLI `latest` tag was a release candidate (8.0.0-rc.22) while the client `latest` was 7.10.0. Not installed yet. | verify | Claude at step 1.4 (clean install) |
| A-03 | Money is stored as `BigInt` kobo. I did not confirm from the Prisma docs whether `Int` is wide enough, so I chose `BigInt` to be safe. | verify | Claude at step 1.4 |
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