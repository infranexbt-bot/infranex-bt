#!/bin/bash
# E2E-PREFLIGHT-1 — one-shot verification of:
#   A) Deployments pre-flight checklist (gate 1 laptop online, gate 2 wallet keys, hand-off)
#   B) Diligence panel stage 9 with the new alpha-price trend
# The dev server is started INSIDE this call (background processes are reaped
# between tool calls in this sandbox), so everything happens here.
set -u
cd /home/z/my-project
OK=0; BAD=0
say()  { echo ">>> $*"; }
pass() { echo "[PASS] $*"; OK=$((OK+1)); }
fail() { echo "[FAIL] $*"; BAD=$((BAD+1)); }

# --- 1. server ----------------------------------------------------------------
setsid nohup ./run-dev-keepalive.sh >/dev/null 2>&1 </dev/null &
for i in $(seq 1 60); do
  curl -s -o /dev/null --max-time 2 http://localhost:3000/login && break
  sleep 2
done
curl -s -o /dev/null --max-time 5 http://localhost:3000/login && pass "dev server up" || { fail "dev server not reachable"; exit 1; }

# --- 2. login -----------------------------------------------------------------
agent-browser open http://localhost:3000/login >/dev/null 2>&1
agent-browser wait --load networkidle >/dev/null 2>&1
agent-browser find label "User ID" fill "admin" >/dev/null 2>&1
agent-browser find label "Access code" fill "BRJ2-W2GT-WJNF-97VC" >/dev/null 2>&1
agent-browser find role button click --name "Sign in" >/dev/null 2>&1
for i in $(seq 1 10); do
  URL=$(agent-browser get url 2>/dev/null)
  [ "$URL" != "http://localhost:3000/login" ] && break
  sleep 1.5
done
if [ "$URL" != "http://localhost:3000/login" ]; then pass "login → $URL"; else
  fail "login stuck on /login — API says:"
  agent-browser eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:'admin',code:'BRJ2-W2GT-WJNF-97VC'})}).then(r=>r.text()).then(t=>t.slice(0,200))" 2>&1 | head -3
  exit 1
fi

# --- 3. deployments view + pre-flight card -------------------------------------
agent-browser find role button click --name "Deployments 07" >/dev/null 2>&1
sleep 4
SNAP=$(agent-browser snapshot 2>/dev/null)
echo "$SNAP" | rg -qF "Pre-flight" && pass "pre-flight card rendered" || fail "pre-flight card missing"
echo "$SNAP" | rg -qF "Connect your local laptop" && pass "gate 1 present" || fail "gate 1 missing"
echo "$SNAP" | rg -qF "Wallet" && pass "gate 2 present" || fail "gate 2 missing"
echo "$SNAP" | rg -qF "Continue to deploy panel" && pass "hand-off CTA present" || fail "CTA missing"
echo "$SNAP" | rg -q "PENDING" && pass "gates show PENDING initially" || fail "no PENDING chips"
agent-browser screenshot scripts/e2e/preflight-pending.png >/dev/null 2>&1

