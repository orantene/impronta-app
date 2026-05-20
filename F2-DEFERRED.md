# F2 — Class A Flip Deferred List

Files F1's Class A classifier flagged as server-renderable that F2's
manual spot-check declined to flip. One line per file with reason.

Format: `<path> — <reason>`

- `web/src/app/(workspace)/[tenantSlug]/talent/profile/fields/talent-self-fields-editor.tsx` — Explicit server/client boundary. Passes inline closures `(input) => getFieldsForTalentAsTalent(input)` wrapping server actions to a client child (`LiveCategoryFieldsEditor` is `"use client"`). Inline closures are NOT serializable across the RSC boundary (only `"use server"`-marked references are). F1 classifier didn't analyze function-typed prop serializability. Page.tsx comment confirms intent ("hands off to a client component that mounts LiveCategoryFieldsEditor").
- `web/src/components/admin/shell/internal/messages.tsx` — Re-export barrel (Phase 1c decomp) that re-exports `usePresence` (a custom hook) plus dispatches into three client sub-shells (AdminOperationsShell / TalentJobShell / ClientProjectShell). F1 classifier looks only at hook USE, not hook RE-EXPORTS. Load-bearing module — risk-reward wrong on a barrel that 14+ consumers import. Bundle-graph subtleties (server importers tree-shaking re-exported hooks, etc.) are not catchable by tsc+lint. Flag for human review with bundle-analyzer in hand.
- `web/src/components/admin/shell/internal/metrics-ribbon.tsx` — **F1 classifier bug.** The audit script's `NAMED_IMPORT_BLOCK_RE = r"import\s*(?:type\s*)?\{...}"` does NOT match `import React, { useState, useEffect } from "react"` (default+named import), so it missed both `useState` and `useEffect`. File uses both inside `useEffect(...)` to fetch via server action `getTalentMetrics` and render results. Genuine client component. Only Class A file with this default+named React import pattern (verified by grep).
- `web/src/components/admin/shell/internal/page-modules/pages-dynamic.tsx` — Uses `dynamic(..., { ssr: false })` from `next/dynamic`. Next.js forbids `ssr: false` in Server Components (build error: "ssr: false is no longer supported in dynamic() in a Server Component"). F1's classifier doesn't track `next/dynamic` or its `ssr: false` option. All 4 exports are client-only dynamic imports — this is intentionally a client boundary.

