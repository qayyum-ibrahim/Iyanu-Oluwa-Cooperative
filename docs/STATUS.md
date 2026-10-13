# Project status
Last updated: after step 0.1

## Where we stopped
Phase 0 documents written (step 0.1). Waiting for the project lead to commit them and confirm. Next: Phase 1, step 1.1.

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
See OPEN_QUESTIONS.md. Before step 1.1 the owner runs `node -v; npm -v` (OQ-03).

## How we work
Delivery: whole files pasted in chat. Mode: lean.