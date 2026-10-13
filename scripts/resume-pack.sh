#!/bin/sh
# Builds the resume pack for a fresh chat.
# Run from anywhere inside the repo:  sh scripts/resume-pack.sh
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "Run this inside the repo."; exit 1; }
cd "$ROOT" || exit 1
OUT="/tmp/resume-pack.txt"

section() { printf '\n===== %s =====\n' "$1"; }

{
  section "STATUS (docs/STATUS.md)"
  cat docs/STATUS.md
  section "BUILD LOG (latest 80 lines)"
  head -80 docs/BUILD_LOG.md
  section "OPEN QUESTIONS (docs/OPEN_QUESTIONS.md)"
  cat docs/OPEN_QUESTIONS.md
  section "ASSUMPTIONS (docs/ASSUMPTIONS.md)"
  cat docs/ASSUMPTIONS.md
  section "SNAPSHOT"
  echo "--- git log (10) ---"; git log --oneline -10
  echo "--- git status ---"; git status --short
  echo "--- tracked files (first 150) ---"; git ls-files | head -150
  echo "--- versions ---"; node -v; npm -v
  if [ -f package.json ] && grep -q '"check"' package.json; then
    echo "--- npm run check (last 15 lines) ---"; npm run check 2>&1 | tail -15
  fi
  if [ -f docs/NEXT_FILES.txt ]; then
    grep -v '^[[:space:]]*#' docs/NEXT_FILES.txt | grep -v '^[[:space:]]*$' | while IFS= read -r f; do
      case "$f" in
        *.env|*.env.*|.env|.env.*|*.pem|*.key|*[Ss]ecret*|*.sqlite|*.db)
          section "SKIPPED (looks private): $f"; continue ;;
      esac
      if [ -f "$f" ]; then section "FILE: $f"; cat "$f"; else section "MISSING FILE: $f"; fi
    done
  fi
} > "$OUT" 2>&1

FINAL="$OUT"
DEST="$HOME/Desktop"
if [ -d "$DEST" ] && cp "$OUT" "$DEST/resume-pack.txt" 2>/dev/null; then FINAL="$DEST/resume-pack.txt"; fi
LINES=$(wc -l < "$OUT" | tr -d ' ')
echo "Resume pack ready: $FINAL ($LINES lines)"
DIRTY=$(git status --short | grep -v '\.DS_Store')
if [ -n "$DIRTY" ]; then echo "WARNING: uncommitted changes. Commit them first, then run this again:"; echo "$DIRTY"; fi
echo "Next: open a new chat in this Project, attach that file, and send:"
echo "  Resume IYANU-OLUWA. Resume pack attached."