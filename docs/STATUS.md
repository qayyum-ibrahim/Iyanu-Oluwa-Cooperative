# Project status
Last updated: after step 0.1

## Where we stopped
Phase 0 documents written and checked on the owner's machine (steps 0.1, 0.1b). Machine: macOS, Node v22.14.0, npm 11.21.0. Next: Phase 1, step 1.1.

## What exists
Docs only. No code, no database, no accounts. The prototype is the ZIP (React/Vite, localStorage). It has not been run by us.

## Settings (names only)
None yet. Planned: `DATABASE_URL`, `JWT` or session secrets, `OWNER_EMAIL` (setup script input). Values never go in git.

## Commands
Resume pack (from the guide, not yet tested; `npm run check` does not exist yet):
`(cat docs/STATUS.md; echo; echo '--- BUILD LOG (latest) ---'; head -80 docs/BUILD_LOG.md; echo; echo '--- SNAPSHOT ---'; git log --oneline -10; git status --short; git ls-files | head -150; node -v; npm -v) > /tmp/resume-pack.txt`

## Pinned versions
None pinned yet. Candidates are in DECISIONS D-13.

## Roadmap
See PHASE_PLAN.md. Next: 1.1 repo skeleton.

## Open items
See OPEN_QUESTIONS.md. OQ-03 is closed.

## How we work
Delivery: whole files pasted in chat. Mode: lean.