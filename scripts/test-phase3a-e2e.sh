#!/usr/bin/env bash
# Phase 3a regression — full mock deployment lifecycle through the live API
set -u
BASE="http://localhost:3000"

echo "== 0. health =="
curl -s -o /dev/null -w "network: %{http_code}\n" "$BASE/api/network"

echo "== 1. create mock deployment =="
DEP=$(curl -s -X POST "$BASE/api/deployments" -H "Content-Type: application/json" \
  -d '{"netuid":1,"offerId":"o2","minerName":"phase3a-regression","walletName":"infranex","mode":"mock"}')
echo "$DEP" | head -c 300; echo
ID=$(echo "$DEP" | python3 -c "import sys,json; print(json.load(sys.stdin)['deployment']['id'])")
echo "id: $ID"

echo "== 2. advance to started (max 8 ticks) =="
for i in 1 2 3 4 5 6 7 8; do
  R=$(curl -s -X POST "$BASE/api/deployments/$ID/tick")
  ST=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('deployment',{}).get('status') or d.get('error'))" 2>/dev/null)
  echo "tick $i -> $ST"
  if [ "$ST" = "started" ]; then break; fi
  if [ "$ST" = "failed" ]; then echo "UNEXPECTED FAILURE:"; echo "$R" | head -c 500; echo; exit 1; fi
done
[ "$ST" = "started" ] || { echo "FAILED to reach started (got $ST)"; exit 1; }

echo "== 3. verify record fields =="
curl -s "$BASE/api/deployments/$ID" | python3 -c "
import sys, json
d = json.load(sys.stdin)['deployment']
assert d['status'] == 'started', d['status']
assert d['providerPodId'], 'missing podId'
assert d['ipAddress'] is None or isinstance(d['ipAddress'], str)
assert 'sshPublicKey' in d
print('status:', d['status'])
print('podId :', d['providerPodId'][:20], '…')
print('ip    :', d['ipAddress'])
print('pubkey:', d['sshPublicKey'])
print('steps :', len(d['steps']), 'entries; provision output tail:')
for line in [s for s in d['steps'] if s['name']=='provision'][0]['output'][-3:]:
    print('   ', line)
"

echo "== 4. terminate + verify =="
curl -s -X POST "$BASE/api/deployments/$ID/terminate" > /dev/null
curl -s "$BASE/api/deployments/$ID" | python3 -c "
import sys, json
d = json.load(sys.stdin)['deployment']
assert d['status'] == 'terminated', d['status']
print('terminated OK')
"

echo "== 5. register-host on mock must be rejected =="
CODE=$(curl -s -o /tmp/regresp.json -w "%{http_code}" -X POST "$BASE/api/deployments/$ID/register-host")
echo "register-host -> $CODE (expect 400)"
cat /tmp/regresp.json | head -c 200; echo

echo "== 6. runpod creation without API key must fail cleanly =="
DEP2=$(curl -s -X POST "$BASE/api/deployments" -H "Content-Type: application/json" \
  -d '{"netuid":1,"offerId":"o2","minerName":"phase3a-runpod-nokey","walletName":"infranex","mode":"runpod"}')
ID2=$(echo "$DEP2" | python3 -c "import sys,json; print(json.load(sys.stdin)['deployment']['id'])")
for i in 1 2 3; do
  R=$(curl -s -X POST "$BASE/api/deployments/$ID2/tick")
  ST=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('deployment',{}).get('status') or d.get('error'))" 2>/dev/null)
  echo "tick $i -> $ST"
  [ "$ST" = "failed" ] && break
done
[ "$ST" = "failed" ] || { echo "expected fail without API key, got $ST"; exit 1; }
curl -s "$BASE/api/deployments/$ID2" | python3 -c "
import sys, json
d = json.load(sys.stdin)['deployment']
provision = [s for s in d['steps'] if s['name']=='provision'][0]['output']
assert d['sshPublicKey'], 'runpod deployment should carry a generated public key'
print('sshPublicKey:', d['sshPublicKey'][:60], '…')
print('failure message recorded:')
for line in provision[-2:]:
    print('   ', line[:150])
"
echo
echo "ALL REGRESSION CHECKS PASSED"
