#!/usr/bin/env bash
# push-live.sh — push the InfranExBT platform to GitHub (platform-live).
#
# Usage:  TOKEN=github_pat_xxx bash scripts/push-live.sh
#
# The token is used transiently for this one push (embedded only in the
# one-shot push URL, never written to git config, files, or shell history
# beyond this invocation). Revoking the PAT immediately revokes access.
#
# Token requirements (fine-grained PAT, short expiry recommended):
#   Repository access: Only select repositories → infranexbt-bot/infranex-bt
#   Permissions:       Contents → Read and write
#
# Pushes local `main` → remote `platform-live`.

set -euo pipefail

REPO="infranexbt-bot/infranex-bt"
LOCAL_BRANCH="main"
REMOTE_BRANCH="platform-live"

if [[ -z "${TOKEN:-}" ]]; then
  echo "ERROR: set TOKEN=<your fine-grained PAT> before calling this script." >&2
  echo "  TOKEN=github_pat_xxx bash scripts/push-live.sh" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "== Project state =="
git log --oneline -3
echo "Working tree: $(git status --short | wc -l) uncommitted change(s)"
echo

echo "== Pushing ${LOCAL_BRANCH} → https://github.com/${REPO} (branch: ${REMOTE_BRANCH}) =="
git push "https://x-access-token:${TOKEN}@github.com/${REPO}.git" \
  "${LOCAL_BRANCH}:${REMOTE_BRANCH}"

echo
echo "== Push complete. Verify: https://github.com/${REPO}/tree/${REMOTE_BRANCH} =="
