#!/bin/bash
# STRUCTURE-1: align web app file structure (frontend/backend layout)
# - untrack stale gitlink backup (dir stays on disk, gitignored later)
# - relocate root strays to their proper homes
# - move 17 client hooks from src/lib/infranex/ to src/hooks/
set -euo pipefail
cd /home/z/my-project

echo "=== 1. Untrack stale gitlink backup (dir stays on disk) ==="
git rm -q --cached infranex-bt-subdir-backup

echo "=== 2. Relocate root strays ==="
git mv convert_to_pdf.py scripts/convert_to_pdf.py
git mv append-recovery2.js scripts/append-recovery2.js
git mv uv.lock backend/uv.lock
git mv Infranex-BT-MVP-Architecture.pdf docs/Infranex-BT-MVP-Architecture.pdf
git mv devops-engine-miner-guide.pdf docs/devops-engine-miner-guide.pdf
mkdir -p docs/deployment
git mv VERCEL_ENV_SETUP.md docs/deployment/VERCEL_ENV_SETUP.md
git mv VERCEL_BACKEND_ENV_VARS.md docs/deployment/VERCEL_BACKEND_ENV_VARS.md
git mv VERCEL_FRONTEND_ENV_VARS.md docs/deployment/VERCEL_FRONTEND_ENV_VARS.md
echo "root strays relocated"

echo "=== 3. Move 17 client hooks lib/infranex -> hooks ==="
HOOKS="use-cpu-offers use-deployments use-devops-monitor use-error-log use-gpu-offers use-health-checks use-local-hosts use-monitoring use-network use-odds use-platform use-profitability use-stake-portfolio use-subnet-overrides use-triggers use-trust use-worker-status"
for h in $HOOKS; do
  git mv "src/lib/infranex/$h.ts" "src/hooks/$h.ts"
done
echo "hooks moved"

echo "=== 4. Server-side consumers import live-merge directly (kill server->hook imports) ==="
sed -i 's|from "./use-network"|from "./live-merge"|' src/lib/infranex/opportunity-score.ts
sed -i 's|from "./use-network"|from "./live-merge"|' src/lib/infranex/trust.ts

echo "=== 5. Rewrite alias import sites @/lib/infranex/use- -> @/hooks/use- ==="
grep -rl '@/lib/infranex/use-' src/ --include='*.ts' --include='*.tsx' | xargs -r sed -i 's|@/lib/infranex/use-|@/hooks/use-|g'

echo "=== 6. Fix relative imports inside moved hooks ==="
python3 scripts/restructure-hook-imports.py

echo "=== 7. Stale-reference sweep (must be silent) ==="
if grep -rn "lib/infranex/use-" src/ --include='*.ts' --include='*.tsx'; then
  echo "FATAL: stale lib/infranex/use- references remain"; exit 1
fi
if grep -rn 'from "./use-network"' src/lib/ --include='*.ts'; then
  echo "FATAL: server->hook import remains"; exit 1
fi
echo "sweep clean"
echo "ALL DONE"
