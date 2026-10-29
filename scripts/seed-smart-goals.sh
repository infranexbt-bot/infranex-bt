#!/bin/bash
# Seed SmartGoal table via the app's own API (same code path as the UI).
# Idempotent: skips seeding if goals already exist.
set +e
cd /home/z/my-project
OUT=/home/z/my-project/scripts/e2e-out
mkdir -p "$OUT"

echo "=== 1. API LOGIN ==="
curl -si --max-time 20 -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"admin","code":"BRJ2-W2GT-WJNF-97VC"}' -o "$OUT/login-headers.txt"
head -1 "$OUT/login-headers.txt"
COOKIE_LINE=$(grep -i '^set-cookie:' "$OUT/login-headers.txt" | head -1 | sed 's/^[Ss]et-[Cc]ookie: //' | sed 's/;.*//' | tr -d '\r')
CNAME="${COOKIE_LINE%%=*}"
CVAL="${COOKIE_LINE#*=}"
if [ -z "$CNAME" ] || [ "$CNAME" = "$COOKIE_LINE" ]; then echo "NO COOKIE — auth failed"; exit 1; fi
AUTH="Cookie: $COOKIE_LINE"
echo "cookie ok: $CNAME"

echo "=== 2. CHECK EXISTING COUNT ==="
curl -s --max-time 20 http://localhost:3000/api/smart-goals -H "$AUTH" -o "$OUT/list-before.json" -w "http=%{http_code}\n"
BEFORE=$(bun -e "const j=await(Bun.file('$OUT/list-before.json').json()); console.log(j.goals?.length ?? -1)" 2>/dev/null)
echo "existing goals: $BEFORE"
if [ "$BEFORE" != "0" ] && [ "$BEFORE" != "-1" ]; then
  echo "ALREADY SEEDED — nothing to do"; exit 0
fi

echo "=== 3. SEED 4 GOALS (from app templates) ==="
post() { # $1=title-json-file
  curl -s --max-time 20 -X POST http://localhost:3000/api/smart-goals \
    -H "$AUTH" -H 'Content-Type: application/json' \
    -d @"$1" -o "$OUT/seed-post.json" -w "http=%{http_code} "
  bun -e "const j=await(Bun.file('$OUT/seed-post.json').json()); console.log('->', j.goal?.id ?? j.error ?? '?')" 2>/dev/null
}

# Goal 1: first registration — ACHIEVED (fully done)
cat > "$OUT/seed-1.json" <<EOF
{"title":"Register my first subnet UID","specific":"Choose one subnet from Miner Fit / Opportunities, confirm its registration window and burn cost, then register the hotkey and hold the UID past immunity.","metric":"UIDs registered","target":1,"current":1,"achievable":"Wallet funded with registration burn + small stake. No code required for stake-mined subnets; recipe guides live in Runbook.","confidence":5,"relevant":"Holding a UID is the entry ticket to every mining strategy — nothing earns before this.","deadline":"$(date -u -d '+7 days' +%Y-%m-%dT%H:%M:%SZ)","milestones":[{"text":"Subnet selected and mechanics read","done":true},{"text":"Registration cost checked at current burn","done":true},{"text":"Registered and UID visible in metagraph","done":true}],"status":"achieved"}
EOF
post "$OUT/seed-1.json"

# Goal 2: SN51 host — ACTIVE (in progress, 1 of 3 milestones)
cat > "$OUT/seed-2.json" <<EOF
{"title":"Onboard as an SN51 GPU host","specific":"List idle GPU capacity on lium.io via the Host & Earn path, pass provider checks and serve the first renter job.","metric":"uptime %","target":95,"current":40,"achievable":"One 24 GB GPU, stable connection, docker installed. Follow the Setup Guide section 05e step by step.","confidence":4,"relevant":"Host income is the lowest-risk lane: no incentive race, rent paid per hour of uptime.","deadline":"$(date -u -d '+21 days' +%Y-%m-%dT%H:%M:%SZ)","milestones":[{"text":"Provider account + key configured","done":true},{"text":"Host passed checks and is listed","done":false},{"text":"First paid rental completed","done":false}],"status":"active"}
EOF
post "$OUT/seed-2.json"

# Goal 3: SN53 miner — ACTIVE (early, 0 of 5 milestones)
cat > "$OUT/seed-3.json" <<EOF
{"title":"Run a profitable SN53 GPU miner","specific":"Deploy the sglang miner stack (Qwen3.6-35B-A3B-FP8, 4×24 GB GPU), register a UID on subnet 53 and keep TOPLOC proofs passing so the validator assigns incentive.","metric":"alpha/day","target":50,"current":8,"achievable":"Rent 4× RTX 4090 (or own 141 GB+ VRAM). Burn registration ≈ 0.0005 TAO. Miner connects outbound to wss://api.engy.ai/gw — no open ports needed.","confidence":3,"relevant":"SN53 pays miners in alpha (~0.033 TAO/α moving price). Building the stack before registering survives the ~1-block immunity window.","deadline":"$(date -u -d '+30 days' +%Y-%m-%dT%H:%M:%SZ)","milestones":[{"text":"GPU capacity secured (4×24 GB, CUDA 12+)","done":true},{"text":"sglang server healthy with hidden-states enabled","done":false},{"text":"Miner key + outbound gateway connection verified","done":false},{"text":"UID registered on SN53","done":false},{"text":"First nonzero incentive epoch","done":false}],"status":"active"}
EOF
post "$OUT/seed-3.json"

# Goal 4: diversify — DRAFT (just planned)
cat > "$OUT/seed-4.json" <<EOF
{"title":"Earn from 3 subnets simultaneously","specific":"Grow from a single-subnet position to three income sources so one deregistration or emission cut cannot zero the operation.","metric":"subnets earning","target":3,"current":1,"achievable":"Reuse existing hardware where possible; add CPU-mined subnets from the CPU Guide to avoid new GPU spend.","confidence":3,"relevant":"Concentration is the top killer seen in the payout audits — top-heavy reward curves can cut a miner to zero within weeks.","deadline":"$(date -u -d '+60 days' +%Y-%m-%dT%H:%M:%SZ)","milestones":[{"text":"Second subnet chosen and stack built","done":false},{"text":"Third subnet chosen and stack built","done":false},{"text":"All three paying for 2 consecutive weeks","done":false}],"status":"draft"}
EOF
post "$OUT/seed-4.json"

echo "=== 4. VERIFY LIST ==="
curl -s --max-time 20 http://localhost:3000/api/smart-goals -H "$AUTH" -o "$OUT/list-after.json" -w "http=%{http_code}\n"
bun -e "
const j = await Bun.file('$OUT/list-after.json').json();
console.log('count =', j.goals?.length);
for (const g of j.goals ?? []) console.log(' -', g.status.padEnd(8), g.title);
" 2>/dev/null
