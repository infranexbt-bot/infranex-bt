#!/bin/bash
# E2E v4: full nav + verified uv-based SN67 setup; agent alive throughout.
set -u
cd /tmp/lagent

ref_of() {
  agent-browser snapshot -i --json 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
refs=d.get('data',{}).get('refs',{})
q='$1'.lower()
for r,v in refs.items():
    if q in str(v.get('name','')).lower() and v.get('role') in ('button','textbox','link'):
        print(r); break"
}

echo "== start agent =="
nohup python3 agent.py run > agent.log 2>&1 &
AGENT_PID=$!
sleep 4

echo "== reload + nav Deployments =="
agent-browser reload >/dev/null 2>&1
agent-browser wait --load networkidle >/dev/null 2>&1; sleep 2
R=$(ref_of "Deployments 07"); agent-browser click "@$R" >/dev/null 2>&1; sleep 3

echo "== SN67 → compute → local → host → review =="
agent-browser find role textbox fill "67" >/dev/null 2>&1; sleep 1
R=$(ref_of "α67 Harnyx"); [ -n "$R" ] && agent-browser click "@$R" >/dev/null 2>&1 && echo "sn67=$R"; sleep 1
R=$(ref_of "Continue — pick compute"); [ -n "$R" ] && agent-browser click "@$R" >/dev/null 2>&1; sleep 1.5
R=$(ref_of "Local machine"); [ -n "$R" ] && agent-browser click "@$R" >/dev/null 2>&1; sleep 1
R=$(ref_of "stepper-test-laptop"); [ -n "$R" ] && agent-browser click "@$R" >/dev/null 2>&1 && echo "host=$R"; sleep 1
R=$(ref_of "Continue — review & deploy"); [ -n "$R" ] && agent-browser click "@$R" >/dev/null 2>&1; sleep 1.5
agent-browser snapshot 2>/dev/null | grep -E 'your machine|your hardware' | head -2

echo "== click Start setup =="
R=$(ref_of "Start setup on laptop"); echo "start=$R"; [ -n "$R" ] && agent-browser click "@$R" >/dev/null 2>&1
sleep 3

echo "== poll (max 7 min) =="
DONE=0
for i in $(seq 1 28); do
  sleep 15
  OUT=$(curl -s -b /tmp/jar.txt http://localhost:3000/api/devops/local-hosts --max-time 8 2>/dev/null | python3 -c "
import json,sys
try:
    hs=json.load(sys.stdin)['hosts']
    h=[x for x in hs if x['name']=='stepper-test-laptop'][0]
    cs=[c for c in h['commands'] if c['phase']=='deploy-setup']
    if cs: c=cs[0]; print(c['status'], ('rc='+str(c['exitCode']) if c['exitCode'] is not None else ''), (c['output'] or '').strip().split(chr(10))[-1][:80])
except Exception as e: print('poll-err', e)")
  echo "[$((i*15))s] $OUT"
  echo "$OUT" | grep -q "^done" && DONE=1 && break
  echo "$OUT" | grep -q "^failed" && break
done

echo "== UI final state =="
agent-browser snapshot 2>/dev/null | grep -E 'Setup on|Burn gate|Send register|repo cloned' | head -4
agent-browser screenshot /home/z/my-project/scripts/verify-cpudeploy-local.png >/dev/null 2>&1
echo "screenshot: scripts/verify-cpudeploy-local.png"
tail -2 agent.log
kill $AGENT_PID 2>/dev/null
echo "E2E-DONE=$DONE"
