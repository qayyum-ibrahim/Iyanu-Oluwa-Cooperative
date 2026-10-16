#!/bin/sh
# Live check of /auth against a running server. Run from anywhere: sh scripts/live-check-auth.sh
# You type the owner email and password. The password is hidden, never printed, never in a command line.
# Tokens are never printed and never put in a command line (the access token goes to curl on stdin).
# The one wrong-password try counts as 1 failure and the next correct sign-in resets it (limit is 5).

BASE="${BASE:-http://localhost:3000}"
BODY=/tmp/iyanu-live-body.json
trap 'stty echo 2>/dev/null; rm -f "$BODY"' EXIT INT TERM
PASS=0
FAIL=0

expect() { # name, got, want
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); echo "ok    $1 ($2)"
  else
    FAIL=$((FAIL + 1)); echo "FAIL  $1 (got $2, want $3)"
  fi
}
send() { # path; JSON comes in on stdin; prints the status code; body goes to $BODY
  curl -s -o "$BODY" -w "%{http_code}" -X POST "$BASE$1" -H "Content-Type: application/json" --data @-
}
get_me() { # access token; prints the status code; body goes to $BODY. The token goes in on stdin.
  printf 'header = "Authorization: Bearer %s"\n' "$1" | curl -s -o "$BODY" -w "%{http_code}" -K - "$BASE/auth/me"
}
field() { # name of a top-level field in the last body
  node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(b[process.argv[2]]??""))' "$BODY" "$1"
}
keys() {
  node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(Object.keys(b).sort().join(","))' "$BODY"
}
me_value() { # "role" or "count" from the last /auth/me body
  node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(process.argv[2]==="role"?b.user.role:b.permissions.length))' "$BODY" "$1"
}
login_json() { E="$1" P="$2" node -e 'process.stdout.write(JSON.stringify({email:process.env.E,password:process.env.P}))'; }
token_json() { RT="$1" node -e 'process.stdout.write(JSON.stringify({refreshToken:process.env.RT}))'; }

printf "Owner email: "; read -r EM
printf "Password (hidden): "; stty -echo; read -r PW; stty echo; printf "\n"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
expect "health" "$code" 200
[ "$code" = "200" ] || { echo "Server not reachable at $BASE. Start it with: npm start"; exit 1; }

code=$(login_json "$EM" "wrong-password-for-live-check" | send /auth/login)
expect "wrong password refused" "$code" 401
expect "refusal body" "$(field error)" invalid_credentials

code=$(login_json "$EM" "$PW" | send /auth/login)
expect "login" "$code" 200
expect "login body fields" "$(keys)" "accessExpiresAt,accessToken,refreshExpiresAt,refreshToken,user"
R1=$(field refreshToken)
AT=$(field accessToken)
[ -n "$R1" ] || { echo "No refresh token came back. Check the email and password."; exit 1; }

code=$(get_me "$AT")
expect "me with the access token" "$code" 200
expect "me body fields" "$(keys)" "permissions,user"
expect "me role" "$(me_value role)" SUPER_ADMIN
expect "me permission count" "$(me_value count)" 22
code=$(curl -s -o "$BODY" -w "%{http_code}" "$BASE/auth/me")
expect "me without a token refused" "$code" 401
code=$(get_me "not.a.token")
expect "me with a bad token refused" "$code" 401
code=$(get_me "$R1")
expect "me with a refresh token refused" "$code" 401

code=$(token_json "$R1" | send /auth/refresh)
expect "refresh" "$code" 200
R2=$(field refreshToken)
expect "refresh gives a new token" "$([ -n "$R2" ] && [ "$R2" != "$R1" ] && echo yes || echo no)" yes

code=$(token_json "$R1" | send /auth/refresh)
expect "reuse of the old token refused" "$code" 401
code=$(token_json "$R2" | send /auth/refresh)
expect "family revoked after reuse" "$code" 401

code=$(login_json "$EM" "$PW" | send /auth/login)
expect "second login" "$code" 200
R3=$(field refreshToken)
code=$(token_json "$R3" | send /auth/logout)
expect "logout" "$code" 204
code=$(token_json "$R3" | send /auth/refresh)
expect "refresh after logout refused" "$code" 401

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]