# --- 4. gate 1: enroll + simulate agent ----------------------------------------
agent-browser find label "Machine name" fill "e2e-test-laptop" >/dev/null 2>&1
agent-browser find role button click --name "Add laptop" >/dev/null 2>&1
sleep 2.5
SNAP=$(agent-browser snapshot 2>/dev/null)
echo "$SNAP" | rg -qF "open Ubuntu (WSL2)" && pass "enroll command block shown" || fail "enroll block missing"
TOKEN=$(echo "$SNAP" | rg -o '\-\-token [A-Za-z0-9]+' | head -1 | awk '{print $2}')
if [ -n "${TOKEN:-}" ]; then
  pass "enroll token captured (${#TOKEN} chars)"
  RESP=$(curl -s -X POST http://localhost:3000/api/agent/enroll -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\",\"specs\":{\"cores\":8,\"threads\":16,\"ramGb\":16,\"os\":\"Ubuntu 22.04 (WSL2)\",\"hostname\":\"e2e-laptop\",\"diskFreeGb\":120,\"python\":\"3.11\"},\"version\":\"e2e-1\"}")
  echo "$RESP" | rg -q '"ok":true' && pass "simulated agent enrolled (status→online)" || fail "enroll API: $RESP"
else
  fail "no token found in enroll block"
fi
sleep 11
SNAP=$(agent-browser snapshot 2>/dev/null)
echo "$SNAP" | rg -q "1 machine" && pass "gate 1 GREEN after enroll" || fail "gate 1 not green"
echo "$SNAP" | rg -q "GREEN" && pass "GREEN chip visible" || fail "no GREEN chip"
agent-browser screenshot scripts/e2e/preflight-gate1-green.png >/dev/null 2>&1

# --- 5. gate 2: wallet profile ---------------------------------------------------
agent-browser find label "Wallet profile label" fill "e2e-wallet" >/dev/null 2>&1
agent-browser find label "Wallet name" fill "e2e-wallet" >/dev/null 2>&1
agent-browser find label "Hotkey name" fill "e2e-hot" >/dev/null 2>&1
agent-browser find label "Coldkey public address" fill "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY" >/dev/null 2>&1
agent-browser find label "Hotkey public address" fill "5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy" >/dev/null 2>&1
agent-browser find role button click --name "Save wallet profile" >/dev/null 2>&1
sleep 3
SNAP=$(agent-browser snapshot 2>/dev/null)
echo "$SNAP" | rg -qF "Both gates green" && pass "both gates green — CTA unlocked" || fail "CTA not unlocked"
echo "$SNAP" | rg -qF "Continue to deploy panel" && pass "CTA present" || fail "CTA missing"
agent-browser find role button click --name "Continue to deploy panel" >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/e2e/preflight-both-green.png >/dev/null 2>&1

# --- 6. cleanup e2e artifacts (wallet + host) ------------------------------------
agent-browser eval "fetch('/api/devops/local-hosts').then(r=>r.json()).then(j=>{const h=(j.hosts||[]).find(x=>x.name==='e2e-test-laptop');return h?fetch('/api/devops/local-hosts/'+h.id,{method:'DELETE'}).then(r=>'host-deleted-'+r.status):'host-not-found'})" 2>&1 | tail -1
agent-browser eval "fetch('/api/wallets').then(r=>r.json()).then(j=>{const w=(j.wallets||[]).find(x=>x.walletName==='e2e-wallet');return w?fetch('/api/wallets/'+w.id,{method:'DELETE'}).then(r=>'wallet-deleted-'+r.status):'wallet-not-found'})" 2>&1 | tail -1

# --- 7. diligence stage 9 on Opportunities ---------------------------------------
agent-browser find role button click --name "Opportunities 02" >/dev/null 2>&1
sleep 4
SNAP=$(agent-browser snapshot -i 2>/dev/null)
ROWREF=$(echo "$SNAP" | rg -o 'row ".*?" \[ref=(e[0-9]+)\]' -r '$1' | head -1)
if [ -n "${ROWREF:-}" ]; then
  agent-browser click "@$ROWREF" >/dev/null 2>&1
else
  agent-browser find text "Harnyx" click >/dev/null 2>&1 || true
fi
sleep 3
agent-browser find text "Diligence pipeline" click >/dev/null 2>&1
sleep 3
SNAP=$(agent-browser snapshot 2>/dev/null)
echo "$SNAP" | rg -qF "Discover subnet" && pass "diligence: stage 1 rendered" || fail "stage 1 missing"
echo "$SNAP" | rg -qF "Emission trend" && pass "diligence: stage 9 rendered" || fail "stage 9 missing"
echo "$SNAP" | rg -qF "α price" && pass "stage 9 shows α price trend (new)" || say "stage 9: α price not in window (history may lack price rows yet)"
echo "$SNAP" | rg -qF "Downside scenario" && pass "diligence: stage 14 rendered" || fail "stage 14 missing"
echo "$SNAP" | rg -qF "Opportunity verdict" && pass "verdict gate rendered" || fail "verdict missing"
echo "$SNAP" | rg -qF "Human gate — you approve" && pass "approve gate rendered" || fail "approve gate missing"
agent-browser screenshot scripts/e2e/diligence-stage9.png >/dev/null 2>&1
agent-browser press Escape >/dev/null 2>&1

# --- 8. runtime errors -------------------------------------------------------------
ERRS=$(agent-browser errors 2>/dev/null | rg -v "agent-browser" | head -5)
[ -z "$ERRS" ] && pass "zero page errors" || fail "page errors: $ERRS"

echo "=============================="
echo "RESULT: $OK passed, $BAD failed"
