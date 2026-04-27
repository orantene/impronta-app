/**
 * Admin Shell prototype — TEMPORARILY QUARANTINED.
 *
 * The 10 supporting files (_client.tsx, _drawers.tsx, _pages.tsx, _palette.tsx,
 * _platform.tsx, _primitives.tsx, _state.tsx, _talent.tsx, _wave2.tsx,
 * _workspace.tsx) are renamed to `.tsx.quarantined` so Turbopack does not parse
 * them. _pages.tsx had a syntax issue blocking the production build during
 * Phase E Batch 3 halfway audit deploy. Per master-plan §99, the entire
 * admin-shell prototype directory is on the REMOVE list — this is the
 * removal-path baggage cleanup, not a rescue.
 *
 * If the prototype is needed again: rename `*.tsx.quarantined` files back
 * to `*.tsx`, fix the syntax in _pages.tsx around line 873, and restore
 * the original page.tsx body (`"use client"` + ProtoProvider mount).
 */
export default function AdminShellPrototypePage() {
  return (
    <main style={{ padding: "48px 24px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 500 }}>Admin Shell prototype — quarantined</h1>
      <p style={{ marginTop: 12, color: "#666" }}>
        Temporarily disabled to unblock the build. See {`/web/src/app/prototypes/admin-shell/page.tsx`} for restoration steps.
      </p>
    </main>
  );
}
