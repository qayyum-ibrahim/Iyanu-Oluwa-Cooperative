#!/bin/sh
# Concurrent writes against a running server (step E.8b, A-297 item 8, D-119): three races of five
# requests at once, each with its own idempotency key. Exactly one may win; the others get 409; none 5xx.
# Run from anywhere: BASE=https://<address> sh scripts/live-check-concurrency.sh
# You type the owner email and password. The password is hidden, never printed, never in a command line.
# Tokens are never printed and never put in a command line (they go to curl on stdin).
# Each run adds fictional rows to the database (D-08): two members, one loan with its Loan expense,
# one loan repayment, one payment, and one pay-off with its Membership Withdrawal expense (that member becomes Inactive).
# The server log shows "store transaction refused for a clash, try N of 10" for each retry.

umask 077
BASE="${BASE:-http://localhost:3000}"
DIR=$(mktemp -d "${TMPDIR:-/tmp}/iyanu-race.XXXXXX") || exit 1
BODY="$DIR/body.json"
REQ="$DIR/req.json"
trap 'stty echo 2>/dev/null; rm -rf "$DIR"' EXIT INT TERM
PASS=0
FAIL=0
RACERS=5

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
authed_get() { # path, access token; prints the status code; body goes to $BODY
  printf 'header = "Authorization: Bearer %s"\n' "$2" | curl -s -o "$BODY" -w "%{http_code}" -K - "$BASE$1"
}
authed_send() { # path, access token, optional idempotency key; the JSON body is in $REQ; prints the status code; body goes to $BODY
  EXTRA=""
  [ -n "$3" ] && EXTRA="header = \"Idempotency-Key: $3\""
  printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n%s\n' "$2" "$EXTRA" | curl -s -o "$BODY" -w "%{http_code}" -K - -X POST "$BASE$1" --data @"$REQ"
}
new_key() { node -e 'process.stdout.write(require("crypto").randomUUID())'; }
field() { # name of a top-level field in the last body
  node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(b[process.argv[2]]??""))' "$BODY" "$1"
}
pick() { # dotted path in the last body, such as member.id
  node -e 'const fs=require("fs");let v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));for(const k of process.argv[2].split("."))v=v==null?undefined:v[k];process.stdout.write(v==null?"":String(v))' "$BODY" "$1"
}
login_json() { E="$1" P="$2" node -e 'process.stdout.write(JSON.stringify({email:process.env.E,password:process.env.P}))'; }

# Five POSTs of $REQ to a path at once, each with its own key (made first, so the requests leave together).
# Leaves "code.N" and "body.N" in $DIR.
race() { # path, access token
  KEYS=$(node -e 'for(let i=0;i<Number(process.argv[1]);i++)console.log(require("crypto").randomUUID())' "$RACERS")
  i=0
  for K in $KEYS; do
    i=$((i + 1))
    printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\nheader = "Idempotency-Key: %s"\n' "$2" "$K" \
      | curl -s -o "$DIR/body.$i" -w "%{http_code}" -K - -X POST "$BASE$1" --data @"$REQ" > "$DIR/code.$i" &
  done
  wait
}
race_count() { # status code; how many racers got it
  n=0; i=1
  while [ "$i" -le "$RACERS" ]; do
    [ "$(cat "$DIR/code.$i")" = "$1" ] && n=$((n + 1))
    i=$((i + 1))
  done
  echo "$n"
}
race_codes() { # every racer's status code, sorted, comma-separated
  i=1
  while [ "$i" -le "$RACERS" ]; do cat "$DIR/code.$i"; echo; i=$((i + 1)); done | sort | paste -sd, -
}

printf "Owner email: "; read -r EM
printf "Password (hidden): "; stty -echo; read -r PW; stty echo; printf "\n"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
expect "health" "$code" 200
[ "$code" = "200" ] || { echo "Server not reachable at $BASE."; exit 1; }

code=$(login_json "$EM" "$PW" | send /auth/login)
expect "login" "$code" 200
AT=$(field accessToken)
[ -n "$AT" ] || { echo "No access token came back. Check the email and password."; exit 1; }

member_json() { N="$1" node -e 'process.stdout.write(JSON.stringify({fullName:process.env.N,phone:"08000000002",address:"2 Test Street",occupation:"Trader"}))' > "$REQ"; }
member_json "Race Check Borrower"
code=$(authed_send /members "$AT")
expect "member for the loan races added" "$code" 201
LMID=$(pick member.id)
member_json "Race Check Leaver"
code=$(authed_send /members "$AT")
expect "member for the pay-off race added" "$code" 201
PMID=$(pick member.id)

# --- race 1: five loans for one member (one active loan per member) ---
L="$LMID" node -e 'process.stdout.write(JSON.stringify({memberId:process.env.L,principal:"300000",method:"CASH"}))' > "$REQ"
race /loans "$AT"
echo "      loan race codes: $(race_codes)"
expect "one loan given" "$(race_count 201)" 1
expect "four loans refused" "$(race_count 409)" 4
code=$(authed_get "/loans?memberId=$LMID" "$AT")
expect "the member has one loan" "$(pick loans.length)" 1
expect "loan outstanding" "$(pick loans.0.outstanding)" "300000.00"

# --- race 2: five full repayments of that loan (never more than the loan) ---
L="$LMID" node -e 'process.stdout.write(JSON.stringify({memberId:process.env.L,method:"CASH",total:"300000",lines:[{category:"Loan Repaid",amount:"300000"}],sendSms:false}))' > "$REQ"
race /payments "$AT"
echo "      repayment race codes: $(race_codes)"
expect "one repayment recorded" "$(race_count 201)" 1
expect "four repayments refused" "$(race_count 409)" 4
code=$(authed_get "/payments?memberId=$LMID" "$AT")
expect "the member has one payment" "$(pick payments.length)" 1
code=$(authed_get "/loans?memberId=$LMID" "$AT")
expect "loan outstanding after the race" "$(pick loans.0.outstanding)" "0.00"

# --- race 3: five pay-offs of one member (pays out once) ---
P="$PMID" node -e 'process.stdout.write(JSON.stringify({memberId:process.env.P,method:"CASH",total:"20000",lines:[{category:"Shares",amount:"5000"},{category:"Savings",amount:"10000"},{category:"Special Savings",amount:"5000"}],sendSms:false}))' > "$REQ"
code=$(authed_send /payments "$AT" "$(new_key)")
expect "payment for the pay-off race" "$code" 201
P="$PMID" node -e 'process.stdout.write(JSON.stringify({memberId:process.env.P,method:"CASH",total:"20000"}))' > "$REQ"
race /payoffs "$AT"
echo "      pay-off race codes: $(race_codes)"
expect "one pay-off" "$(race_count 201)" 1
expect "four pay-offs refused" "$(race_count 409)" 4
code=$(authed_get "/members/$PMID" "$AT")
expect "paid-out member is Inactive" "$(pick member.status)" INACTIVE

echo "$PASS passed, $FAIL failed"
