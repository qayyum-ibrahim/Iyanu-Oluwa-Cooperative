# Project status
Last updated: after step 1.1

## Where we stopped
Step 1.1 done (pending your check): `.gitignore`, folders `web/` and `server/`, and `legacy-prototype/` (frozen copy of the ZIP, demo password redacted). Next: step 1.2.

## Next step brief
Step 1.2 (M): server skeleton, exact-pinned versions, `npm run check`, DEV_SETUP.md. Claude re-checks the D-13 versions against the npm registry first.
Owner inputs needed: none expected. The chat will ask you to paste the last lines of the clean install and check output.
Files the chat gets automatically: those listed in `docs/NEXT_FILES.txt`. The script adds each one to the pack under a heading like `===== FILE: path =====`. If the pack has no such heading, no files were requested.
Stable docs are in Project knowledge, folder `mirror/`.

## What exists
Docs (11 files in `docs/`), `scripts/resume-pack.sh`, `.gitignore`, empty `web/` and `server/` (each with `.gitkeep`), and `legacy-prototype/` (reference only, never to be run or edited). No app code, database or accounts. We have not run the prototype.

## Settings (names only)
None yet. Planned: `DATABASE_URL`, token or session secrets, `OWNER_EMAIL` (setup script input). Values never go in git.

## Commands
Resume routine (3 actions):
1. Commit your work, then run `sh scripts/resume-pack.sh`. It warns if something is uncommitted.
2. Attach `~/Desktop/resume-pack.txt` to a new chat in this Project.
3. Send: `Resume IYANU-OLUWA. Resume pack attached.`

Mirrors: `mirror/` in Project knowledge holds copies of DECISIONS, DOMAIN_RULES, PROJECT_BRIEF, GLOSSARY, SOURCES and PHASE_PLAN (as of commit 2a0c495). The repo wins on any conflict. When one of these docs changes, the mirror must be replaced too. The session that has the Projects tool does it. Otherwise the owner replaces the file in Project knowledge.

## Pinned versions
No package pins yet. Candidates are in DECISIONS D-13.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0 (owner, 2026-10-13).

## Roadmap
Full plan: PHASE_PLAN.md. Next steps:
- 1.2 (M) Server skeleton, pinned versions, `npm run check`, DEV_SETUP.md.
- 1.3 (S) Money module (whole kobo) with tests.
- 1.4 (M) Database schema (users, audit), migration, DATA_MODEL.md.
- 1.5 (S) In-memory adapter for tests.

## Open items
See OPEN_QUESTIONS.md. Nothing blocks Phase 1. Phase 6 waits on OQ-00, OQ-06 and OQ-07. Owner to confirm that the 0.1c item 4 oddities (`mm.md`, modified STATUS) are gone.

## How we work
Delivery: whole files pasted in chat. Mode: lean.