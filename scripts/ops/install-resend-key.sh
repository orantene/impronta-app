#!/usr/bin/env bash
# Item #24 ops script — install RESEND_API_KEY into Vercel production.
# Unblocks B8 (inquiry-received confirmation emails).
#
# Prereqs:
#   - Resend account created at https://resend.com
#   - API key generated from dashboard
#   - Vercel CLI installed + logged in: vercel login
#
# Usage:
#   ./scripts/ops/install-resend-key.sh
#   Pipes the API key from stdin to avoid leaking it on the cmdline:
#     echo "re_xxx..." | ./scripts/ops/install-resend-key.sh

set -euo pipefail

if ! command -v vercel >/dev/null 2>&1; then
  echo "ERROR: vercel CLI not installed. npm i -g vercel"
  exit 1
fi

if [ -t 0 ]; then
  echo "→ Paste your Resend API key (starts with 're_'):"
  read -rs KEY
  echo
else
  read -r KEY
fi

if [ -z "${KEY:-}" ]; then
  echo "ERROR: no key provided"
  exit 1
fi

if [[ ! "$KEY" =~ ^re_ ]]; then
  echo "WARNING: key doesn't start with 're_' — continuing anyway"
fi

printf '%s' "$KEY" | vercel env add RESEND_API_KEY production
echo
echo "→ Key installed. Redeploy + promote:"
echo "   vercel --prod"
echo "   vercel alias set <preview-url> app.tulala.digital --scope oran-tenes-projects"
echo "   vercel alias set <preview-url> tulala.digital --scope oran-tenes-projects"
