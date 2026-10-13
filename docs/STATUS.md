# Project status
Last updated: after step 0.2

## Where we stopped
Phase 0 is done and committed. The resume routine was rebuilt in step 0.2. Next: Phase 1, step 1.1.

## Next step brief
Step 1.1 (S): repo skeleton. Create `.gitignore` (including `.DS_Store`), the folders from D-14, and copy the ZIP source into `legacy-prototype/` with the demo password `IYANU@2026` replaced by `REDACTED`.
Owner inputs needed. Answer once, in your first message:
1. Was `IYANU@2026` ever used for a real account anywhere? (Default: no.)
2. Path of the unzipped ZIP folder. In Terminal type `cd ` (with a space), drag the folder in, press Enter, then run `pwd`.
Files the chat gets automatically: those listed in `docs/NEXT_FILES.txt`. Stable docs are in Project knowledge, folder `mirror/`.

## What exists
Docs only (11 files in `docs/`) plus `scripts/resume-pack.sh`. No app code, database or accounts. The prototype is the ZIP (React/Vite, localStorage). We have not run it.

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
- 1.1 (S) Repo skeleton (see Next step brief).
- 1.2 (M) Server skeleton, pinned versions, `npm run check`, DEV_SETUP.md.
- 1.3 (S) Money module (whole kobo) with tests.
- 1.4 (M) Database schema (users, audit), migration, DATA_MODEL.md.
- 1.5 (S) In-memory adapter for tests.

## Open items
See OPEN_QUESTIONS.md. OQ-03 is closed. Nothing blocks Phase 1. Phase 6 waits on OQ-00, OQ-06 and OQ-07.

## How we work
Delivery: whole files pasted in chat. Mode: lean.