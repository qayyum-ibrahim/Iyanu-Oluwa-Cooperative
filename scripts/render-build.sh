#!/bin/sh
# Render build command (step E.7, D-122): sh scripts/render-build.sh, with the service root directory unset (repo root).
# Builds the web pages, installs the server, makes the Prisma client and applies the migrations.
# Render's free plan has no pre-deploy command, so `migrate deploy` runs here, through DIRECT_URL.
# --include=dev: vite, tsx and the prisma CLI are devDependencies and are needed to build and start.
# Do not run this on the owner's machine: npm ci replaces node_modules and db:deploy uses server/.env (Neon).

set -eu
cd "$(dirname "$0")/.."

cd web
npm ci --include=dev
npm run build

cd ../server
npm ci --include=dev
npm run db:generate
npm run db:deploy
