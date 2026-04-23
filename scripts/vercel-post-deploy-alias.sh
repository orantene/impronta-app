#!/usr/bin/env bash
# Re-alias the two domains that can't be attached at the project level because
# they're "ghost-owned" by a deleted Vercel project (prj_K0qqjTs5N19a9n9gM41klhJXV7jO).
# `www.tulala.digital` + `impronta.tulala.digital` + the default vercel.app host
# are attached normally and auto-alias via `autoAssignCustomDomains`, so they're
# not listed here.
#
# Run after every production deploy until Vercel releases the orphan lock
# (file a support ticket referencing the defunct project id if you want it
# cleared sooner).
#
# Usage:
#   ./scripts/vercel-post-deploy-alias.sh                 # aliases latest prod deploy
#   ./scripts/vercel-post-deploy-alias.sh <deployment-url>

set -euo pipefail

TEAM_SLUG="oran-tenes-projects"
PROJECT="tulala"
GHOST_DOMAINS=("tulala.digital" "app.tulala.digital")

if [[ $# -gt 0 ]]; then
  DEPLOY_URL="$1"
else
  DEPLOY_URL=$(vercel ls "$PROJECT" --scope "$TEAM_SLUG" --prod 2>/dev/null \
    | awk 'NR==1{for(i=1;i<=NF;i++)if($i ~ /\.vercel\.app/){print $i; exit}}')
fi

if [[ -z "${DEPLOY_URL:-}" ]]; then
  echo "ERR: could not resolve latest production deployment url" >&2
  exit 1
fi

echo "Aliasing $DEPLOY_URL -> ${GHOST_DOMAINS[*]}"
for DOM in "${GHOST_DOMAINS[@]}"; do
  vercel alias set "$DEPLOY_URL" "$DOM" --scope "$TEAM_SLUG"
done
