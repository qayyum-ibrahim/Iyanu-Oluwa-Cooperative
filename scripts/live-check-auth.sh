#!/bin/sh
# Live check of /auth, /staff, /audit, /members, /payments, /loans, /payoffs, /dashboard, /reports and /exports against a running server. Run from anywhere: sh scripts/live-check-auth.sh
# You type the owner email and password. The password is hidden, never printed, never in a command line.
# Tokens are never printed and never put in a command line (the access token goes to curl on stdin).
# The one wrong-password try counts as 1 failure and the next correct sign-in resets it (limit is 5).
# Each run adds fictional rows to the dev database (D-08): one staff account, two members, three payments,
# one loan with its Loan expense, and one pay-off with its Membership Withdrawal expense (that member becomes Inactive).

umask 077
BASE="${BASE:-http://localhost:3000}"
BODY=/tmp/iyanu-live-body.json
REQ=/tmp/iyanu-live-req.json
trap 'stty echo 2>/dev/null; rm -f "$BODY" "$REQ"' EXIT INT TERM
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

authed_get() { # path, access token; prints the status code; body goes to $BODY
  printf 'header = "Authorization: Bearer %s"\n' "$2" | curl -s -o "$BODY" -w "%{http_code}" -K - "$BASE$1"
}
authed_file() { # path, access token; prints the status code and the content type; the file goes to $BODY
  printf 'header = "Authorization: Bearer %s"\n' "$2" | curl -s -o "$BODY" -w "%{http_code} %{content_type}" -K - "$BASE$1"
}
authed_send() { # method, path, access token, optional idempotency key; the JSON body is in $REQ; prints the status code
  EXTRA=""
  [ -n "$4" ] && EXTRA="header = \"Idempotency-Key: $4\""
  printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n%s\n' "$3" "$EXTRA" | curl -s -o "$BODY" -w "%{http_code}" -K - -X "$1" "$BASE$2" --data @"$REQ"
}
new_key() { node -e 'process.stdout.write(require("crypto").randomUUID())'; }
field() { # name of a top-level field in the last body
  node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(b[process.argv[2]]??""))' "$BODY" "$1"
}
pick() { # dotted path in the last body, such as staff.permissions; lists print comma-separated
  node -e 'const fs=require("fs");let v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));for(const k of process.argv[2].split("."))v=v==null?undefined:v[k];process.stdout.write(Array.isArray(v)?v.join(","):v==null?"":String(v))' "$BODY" "$1"
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

# --- staff accounts (step 2.5b) ---
STAFF_EMAIL="live-check-$(date +%s)@example.test"
STAFF_PW=$(node -e 'process.stdout.write(require("crypto").randomBytes(18).toString("base64url"))')
write_staff_json() {
  E="$STAFF_EMAIL" P="$STAFF_PW" node -e 'process.stdout.write(JSON.stringify({email:process.env.E,password:process.env.P,displayName:"Live Check Staff",permissions:["dashboard","members.view"]}))' > "$REQ"
}
write_staff_json
code=$(authed_send POST /staff "$AT")
expect "staff created" "$code" 201
expect "staff permissions" "$(pick staff.permissions)" "dashboard,members.view"
expect "staff body has no hash" "$(pick staff.passwordHash)" ""
SID=$(pick staff.id)
write_staff_json
code=$(authed_send POST /staff "$AT")
expect "duplicate staff email refused" "$code" 409

code=$(login_json "$STAFF_EMAIL" "$STAFF_PW" | send /auth/login)
expect "staff login" "$code" 200
SAT=$(field accessToken)
get_me "$SAT" > /dev/null
expect "staff role" "$(me_value role)" STAFF
expect "staff permission count" "$(me_value count)" 2
code=$(authed_get /staff "$SAT")
expect "staff cannot list staff" "$code" 403
code=$(curl -s -o "$BODY" -w "%{http_code}" "$BASE/staff")
expect "list staff without a token refused" "$code" 401
code=$(authed_get /staff "$AT")
expect "owner lists staff" "$code" 200

printf '%s' '{"permissions":["dashboard","members.view","payments.create"]}' > "$REQ"
code=$(authed_send PUT "/staff/$SID/permissions" "$AT")
expect "owner changes permissions" "$code" 200
get_me "$SAT" > /dev/null
expect "staff sees the change on the same token" "$(me_value count)" 3
printf '%s' '{"permissions":["users.manage"]}' > "$REQ"
code=$(authed_send PUT "/staff/$SID/permissions" "$AT")
expect "users.manage cannot be granted" "$code" 400
code=$(authed_send PUT "/staff/$SID/permissions" "$SAT")
expect "staff cannot change permissions" "$code" 403

# --- deactivate and reactivate staff (step 2.5c) ---
printf '%s' '{}' > "$REQ"
code=$(login_json "$STAFF_EMAIL" "$STAFF_PW" | send /auth/login)
expect "staff second login" "$code" 200
SAT=$(field accessToken)
SRT=$(field refreshToken)
code=$(authed_send POST "/staff/$SID/deactivate" "$SAT")
expect "staff cannot deactivate" "$code" 403
code=$(authed_send POST "/staff/$SID/deactivate" "$AT")
expect "owner deactivates staff" "$code" 200
expect "staff isActive false" "$(pick staff.isActive)" false
code=$(get_me "$SAT")
expect "deactivated access token refused" "$code" 401
code=$(token_json "$SRT" | send /auth/refresh)
expect "deactivated refresh token refused" "$code" 401
code=$(login_json "$STAFF_EMAIL" "$STAFF_PW" | send /auth/login)
expect "deactivated login refused" "$code" 401
code=$(authed_send POST "/staff/$SID/reactivate" "$AT")
expect "owner reactivates staff" "$code" 200
expect "staff isActive true" "$(pick staff.isActive)" true
code=$(login_json "$STAFF_EMAIL" "$STAFF_PW" | send /auth/login)
expect "login after reactivation" "$code" 200
code=$(authed_send POST "/staff/no-such-id/deactivate" "$AT")
expect "deactivate unknown id" "$code" 404

# --- change and reset passwords (step 2.5d) ---
# The owner's own password is not changed here (tests cover it). Only the fictional staff account is.
new_pw() { node -e 'process.stdout.write(require("crypto").randomBytes(18).toString("base64url"))'; }
NEW_PW=$(new_pw)
NEWER_PW=$(new_pw)
pw_json() { P="$1" node -e 'process.stdout.write(JSON.stringify({password:process.env.P}))' > "$REQ"; }
change_json() { C="$1" N="$2" node -e 'process.stdout.write(JSON.stringify({currentPassword:process.env.C,newPassword:process.env.N}))' > "$REQ"; }

code=$(login_json "$STAFF_EMAIL" "$STAFF_PW" | send /auth/login)
expect "staff login before reset" "$code" 200
SAT=$(field accessToken)
SRT=$(field refreshToken)
pw_json "$NEW_PW"
code=$(authed_send PUT "/staff/$SID/password" "$SAT")
expect "staff cannot reset a password" "$code" 403
code=$(authed_send PUT "/staff/$SID/password" "$AT")
expect "owner resets staff password" "$code" 200
expect "reset body has no hash" "$(pick staff.passwordHash)" ""
code=$(authed_send PUT "/staff/no-such-id/password" "$AT")
expect "reset unknown id" "$code" 404
code=$(token_json "$SRT" | send /auth/refresh)
expect "refresh token ended by reset" "$code" 401
code=$(login_json "$STAFF_EMAIL" "$STAFF_PW" | send /auth/login)
expect "old staff password refused" "$code" 401
code=$(login_json "$STAFF_EMAIL" "$NEW_PW" | send /auth/login)
expect "new staff password works" "$code" 200
SAT=$(field accessToken)
SRT=$(field refreshToken)

change_json "$STAFF_PW" "$NEWER_PW"
code=$(authed_send POST /auth/password "$SAT")
expect "change with wrong current refused" "$code" 403
expect "wrong current error" "$(field error)" wrong_password
change_json "$NEW_PW" "short"
code=$(authed_send POST /auth/password "$SAT")
expect "short new password refused" "$code" 400
change_json "$NEW_PW" "$NEWER_PW"
code=$(authed_send POST /auth/password "$SAT")
expect "change own password" "$code" 204
code=$(token_json "$SRT" | send /auth/refresh)
expect "refresh token ended by change" "$code" 401
code=$(login_json "$STAFF_EMAIL" "$NEW_PW" | send /auth/login)
expect "old password refused after change" "$code" 401
code=$(login_json "$STAFF_EMAIL" "$NEWER_PW" | send /auth/login)
expect "new password works after change" "$code" 200
code=$(curl -s -o "$BODY" -w "%{http_code}" -X POST "$BASE/auth/password" -H "Content-Type: application/json" --data '{}')

# --- audit viewer (step 2.6) ---
UNKNOWN_EMAIL="nobody-$(date +%s)@example.test"
code=$(login_json "$UNKNOWN_EMAIL" "wrong-password-for-live-check" | send /auth/login)
expect "unknown email refused" "$code" 401
code=$(authed_get /audit "$AT")
expect "owner reads audit log" "$code" 200
expect "audit body fields" "$(keys)" "entries,hasMore,limit,offset"
expect "audit default limit" "$(pick limit)" 50
code=$(authed_get "/audit?action=login.failure&limit=5" "$AT")
expect "audit filter by action" "$code" 200
expect "newest failed sign-in has no actor" "$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(b.entries[0]&&b.entries[0].actorId===null?"yes":"no")' "$BODY")" yes
expect "typed email not in audit log" "$(U="$UNKNOWN_EMAIL" node -e 'const fs=require("fs");process.stdout.write(fs.readFileSync(process.argv[1],"utf8").includes(process.env.U)?"leaked":"clean")' "$BODY")" clean
code=$(authed_get "/audit?actorId=$SID&limit=200" "$AT")
expect "audit filter by actor" "$code" 200
expect "all entries are by that actor" "$(V="$SID" node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(b.entries.length>0&&b.entries.every(e=>e.actorId===process.env.V)?"yes":"no")' "$BODY")" yes
code=$(authed_get "/audit?limit=1" "$AT")
expect "audit limit 1 gives one entry" "$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(b.entries.length))' "$BODY")" 1
expect "audit says there is more" "$(pick hasMore)" true
code=$(authed_get "/audit?limit=0" "$AT")
expect "audit bad limit refused" "$code" 400
code=$(authed_get /audit "$SAT")
expect "staff cannot read audit log" "$code" 403
code=$(curl -s -o "$BODY" -w "%{http_code}" "$BASE/audit")
expect "audit without a token refused" "$code" 401

# --- members (step 3.2) ---
# Two fictional members are added to the dev database on each run (D-08).
printf '%s' '{"permissions":["members.create","members.view"]}' > "$REQ"
code=$(authed_send PUT "/staff/$SID/permissions" "$AT")
expect "staff given member permissions" "$code" 200
member_json() { N="$1" node -e 'process.stdout.write(JSON.stringify({fullName:process.env.N,phone:"08000000001",address:"1 Test Street",occupation:"Trader"}))' > "$REQ"; }
member_json "  Live Check Member  "
code=$(authed_send POST /members "$SAT")
expect "staff adds a member" "$code" 201
expect "member name trimmed" "$(pick member.fullName)" "Live Check Member"
expect "member status" "$(pick member.status)" ACTIVE
SMID=$(pick member.id)
member_json "Owner Live Member"
code=$(authed_send POST /members "$AT")
expect "owner adds a member" "$code" 201
OMID=$(pick member.id)
code=$(authed_get /members "$SAT")
expect "staff lists members" "$code" 200
expect "staff list holds only own members" "$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(b.members.length>0&&b.members.every(m=>m.createdById===process.argv[2])?"yes":"no")' "$BODY" "$SID")" yes
code=$(authed_get "/members/$OMID" "$SAT")
expect "staff cannot read the owner's member" "$code" 404
code=$(authed_get "/members/$SMID" "$SAT")
expect "staff reads own member" "$code" 200
code=$(authed_get /members "$AT")
expect "owner list holds both members" "$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(b.members.some(m=>m.id===process.argv[2])&&b.members.some(m=>m.id===process.argv[3])?"yes":"no")' "$BODY" "$SMID" "$OMID")" yes
code=$(authed_get "/members/$SMID" "$AT")
expect "owner reads staff's member" "$code" 200
code=$(authed_get "/members?status=everyone" "$AT")
expect "bad status refused" "$code" 400
member_json "   "
code=$(authed_send POST /members "$AT")
expect "blank name refused" "$code" 400
code=$(curl -s -o "$BODY" -w "%{http_code}" "$BASE/members")
expect "members without a token refused" "$code" 401

# --- payments (step 4.4) ---
# Two fictional payments are added to the dev database on each run (D-08).
printf '%s' '{"permissions":["members.create","members.view","payments.create"]}' > "$REQ"
code=$(authed_send PUT "/staff/$SID/permissions" "$AT")
expect "staff given payment permission" "$code" 200
payment_json() { M="$1" T="$2" node -e 'process.stdout.write(JSON.stringify({memberId:process.env.M,method:"CASH",total:process.env.T,lines:[{category:"Shares",amount:"5000"},{category:"Savings",amount:"10000"},{category:"Special Savings",amount:"5000"}]}))' > "$REQ"; }
payment_json "$SMID" "20000"
code=$(authed_send POST /payments "$SAT" "$(new_key)")
expect "staff records a payment" "$code" 201
expect "payment total" "$(pick payment.total)" "20000.00"
expect "payment SMS reported" "$(pick sms.status)" sent
expect "payment has a membership id" "$([ -n "$(pick payment.membershipId)" ] && echo yes || echo no)" yes
payment_json "$SMID" "19999"
code=$(authed_send POST /payments "$SAT" "$(new_key)")
expect "mismatched breakdown refused" "$code" 400
expect "mismatch code" "$(pick code)" mismatch
payment_json "$OMID" "20000"
code=$(authed_send POST /payments "$SAT" "$(new_key)")
expect "staff cannot pay into the owner's member" "$code" 404
code=$(authed_send POST /payments "$AT" "$(new_key)")
expect "owner records a payment" "$code" 201
# idempotency key (step 4.5)
payment_json "$SMID" "20000"
code=$(authed_send POST /payments "$SAT")
expect "payment without a key refused" "$code" 400
expect "missing key code" "$(pick code)" missing_idempotency_key
IKEY=$(new_key)
code=$(authed_send POST /payments "$SAT" "$IKEY")
expect "keyed payment recorded" "$code" 201
PID1=$(pick payment.id)
code=$(authed_send POST /payments "$SAT" "$IKEY")
expect "repeat with the same key answers 201" "$code" 201
expect "repeat returns the same payment" "$(pick payment.id)" "$PID1"
expect "repeat sends no SMS" "$(pick sms.status)" skipped_repeat
payment_json "$OMID" "20000"
code=$(authed_send POST /payments "$SAT" "$IKEY")
expect "same key with another request refused" "$code" 409
expect "conflict error" "$(pick error)" idempotency_conflict

printf '%s' '{"memberId":"x","method":"CASH","total":"1","lines":[{"category":"Shares","amount":"1"}],"sendSms":"yes"}' > "$REQ"
code=$(authed_send POST /payments "$SAT" "$(new_key)")
expect "bad sendSms refused" "$code" 400
expect "bad sendSms code" "$(pick code)" invalid_send_sms
code=$(authed_get "/audit?action=payment.created&limit=1" "$AT")
expect "audit log has payment.created" "$code" 200
expect "newest entry is payment.created" "$(pick entries.0.action)" payment.created
code=$(curl -s -o "$BODY" -w "%{http_code}" -X POST "$BASE/payments" -H "Content-Type: application/json" --data '{}')
expect "payment without a token refused" "$code" 401

# --- payment list (step 4.8) ---
# The staff member has two payments from this run (the first and the keyed one); the owner's member has one.
code=$(authed_get "/payments?memberId=$SMID" "$SAT")
expect "payment list without payments.view refused" "$code" 403
printf '%s' '{"permissions":["members.create","members.view","payments.create","payments.view"]}' > "$REQ"
code=$(authed_send PUT "/staff/$SID/permissions" "$AT")
expect "staff given payments.view" "$code" 200
code=$(authed_get "/payments?memberId=$SMID" "$SAT")
expect "staff lists own member's payments" "$code" 200
expect "staff member has two payments" "$(pick payments.length)" 2
expect "listed payment total" "$(pick payments.0.total)" "20000.00"
code=$(authed_get "/payments?memberId=$OMID" "$SAT")
expect "staff cannot list the owner's member" "$code" 404
code=$(authed_get "/payments?memberId=$OMID" "$AT")
expect "owner lists a member's payments" "$code" 200
expect "owner's member has one payment" "$(pick payments.length)" 1
code=$(authed_get "/payments" "$AT")
expect "payment list without memberId refused" "$code" 400
expect "missing member id code" "$(pick code)" missing_member_id
code=$(curl -s -o "$BODY" -w "%{http_code}" "$BASE/payments?memberId=x")
expect "payment list without a token refused" "$code" 401

# --- loans (step 5.4, idempotency key 5.4c) ---
# One fictional loan and its Loan expense are added to the dev database on each run (D-08).
loan_json() { M="$1" P="$2" node -e 'process.stdout.write(JSON.stringify({memberId:process.env.M,principal:process.env.P,method:"BANK_TRANSFER",interestNote:"information only"}))' > "$REQ"; }
loan_json "$SMID" "300000"
code=$(authed_send POST /loans "$SAT" "$(new_key)")
expect "loan without loans.disburse refused" "$code" 403
printf '%s' '{"permissions":["members.create","members.view","payments.create","payments.view","loans.disburse"]}' > "$REQ"
code=$(authed_send PUT "/staff/$SID/permissions" "$AT")
expect "staff given loans.disburse" "$code" 200
loan_json "$SMID" "0"
code=$(authed_send POST /loans "$SAT" "$(new_key)")
expect "zero principal refused" "$code" 400
expect "zero principal code" "$(pick code)" principal_not_positive
loan_json "$SMID" "300000"
code=$(authed_send POST /loans "$SAT")
expect "loan without a key refused" "$code" 400
expect "loan missing key code" "$(pick code)" missing_idempotency_key
LKEY=$(new_key)
code=$(authed_send POST /loans "$SAT" "$LKEY")
expect "staff gives a loan" "$code" 201
expect "loan principal" "$(pick loan.principal)" "300000.00"
expect "loan has an expense" "$([ -n "$(pick loan.expenseId)" ] && echo yes || echo no)" yes
LID=$(pick loan.id)
code=$(authed_send POST /loans "$SAT" "$LKEY")
expect "loan repeat with the same key answers 201" "$code" 201
expect "loan repeat returns the same loan" "$(pick loan.id)" "$LID"
code=$(authed_send POST /loans "$SAT" "$(new_key)")
expect "second loan refused" "$code" 409
expect "second loan error" "$(pick error)" active_loan
loan_json "$SMID" "1000"
code=$(authed_send POST /loans "$SAT" "$LKEY")
expect "loan key with another request refused" "$code" 409
expect "loan conflict error" "$(pick error)" idempotency_conflict
loan_json "$OMID" "300000"
code=$(authed_send POST /loans "$SAT" "$(new_key)")
expect "staff cannot lend to the owner's member" "$code" 404
code=$(authed_get "/audit?action=loan.disbursed&limit=1" "$AT")
expect "audit log has loan.disbursed" "$(pick entries.0.action)" loan.disbursed
code=$(curl -s -o "$BODY" -w "%{http_code}" -X POST "$BASE/loans" -H "Content-Type: application/json" --data '{}')
expect "loan without a token refused" "$code" 401

# --- pay-off (step 6.4b) ---
# The owner's member from this run is paid out once: ₦20,000 (all refundable), then Inactive (D-08).
# The staff member's member has the active loan from above, so its pay-off is refused (DR-06).
payoff_json() { M="$1" T="$2" node -e 'process.stdout.write(JSON.stringify({memberId:process.env.M,method:"CASH",total:process.env.T}))' > "$REQ"; }
payoff_json "$SMID" "20000"
code=$(authed_send POST /payoffs "$SAT" "$(new_key)")
expect "pay-off without payoff.process refused" "$code" 403
printf '%s' '{"permissions":["members.create","members.view","payments.create","payments.view","loans.disburse","payoff.process"]}' > "$REQ"
code=$(authed_send PUT "/staff/$SID/permissions" "$AT")
expect "staff given payoff.process" "$code" 200
payoff_json "$SMID" "20000"
code=$(authed_send POST /payoffs "$SAT" "$(new_key)")
expect "pay-off with an active loan refused" "$code" 409
expect "active loan error" "$(pick error)" active_loan
payoff_json "$OMID" "20000"
code=$(authed_send POST /payoffs "$SAT" "$(new_key)")
expect "staff cannot pay out the owner's member" "$code" 404
code=$(authed_send POST /payoffs "$AT")
expect "pay-off without a key refused" "$code" 400
expect "pay-off missing key code" "$(pick code)" missing_idempotency_key
payoff_json "$OMID" "19999"
code=$(authed_send POST /payoffs "$AT" "$(new_key)")
expect "pay-off with a wrong total refused" "$code" 409
expect "wrong total error" "$(pick error)" payout_changed
payoff_json "$OMID" "20000"
POKEY=$(new_key)
code=$(authed_send POST /payoffs "$AT" "$POKEY")
expect "owner pays out a member" "$code" 201
expect "pay-off total" "$(pick payOff.total)" "20000.00"
expect "pay-off has an expense" "$([ -n "$(pick payOff.expenseId)" ] && echo yes || echo no)" yes
POID=$(pick payOff.id)
code=$(authed_send POST /payoffs "$AT" "$POKEY")
expect "pay-off repeat with the same key answers 201" "$code" 201
expect "pay-off repeat returns the same pay-off" "$(pick payOff.id)" "$POID"
code=$(authed_send POST /payoffs "$AT" "$(new_key)")
expect "second pay-off refused" "$code" 409
expect "second pay-off error" "$(pick error)" member_inactive
code=$(authed_get "/members/$OMID" "$AT")
expect "paid-out member is Inactive" "$(pick member.status)" INACTIVE
code=$(authed_get "/audit?action=payoff.processed&limit=1" "$AT")
expect "audit log has payoff.processed" "$(pick entries.0.action)" payoff.processed
code=$(curl -s -o "$BODY" -w "%{http_code}" -X POST "$BASE/payoffs" -H "Content-Type: application/json" --data '{}')
expect "pay-off without a token refused" "$code" 401

# --- dashboard (step 7.3b) ---
# Read only. The staff account is new on each run, so its figures are this run's rows only:
# two payments of 20,000 and one loan of 300,000 with its Loan expense, all in this Lagos month.
# The Loan expense is not in expenditure (D-102) or recent expenses, but is in Total Outflow (D-107);
# the pay-off was recorded by the owner (D-99).
# A run that crosses midnight at a Lagos month end can fail the month figures (no data is harmed).
code=$(authed_get /dashboard "$SAT")
expect "dashboard without dashboard permission refused" "$code" 403
printf '%s' '{"permissions":["members.create","members.view","payments.create","payments.view","loans.disburse","payoff.process","dashboard"]}' > "$REQ"
code=$(authed_send PUT "/staff/$SID/permissions" "$AT")
expect "staff given dashboard" "$code" 200
code=$(authed_get /dashboard "$SAT")
expect "staff reads the dashboard" "$code" 200
expect "dashboard body fields" "$(keys)" "activeMembers,expenditure,fromDay,income,membershipWithdrawal,month,outstandingLoans,recentExpenses,toDay,totalOutflow"
DMONTH=$(pick month)
expect "staff income this month" "$(pick income.month)" "40000.00"
expect "staff income all time" "$(pick income.allTime)" "40000.00"
expect "staff expenditure leaves out the Loan expense" "$(pick expenditure.month)" "0.00"
expect "staff membership withdrawal" "$(pick membershipWithdrawal.month)" "0.00"
expect "staff total outflow this month is the Loan" "$(pick totalOutflow.month)" "300000.00"
expect "staff total outflow all time" "$(pick totalOutflow.allTime)" "300000.00"
expect "staff outstanding loans" "$(pick outstandingLoans)" "300000.00"
expect "staff active members" "$(pick activeMembers)" 1
expect "staff recent expenses leave out the Loan" "$(pick recentExpenses.length)" 0
code=$(authed_get "/dashboard?month=$DMONTH&createdById=$SID" "$AT")
expect "owner reads one staff member's dashboard" "$code" 200
expect "owner sees the staff income" "$(pick income.month)" "40000.00"
expect "owner sees the staff outstanding loans" "$(pick outstandingLoans)" "300000.00"
code=$(authed_get /dashboard "$AT")
expect "owner reads the whole dashboard" "$code" 200
code=$(authed_get "/dashboard?month=2026-13" "$AT")
expect "bad month refused" "$code" 400
expect "bad month code" "$(pick code)" invalid_month
code=$(curl -s -o "$BODY" -w "%{http_code}" "$BASE/dashboard")
expect "dashboard without a token refused" "$code" 401

# --- category report (step 7.4c) ---
# Read only. No day range, so the staff figures are this run's two payments of 20,000
# (Shares 5,000, Savings 10,000, Special Savings 5,000 each). The pay-off was on the owner's member.
code=$(authed_get /reports/categories "$SAT")
expect "report without reports.view refused" "$code" 403
printf '%s' '{"permissions":["members.create","members.view","payments.create","payments.view","loans.disburse","payoff.process","dashboard","reports.view"]}' > "$REQ"
code=$(authed_send PUT "/staff/$SID/permissions" "$AT")
expect "staff given reports.view" "$code" 200
code=$(authed_get /reports/categories "$SAT")
expect "staff reads the category report" "$code" 200
expect "report body fields" "$(keys)" "categories,fromDay,toDay,totalPaid,totalPaidOut"
expect "report category count" "$(pick categories.length)" 14
expect "report first category" "$(pick categories.0.category)" Shares
expect "staff Shares paid" "$(pick categories.0.paid)" "10000.00"
expect "staff Savings paid" "$(pick categories.1.paid)" "20000.00"
expect "staff Special Savings paid" "$(pick categories.2.paid)" "10000.00"
expect "staff total paid" "$(pick totalPaid)" "40000.00"
expect "staff total paid out" "$(pick totalPaidOut)" "0.00"
code=$(authed_get "/reports/categories?createdById=$SID" "$AT")
expect "owner reads one staff member's report" "$code" 200
expect "owner sees the staff total paid" "$(pick totalPaid)" "40000.00"
code=$(authed_get /reports/categories "$AT")
expect "owner reads the whole report" "$code" 200
expect "owner report shows a pay-off" "$([ "$(pick totalPaidOut)" != "0.00" ] && echo yes || echo no)" yes
code=$(authed_get "/reports/categories?fromDay=2026-10-02&toDay=2026-10-01" "$AT")
expect "reversed range refused" "$code" 400
expect "reversed range code" "$(pick code)" invalid_range
code=$(curl -s -o "$BODY" -w "%{http_code}" "$BASE/reports/categories")
expect "report without a token refused" "$code" 401

# --- exports (step 8.4) ---
# Read only, except one export.created audit entry per file. The file is kept in $BODY and deleted at the end.
code=$(authed_get /exports/transactions "$SAT")
expect "export without reports.export refused" "$code" 403
printf '%s' '{"permissions":["members.create","members.view","payments.create","payments.view","loans.disburse","payoff.process","dashboard","reports.view","reports.export"]}' > "$REQ"
code=$(authed_send PUT "/staff/$SID/permissions" "$AT")
expect "staff given reports.export" "$code" 200
for kind in members transactions expenses cashflow "category?category=Shares"; do
  got=$(authed_file "/exports/$kind" "$SAT")
  expect "staff export $kind" "$got" "200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  expect "staff export $kind is a zip file" "$(head -c 2 "$BODY")" PK
done
got=$(authed_file "/exports/expenses?createdById=$SID" "$AT")
expect "owner exports one staff member's expenses" "$got" "200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
code=$(authed_get "/exports/category?category=Nope" "$AT")
expect "unknown export category refused" "$code" 400
expect "unknown export category code" "$(pick code)" invalid_category
code=$(authed_get /exports/nope "$AT")
expect "unknown export kind" "$code" 404
code=$(curl -s -o "$BODY" -w "%{http_code}" "$BASE/exports/members")
expect "export without a token refused" "$code" 401

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