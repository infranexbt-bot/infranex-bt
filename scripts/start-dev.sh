#!/bin/bash
# Start the InfranexBT dev server detached from the calling shell.
# Heap capped at 2GB — the container has 4GB total and the chain workers
# (polkadot.js buffers) can otherwise balloon past that and get OOM-killed.
cd /home/z/my-project
export DATABASE_URL=file:/home/z/my-project/db/custom.db
export NODE_OPTIONS=--max-old-space-size=2048
# Boot without background workers — the 4GB sandbox OOM-kills the boot-time
# chain sweep + GitHub scrape storm (3 confirmed OOM kills on 2026-09-27).
# The UI stays live: /api/network serves the snapshot on demand (SWR).
# Remove this line to run the full worker fleet.
export INFRANEX_WORKERS=off
exec npx next dev -p 3000 2>&1 | tee dev.log
