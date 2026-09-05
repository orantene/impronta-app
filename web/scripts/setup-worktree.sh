#!/usr/bin/env bash
#
# setup-worktree.sh — Initialize a freshly-added git worktree for local dev.
#
# Why this exists (L51):
# - Turbopack rejects a `web/node_modules` SYMLINK with the error:
#   "Symlink … points out of the filesystem root"
#   …so `ln -s` is not safe for any worktree where you intend to run
#   `npm run build` or `npm run dev`.
# - `npm install` from scratch in each worktree is ~5+ min.
# - `cp -R` from the shared checkout's node_modules is ~5 seconds and
#   produces a real directory Turbopack accepts.
#
# This script also copies `.env.local` (Supabase + Stripe + Places creds)
# so the worktree can run server-side code immediately.
#
# Usage:
#   ./web/scripts/setup-worktree.sh [worktree_path]
#
# Defaults: uses the current worktree (`git rev-parse --show-toplevel`).
# Source: the canonical shared checkout at /Users/oranpersonal/Desktop/impronta-app.

set -euo pipefail

SOURCE_REPO="${IMPRONTA_SOURCE_REPO:-/Users/oranpersonal/Desktop/impronta-app}"
TARGET="${1:-$(git rev-parse --show-toplevel)}"

if [[ ! -d "$TARGET/web" ]]; then
  echo "✗ Expected $TARGET/web to exist (is this a worktree of the impronta-app repo?)" >&2
  exit 1
fi

if [[ "$TARGET" == "$SOURCE_REPO" ]]; then
  echo "✗ Refusing to initialize the source repo onto itself ($SOURCE_REPO)" >&2
  exit 1
fi

# 1. node_modules — `cp -R` not `ln -s`.
if [[ -L "$TARGET/web/node_modules" ]]; then
  echo "→ Removing existing symlink at $TARGET/web/node_modules"
  rm "$TARGET/web/node_modules"
fi

if [[ -d "$TARGET/web/node_modules" ]]; then
  echo "✓ node_modules already present at $TARGET/web/node_modules (skipping cp)"
else
  echo "→ Copying node_modules (~5s, vs ~5-min cold npm install)…"
  cp -R "$SOURCE_REPO/web/node_modules" "$TARGET/web/node_modules"
  echo "✓ node_modules copied from source"
fi

# Sync any deps the source checkout was missing (e.g. when the source is on a
# different branch than the worktree). `--prefer-offline --no-audit --no-fund`
# keeps this fast: no-op when in sync, fills the gap from cache when not.
echo "→ Syncing deps against this worktree's package.json…"
(cd "$TARGET/web" && npm install --prefer-offline --no-audit --no-fund 2>&1 | tail -3) || true

# 2. .env.local — Supabase + Stripe + Places creds.
if [[ -f "$TARGET/web/.env.local" ]]; then
  echo "✓ .env.local already present (skipping)"
else
  if [[ -f "$SOURCE_REPO/web/.env.local" ]]; then
    cp "$SOURCE_REPO/web/.env.local" "$TARGET/web/.env.local"
    echo "✓ .env.local copied from source"
  else
    echo "⚠ No .env.local in source repo; you'll need to provision one for server-side code" >&2
  fi
fi

# 3. Quick sanity check — package.json present, tsc resolvable.
if [[ ! -f "$TARGET/web/package.json" ]]; then
  echo "✗ Missing $TARGET/web/package.json — worktree may be on a pre-2026 branch" >&2
  exit 1
fi

if [[ ! -x "$TARGET/web/node_modules/.bin/tsc" ]]; then
  echo "⚠ tsc binary not found at $TARGET/web/node_modules/.bin/tsc" >&2
  echo "  Try: cd $TARGET/web && npm install --prefer-offline --no-audit" >&2
else
  echo "✓ tsc binary resolves"
fi

echo ""
echo "✓ Worktree initialized: $TARGET"
echo ""
echo "  Next:"
echo "    cd $TARGET/web"
echo "    npm run typecheck   # takes the machine-wide tsc lock; never npx tsc directly"
echo "    npm run lint"
