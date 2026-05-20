# F2 — Class A Flip Deferred List

Files F1's Class A classifier flagged as server-renderable that F2's
manual spot-check declined to flip. One line per file with reason.

Format: `<path> — <reason>`

- `web/src/app/(workspace)/[tenantSlug]/talent/profile/fields/talent-self-fields-editor.tsx` — Explicit server/client boundary. Passes inline closures `(input) => getFieldsForTalentAsTalent(input)` wrapping server actions to a client child (`LiveCategoryFieldsEditor` is `"use client"`). Inline closures are NOT serializable across the RSC boundary (only `"use server"`-marked references are). F1 classifier didn't analyze function-typed prop serializability. Page.tsx comment confirms intent ("hands off to a client component that mounts LiveCategoryFieldsEditor").

