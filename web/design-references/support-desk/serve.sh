#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3099}"
echo "Serving Support Desk mockups at http://127.0.0.1:${PORT}/support-desk/"
echo "Directory: ${ROOT}"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT"
