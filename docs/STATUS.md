# Project status
Last updated: after step 0.1e

## Where we stopped
Phase 0 is done. The documents are written, checked on the owner's machine and committed (steps 0.1, 0.1b, 0.1c). The chat switch test passed. Next: Phase 1, step 1.1.

## What exists
Docs only (11 files in `docs/`). No code, no database, no accounts. The prototype is the ZIP (React/Vite, localStorage). We have not run it.

## Settings (names only)
None yet. Planned: `DATABASE_URL`, token or session secrets, `OWNER_EMAIL` (setup script input). Values never go in git.

## Commands
Resume pack. It writes to a file, so the terminal stays silent. `npm run check` does not exist yet.
```
(cat docs/STATUS.md; echo; echo '--- BUILD LOG (latest) ---'; head -80 docs/BUILD_LOG.md; echo; echo '--- SNAPSHOT ---'; git log --oneline -10; git status --short; git ls-files | head -150; node -v; npm -v) > /tmp/resume-pack.txt
cp /tmp/resume-pack.txt ~/Desktop/resume-pack.txt
```
resume prompt:
Resume IYANU-OLUWA.
Attached: the resume pack (STATUS, latest BUILD_LOG entries, snapshot).
Follow the Project rules. First reply only with: the current step, the last verified result, the next step, and anything in the docs that looks inconsistent with the snapshot. Do not write code until I say go.

Run on the owner's machine on 2026-10-13. A fresh chat read it correctly.

## Pinned versions
No package pins yet. Candidates are in DECISIONS D-13.
Machine (not pins): macOS, Node v22.14.0, npm 11.21.0 (owner, 2026-10-13).

## Roadmap
Full plan: PHASE_PLAN.md. Next steps:
- 1.1 (S) Repo skeleton: `.gitignore` (including `.DS_Store`), folders, copy the ZIP source into `legacy-prototype/` with the demo password redacted. Attach with the resume pack: DECISIONS.md. Tell the chat the path of the unzipped ZIP folder.

- 1.2 (M) Server skeleton, pinned versions, `npm run check`, DEV_SETUP.md.
- 1.3 (S) Money module (whole kobo) with tests.
- 1.4 (M) Database schema (users, audit), migration, DATA_MODEL.md.
- 1.5 (S) In-memory adapter for tests.

## Open items
See OPEN_QUESTIONS.md. OQ-03 is closed. Nothing blocks Phase 1. Phase 6 waits on OQ-00, OQ-06 and OQ-07.

## How we work
Delivery: whole files pasted in chat. Mode: lean.