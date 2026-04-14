# AI component system (Phase 8.8)

## Implementation status

**Partial:** All **eleven** planned modules exist under `web/src/components/ai/`. Phase **8.8** closes only when wired on real surfaces **and** **every AI-visible subtree** uses **`AIErrorBoundary`** (required — see **`docs/acceptance-checklist.md`**). Compose over `ui/*`. **Recommended order:** finish **8.9 adoption** first.

## Location

`web/src/components/ai/*`

## Components

| File | Export | Role |
|------|--------|------|
| `ai-panel.tsx` | `AIPanel` | Soft container; variants compact/inline/drawer/full |
| `ai-suggestion-chips.tsx` | `AISuggestionChips` | Refine / AI suggestions — **distinct** from `FilterChip` |
| `ai-match-explanation.tsx` | `AIMatchExplanation` | “Why this match” rows |
| `ai-action-button.tsx` | `AIActionButton` | Subtle AI actions |
| `ai-inline-assistant.tsx` | `AIInlineAssistant` | Collapsible toolbar (composes `ui/inline-toolbar`) |
| `ai-workspace-card.tsx` | `AIWorkspaceCard` | Workspace section cards |
| `ai-loading.tsx` | `AILoadingState` | Shimmer / typing dots |
| `ai-empty-state.tsx` | `AIEmptyState` | Idle / disabled copy |
| `ai-compare-table.tsx` | `AICompareTable` | Shortlist compare |
| `ai-drawer.tsx` | `AIDrawer` | Composes `ui/drawer` (sheet) |
| `ai-error-boundary.tsx` | `AIErrorBoundary` | Isolates AI subtree failures |

## Composition rule

`ai/*` **composes** `ui/*` for drawer, skeleton, empty, card shells — no duplicate systems.

## Attach points

Map each component to `attach_point_key` rows in `ai-surface-contracts.md`.
