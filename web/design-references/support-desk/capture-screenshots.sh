#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-/workspace/.claude/worktrees/support-desk-05/web/design-references/support-desk/screenshots}"
STORE_OUT="${2:-/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/media/support-desk-phase-05}"
BASE="http://127.0.0.1:3099/support-desk/index.html"
mkdir -p "$OUT" "$STORE_OUT"
CHROME="${CHROME:-google-chrome}"

capture() {
  local name="$1" route="$2" width="$3" height="$4" theme="$5"
  local viewport="desktop"
  [[ "$width" == "390" || "$width" == "360" ]] && viewport="mobile"
  local url="${BASE}?theme=${theme}&viewport=${viewport}#/${route}"
  local file="${name}.png"
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --no-sandbox \
    --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size="${width},${height}" \
    --screenshot="${OUT}/${file}" \
    --virtual-time-budget=6000 \
    "$url" \
    >/tmp/chrome-shot.log 2>&1 || true
  if [[ -s "${OUT}/${file}" ]]; then
    cp -f "${OUT}/${file}" "${STORE_OUT}/${file}"
    echo "OK ${file} ($(wc -c <"${OUT}/${file}") bytes)"
  else
    echo "FAIL ${file}"
    tail -20 /tmp/chrome-shot.log || true
  fi
}

shots=(
  "A-login-default|login/default|1440|900|light"
  "A-login-invalid|login/invalid|1440|900|light"
  "A-login-owner|login/owner|1440|900|light"
  "B-inbox|inbox/needs_you|1440|900|light"
  "C-thread|thread/c1|1440|900|light"
  "D-composer-note|composer/note|1440|900|light"
  "D-composer-canned|composer/canned|1440|900|light"
  "E-context-rich|context/rich|1440|900|light"
  "E-context-empty|context/empty|1440|900|light"
  "F-cmdk|cmdk/default|1440|900|light"
  "G-empty-inbox|empty/inbox|1440|900|light"
  "G-skeleton|empty/skeleton|1440|900|light"
  "G-realtime|empty/realtime|1440|900|light"
  "I-insights|insights|1440|900|light"
  "hub|hub|1440|900|light"
  "journeys|journeys|1440|900|light"
  "B-inbox|inbox/needs_you|1440|900|dark"
  "C-thread|thread/c1|1440|900|dark"
  "F-cmdk|cmdk/default|1440|900|dark"
  "I-insights|insights|1440|900|dark"
  "A-login-default|login/default|1440|900|dark"
  "H-queues|mobile/queues|390|844|light"
  "H-list|mobile/list|390|844|light"
  "H-thread|mobile/thread|390|844|light"
  "H-context|mobile/context|390|844|light"
  "H-keyboard|mobile/keyboard|390|844|light"
  "H-note|mobile/note|390|844|light"
  "H-ai|mobile/ai|390|844|light"
  "A-login-default|login/default|390|844|light"
  "H-thread|mobile/thread|390|844|dark"
  "B-inbox|inbox/needs_you|390|844|dark"
)

for spec in "${shots[@]}"; do
  IFS='|' read -r name route w h theme <<<"$spec"
  capture "${name}-${w}-${theme}" "$route" "$w" "$h" "$theme"
done

echo "Done."
ls -la "$OUT"
