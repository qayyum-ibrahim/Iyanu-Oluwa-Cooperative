#!/bin/sh
# Live check of /auth and /staff against a running server. Run from anywhere: sh scripts/live-check-auth.sh
# You type the owner email and password. The password is hidden, never printed, never in a command line.
# Tokens are never printed and never put in a command line (the access token goes to curl on stdin).
# The one wrong-password try counts as 1 failure and the next correct sign-in resets it (limit is 5).
# The staff check creates one fictional staff account on the dev database each run (D-08).

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
authed_send() { # method, path, access token; the JSON body is in $REQ; prints the status code
  printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n' "$3" | curl -s -o "$BODY" -w "%{http_code}" -K - -X "$1" "$BASE$2" --data @"$REQ"
}
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
code=$(authed_send POST /payments "$SAT")
expect "staff records a payment" "$code" 201
expect "payment total" "$(pick payment.total)" "20000.00"
expect "payment has a membership id" "$([ -n "$(pick payment.membershipId)" ] && echo yes || echo no)" yes
payment_json "$SMID" "19999"
code=$(authed_send POST /payments "$SAT")
expect "mismatched breakdown refused" "$code" 400
expect "mismatch code" "$(pick code)" mismatch
payment_json "$OMID" "20000"
code=$(authed_send POST /payments "$SAT")
expect "staff cannot pay into the owner's member" "$code" 404
code=$(authed_send POST /payments "$AT")
expect "owner records a payment" "$code" 201
code=$(authed_get "/audit?action=payment.created&limit=1" "$AT")
expect "audit log has payment.created" "$code" 200
expect "newest entry is payment.created" "$(pick entries.0.action)" payment.created
code=$(curl -s -o "$BODY" -w "%{http_code}" -X POST "$BASE/payments" -H "Content-Type: application/json" --data '{}')
expect "payment without a token refused" "$code" 401

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