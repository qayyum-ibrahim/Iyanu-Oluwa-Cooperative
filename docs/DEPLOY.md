# Deploy for client testing (Render, Neon, UptimeRobot)
Written at step E.8a (D-116, D-122, D-123, A-297, A-298). Fictional data only (D-08). The owner does every step here; Claude never sees a secret.
Never paste an address, password or secret in chat or put it in git.

## 0. Before you start
- A Render account whose workspace holds no other free service (750 free hours a month per workspace, D-116).
- A Neon project in Frankfurt (`aws-eu-central-1`), the one that holds the `dev` branch.
- An UptimeRobot account (free).
- Every change is pushed to GitHub (`git push`, by you). Render builds from GitHub, not from your machine.
- Do not run `scripts/render-build.sh` on your machine (A-297 item 6).

## 1. Neon: the database for the hosted app (D-123)
The hosted app uses the project's root branch, not `dev`. `dev` stays for your machine, so the live-check rows from your machine never reach the client's data.
1. In the Neon console open the project and look at Branches. The root branch is named `production` (projects made in the console) or `main` (made by the API or CLI). The Neon docs give both names (A-298 item 4).
2. If the root branch already holds tables from earlier tries, say so before you go on. The build's `migrate deploy` expects an empty database or one made by our migrations.
3. Click **Connect**, pick the root branch, the database `neondb` and its role.
   - With **Connection pooling** on (the default, the host has `-pooler`): this is the **pooled address**.
   - With **Connection pooling** off: this is the **direct address**.
4. Keep both in your password manager. Both branches share the project's 100 CU-hours and 1 GB (A-298 item 4).

## 2. A new token secret for the hosted app
Make a new one. Do not reuse the one in `server/.env`. In a terminal:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Copy it straight into Render (step 3). It is 64 characters, above the 32-byte minimum. Then clear the terminal.

## 3. Render: the web service
In the Render dashboard: **New**, then **Web Service**, then connect the GitHub repo.

| Field | Value |
|---|---|
| Name | your choice; it becomes part of the `onrender.com` address |
| Language | Node |
| Branch | `main` |
| Region | Frankfurt (cannot be changed later) |
| Root Directory | leave empty (the repo root, D-122) |
| Build Command | `sh scripts/render-build.sh` |
| Start Command | `cd server && npm start` |
| Compute plan (instance type) | Free |

Under **Advanced**, environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon pooled address of the root branch (step 1) |
| `DIRECT_URL` | the Neon direct address of the root branch (step 1) |
| `TOKEN_SECRET` | the new secret (step 2) |
| `SMS_PROVIDER` | `fake` (no SMS is sent; Twilio comes at E.9, OQ-17) |
| `TRUST_PROXY_HOPS` | `0` (the right number is found at E.8b) |

Do not set `PORT` (Render sets it) or `NODE_VERSION` (`.node-version` gives 22.14.0). Do not set the `TWILIO_` names yet.

Under **Advanced** (or later under **Settings**, **Health Checks**): health check path `/health`. If a free service does not offer this field, skip it (A-298 item 2).

Then **Create Web Service**. Auto-deploy "On Commit" is Render's default, so every push to `main` builds again and runs the migrations again.

## 4. Check the deploy (paste these to Claude)
1. In the build log near the end: `Applying migration` and `All migrations have been successfully applied.` (that line shows the build could use `DIRECT_URL`, A-298 item 2). If the build fails, paste the last 30 lines, with any address hidden.
2. In the service log: `SMS provider: fake`, `trusted proxies: 0`, `server listening on port ...`.
3. From your machine, with your service address:

```sh
curl -i https://<name>.onrender.com/health
curl -I https://<name>.onrender.com/health
```

Paste the status line and the `strict-transport-security` line from both (`-I` is the HEAD request a monitor may send).

## 5. The owner account on the hosted database
Render's free plan has no shell, so run `setup:owner` from your machine against the root branch. At E.8a the owner chose a real email for this account (D-123 item 4, an exception to D-08). Every row on the hosted database is reset when testing ends. Inside `server/`, in zsh:

```sh
read -s "DATABASE_URL?Pooled address of the root branch: "; echo
export DATABASE_URL
npm run setup:owner
unset DATABASE_URL
```

`read -s` keeps the address off the screen and out of shell history. dotenv does not replace a value that is already set, so `server/.env` (the `dev` branch) is not used for this run. Paste the line `Super Admin created: ...`.

## 6. The live check on the hosted address
From the repo root, with the email and password from step 5:

```sh
BASE=https://<name>.onrender.com sh scripts/live-check-auth.sh
```

Write `https://` once only: with it twice, every check fails with "got 000". Paste the last line (`N passed, M failed`). Each run adds fictional rows to the hosted database: one staff account, two members (one becomes Inactive), payments, one loan and one pay-off (A-298 item 6). Run it once only.

## 7. The pages in a browser
Open `https://<name>.onrender.com`, sign in, and open a few pages and one export. Say whether anything breaks, or whether the browser console shows a "Content Security Policy" error (A-294).

## 8. UptimeRobot (D-116)
1. **+ Add New Monitor**, type **HTTP(s)**.
2. URL `https://<name>.onrender.com/health`. Friendly Name your choice.
3. Monitoring interval **5 minutes** (the shortest on the free plan).
4. Alert contact: your email.
5. **Create monitor**. After 10 minutes, say whether it shows "Up".

A 5-minute ping keeps Render from spinning down (15 idle minutes). `/health` does not touch the database, so Neon can still sleep.

## Later
- E.8b: the right `TRUST_PROXY_HOPS` on Render, and concurrent writes on Neon.
- E.9: the client's fictional test accounts and Twilio (OQ-17).
- Each push to `main` deploys again. Free web services use the workspace's build pipeline minutes. When they run out, with no payment method, Render stops new builds for the rest of the month (A-298 item 3).
