#!/usr/bin/env bash
# Read-only checks for Cursor MCP setup (Phase 1). Run from repo root: bash scripts/verify-mcp-prereqs.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== MCP prereq checks (read-only) ==="
echo

# Docker (required for GitHub MCP in .cursor/mcp.json)
if command -v docker >/dev/null 2>&1; then
  echo "[OK] docker on PATH: $(command -v docker)"
  docker version --format '{{.Server.Version}}' 2>/dev/null && echo "    Docker daemon responding" || echo "[WARN] docker CLI present but daemon may not be running (start Docker Desktop)"
elif [[ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]]; then
  echo "[PARTIAL] Docker.app installed but docker not on PATH."
  echo "    Fix: Open Docker Desktop → Settings → Advanced → enable CLI, or add:"
  echo "    /Applications/Docker.app/Contents/Resources/bin to PATH for Cursor."
else
  echo "[BLOCKED] Docker Desktop not found."
  echo "    Fix: Install https://www.docker.com/products/docker-desktop/ (mac: brew install --cask docker)"
fi
echo

# GitHub PAT (Docker MCP loads from env file)
ENV_FILE="$ROOT/.cursor/github-mcp.env"
if [[ -f "$ENV_FILE" ]]; then
  if grep -qE '^GITHUB_PERSONAL_ACCESS_TOKEN=.{20,}' "$ENV_FILE" 2>/dev/null; then
    echo "[OK] $ENV_FILE has GITHUB_PERSONAL_ACCESS_TOKEN set (value not shown)"
  else
    echo "[BLOCKED] $ENV_FILE missing or short GITHUB_PERSONAL_ACCESS_TOKEN"
    echo "    Fix: paste PAT from https://github.com/settings/personal-access-tokens/new then restart Cursor"
  fi
else
  echo "[BLOCKED] Missing $ENV_FILE — copy .cursor/github-mcp.env.example"
fi
echo

# Supabase MCP URL (read-only flag)
MCP_JSON="$ROOT/.cursor/mcp.json"
if [[ -f "$MCP_JSON" ]] && grep -q 'read_only=true' "$MCP_JSON" && grep -q 'mcp.supabase.com' "$MCP_JSON"; then
  echo "[OK] Supabase MCP URL includes read_only=true"
else
  echo "[WARN] Check $MCP_JSON for Supabase read_only=true"
fi
echo

echo "=== OAuth (manual in Cursor) ==="
echo "Supabase + Vercel: Settings → Tools & MCP → connect until no 'Needs login'."
echo
echo "=== In-IDE validation prompts (Cursor chat) ==="
echo "Supabase: list tables; describe columns for public.profiles"
echo "GitHub: list root files; show content of web/package.json"
echo "Vercel: list my projects; latest deployment for this repo"
echo "Playwright: navigate http://localhost:3000 and click directory nav"
echo
echo "MCP logs: Output panel → dropdown → MCP (or MCP Logs)"
