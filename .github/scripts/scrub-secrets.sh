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

names = sys.argv[1:]
values = sorted(
    (v for v in (os.environ.get(n, "") for n in names) if v),
    key=len,
    reverse=True,
)
for line in sys.stdin:
    for v in values:
        line = line.replace(v, "***")
    sys.stdout.write(line)
' "$@"
