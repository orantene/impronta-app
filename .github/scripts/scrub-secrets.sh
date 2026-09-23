#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Filter: stdin -> stdout with every named env var's literal value replaced by
# "***". Used by .github/workflows/db-push.yml before any command output is
# appended to $GITHUB_STEP_SUMMARY.
#
# WHY: GitHub masks registered secrets in the LOG stream, but a job summary is
# written by the job itself and is not covered by that guarantee. The Supabase
# CLI prints connection targets on failure, so a summary that tees raw CLI
# output is the one place a password or token could surface verbatim. This
# filter makes that impossible regardless of what the CLI decides to print.
#
# Usage:  <command> 2>&1 | .github/scripts/scrub-secrets.sh VAR [VAR...]
# Unset or empty vars are ignored, so callers can list optional ones.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

python3 -c '
import os, sys
from urllib.parse import quote

names = sys.argv[1:]

# A secret does not always appear literally. The Supabase CLI prints connection
# targets like
#   postgresql://postgres.<ref>:<password>@...pooler.supabase.com:5432/postgres
# and a password containing any of @ # / : ? + & or a space arrives
# PERCENT-ENCODED. A literal substring replace misses that form -- and so does
# GitHub own log masking, which only matches the raw secret string. So each
# value is scrubbed in its raw form AND in its URL-quoted form.
raw = [v for v in (os.environ.get(n, "") for n in names) if v]
variants = set()
for v in raw:
    variants.add(v)
    variants.add(quote(v, safe=""))
# Longest first, so a value containing another is masked whole rather than
# partially rewritten by the shorter one.
values = sorted(variants, key=len, reverse=True)
for line in sys.stdin:
    for v in values:
        line = line.replace(v, "***")
    sys.stdout.write(line)
' "$@"
