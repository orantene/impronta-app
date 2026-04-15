# UI interaction standards

Short conventions for **public directory**, **public profile**, **inquiry**, and **admin** — aligned with the frozen roadmap (layout shells unchanged; clarity and feedback improved).

Dashboard layout, shell, and reusable UI rules are defined in the [Dashboard UX / Design System Spec](dashboard-ux-design-system.md).

## Global

- **Loading:** Prefer skeletons (`web/src/components/ui/skeleton.tsx`) over blank regions for lists and media.
- **Empty:** Explain *why* (no matches vs filters too narrow) where practical.
- **Errors:** User-visible message + non-destructive recovery; log server-side details.
- **Focus:** Keyboard-accessible modals and inquiry flows; preserve focus on open/close.

## Directory (Phase 6)

- **Frozen:** Grid shell, filter sidebar placement, overall discovery IA — do not redesign.
- **URL state:** `q`, `tax`, `location`, `sort`, `hmin`/`hmax`, `view` — shareable; canonical rules in `canonicalizeDirectorySearchParams`.
- **Search debounce (AI):** When wiring embedding calls, use **250–400ms** debounce (plan §12).

## Public profile (Phase 7)

- **Frozen:** Hero / bio / gallery / primary CTA **regions** — same order and shell.
- **Contact:** Inquiry flow must show pending/success/error; align with `directory-inquiry-actions` / cart patterns.

## Inquiry / contact (Phase 5)

- **Storage:** `inquiries` + `inquiry_talent`; status labels must match DB enum (see `web/src/lib/inquiries.ts`).
- **Manual path:** Always available; AI draft is progressive enhancement only.

## Admin (Phase 8)

- **Frozen:** Table/drawer layouts per `web/docs/admin-ux-architecture.md`.
- **Settings:** Feature flags including AI toggles live under **Admin → Settings** (`KNOWN_SETTINGS`).

## AI surfaces (Phase 8.7+)

- Wrap AI subtrees in **`AIErrorBoundary`** (`web/src/components/ai/ai-error-boundary.tsx`).
- **Performance:** ~150ms skeleton in AI-only regions; server timeout fallback per plan §7.
