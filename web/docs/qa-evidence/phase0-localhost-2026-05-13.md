# Phase 0 / 7A Localhost QA Evidence - 2026-05-13

Host: `http://localhost:3002/impronta?edit=1`

Scope note: this is local in-app-browser QA only. It is not registered-host evidence and must not close the registered-host matrix or 7A human acceptance gates by itself.

## Viewport Matrix

The local draft contained:

- `A house of curated talent.` section
- `Blank section`
- nested builder blocks under the blank section: card title, primary action, supporting copy

| Width | Inserted content visible | Navigator sync | Publish preflight | Console red errors | Evidence |
| --- | --- | --- | --- | --- | --- |
| ~390 | Pass | Pass | Pass - Publish now present / dry-run | Pass | `phase0-2026-05-13-localhost-3002-390.png` |
| ~820 | Pass | Pass | Pass - Publish now present / dry-run | Pass | `phase0-2026-05-13-localhost-3002-820.png` |
| ~1440 | Pass | Pass | Pass - Publish now present / dry-run | Pass | `phase0-2026-05-13-localhost-3002-1440.png` |

Policy note: local dry-run only; `Publish now` was not clicked.

## 7A Reality Flow

Partial local result: Blocked.

Passed before blocker:

- Draft opened on localhost edit mode.
- Inserted content and nested builder blocks persisted across reload.
- Navigator showed the section and nested blocks.
- Publish preflight reported all checks passed.
- Browser tab console showed no red app errors in the viewport sweep.

Blocked at:

- After the viewport/reload pass, the editor entered a persistent `Saving draft...` / `Saving your last edit...` state.
- The dev server logged a server-action 500 / unexpected response during the edit reload flow.
- Publish stayed disabled because the global saving state did not clear.

Engineering follow-up landed locally:

- Guarded composition save, builder-tree save, and explicit Save draft calls with `safeAction` so transport failures return inline errors instead of leaving the editor stuck in saving state.

Verification completed:

- `npm --prefix web run typecheck` - Pass
- `node -r ./scripts/eslint-node-polyfill.cjs ./node_modules/eslint/bin/eslint.js src/components/edit-chrome/edit-context.tsx src/components/edit-chrome/empty-canvas-starter.tsx src/components/edit-chrome/composition-library.tsx src/lib/site-admin/edit-mode/safe-action.ts --suppressions-location eslint-suppressions.json` - Pass
- `npm exec -- tsx --test src/lib/site-admin/builder-node/p7a-reorder-publish-parity.test.ts` from `web/` - Pass

Remaining:

- Reopen the in-app browser pane and re-run the save-state recovery check after the patch.
- Complete a registered-host run before updating `phase-0-qa-registered-host.md` or closing 7A human gates.
