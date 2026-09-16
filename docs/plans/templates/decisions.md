# Templates & Imagery — decisions (D-TPL-n)

Recorded by the Templates & Imagery Lead when a choice was open. Each entry: decision, reason, what it would take to reverse.

| Id | Date | Decision | Reason | Reversal cost |
|---|---|---|---|---|
| D-TPL-1 | 2026-09-15 | Work in worktree `/Users/oranpersonal/Desktop/impronta-templates`, branch `feat/templates-looks-stock` off `origin/main@f829ea149`. | Constraint: never `git switch` the shared checkout. | none |
| D-TPL-2 | 2026-09-15 | Investigation cites line numbers from `f829ea149`; later docs cite the branch head named in the doc header. | Lines drift; a cited commit makes every citation checkable. | none |
| D-TPL-3 | 2026-09-15 | Reuse the existing platform-stock design (`tulala` tenant + `media_folders.system_key`) as the base for Layer 3 rather than a new table for image bytes; add a small **manifest table** for type × role × licence and a **tenant folder as shared references**, not copied rows (final shape in 01-plan). | `platform-stock.ts` already isolates stock in a separate lane with a read-only SELECT and an importer; copying rows per tenant would multiply storage by tenant count and make "refresh when admin adds photos" a fan-out write. Shared refs make the cap exemption automatic (rows belong to `tulala`). "Retired photo must not break a published page" is solved by soft-retire (`retired_at`) keeping the object, never deleting it. | Medium: a per-tenant copy model would need a backfill. |
