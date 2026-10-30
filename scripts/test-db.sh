#!/bin/sh
# Local PostgreSQL 18 for the server tests (step E.2a). Run from anywhere: sh scripts/test-db.sh start|stop|status|reset
# Uses Homebrew's postgresql@18 with its own data folder outside the repo, not the brew service, so nothing starts at login.
# Listens on 127.0.0.1 only, port 54329 (TEST_PG_PORT to change). Local connections are trusted, so there is no password
# and nothing secret. Test data only (D-08); `reset` deletes the folder and makes a new, empty cluster.
# Tests connect to: postgresql://postgres@127.0.0.1:54329/postgres

set -e
PORT="${TEST_PG_PORT:-54329}"
DATA="${TEST_PG_DATA:-$HOME/.iyanu-oluwa/test-pg}"
BIN="$(brew --prefix postgresql@18)/bin"

if [ ! -x "$BIN/pg_ctl" ]; then
  echo "postgresql@18 not found. Install it: brew install postgresql@18"
  exit 1
fi

init() {
  mkdir -p "$(dirname "$DATA")"
  "$BIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=en_US.UTF-8 >/dev/null
  echo "Made a new cluster in $DATA"
}

start() {
  [ -f "$DATA/PG_VERSION" ] || init
  if "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
    echo "Already running on 127.0.0.1:$PORT"
  else
    "$BIN/pg_ctl" -D "$DATA" -l "$DATA/server.log" -w -o "-h 127.0.0.1 -p $PORT" start >/dev/null
    echo "Started on 127.0.0.1:$PORT"
  fi
  "$BIN/pg_isready" -h 127.0.0.1 -p "$PORT"
}

stop() {
  if "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
    "$BIN/pg_ctl" -D "$DATA" -w stop >/dev/null
    echo "Stopped"
  else
    echo "Not running"
  fi
}

case "$1" in
  start) start ;;
  stop) stop ;;
  status) "$BIN/pg_isready" -h 127.0.0.1 -p "$PORT" || true ;;
  reset) stop; rm -rf "$DATA"; start ;;
  *) echo "Usage: sh scripts/test-db.sh start|stop|status|reset"; exit 1 ;;
esac
