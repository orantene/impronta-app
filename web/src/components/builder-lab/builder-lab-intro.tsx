"use client";

/**
 * Presentational intro chrome for the Builder Lab (WS5).
 *
 * These pieces live under `components/builder-lab/` (NOT `components/admin/shell`)
 * on purpose: the admin-shell tree is frozen by `ratchet/no-new-inline-style`
 * (a Phase-3 design-token codemod owns that tail), whereas the builder-lab tree
 * is new territory where the lab's other components already style inline. Keeping
 * the page-module (`BuilderLabPage`) and the `platform.tsx` router case free of
 * new inline styles lets them stay inside the frozen area without violations.
 */

import { LAB as HQ, panelStyle, SectionLabel } from "./ui";

/** Title + eyebrow + description shown above the lab tabs. */
export function BuilderLabHeader() {
  return (
    <div data-tulala-page-header style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 6 }}>
        <SectionLabel>Tulala HQ</SectionLabel>
      </div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: -0.4,
          color: HQ.ink,
          margin: 0,
          lineHeight: 1.15,
        }}
      >
        Builder Lab
      </h1>
      <p
        style={{
          fontSize: 13,
          color: HQ.inkMuted,
          margin: "4px 0 0",
          lineHeight: 1.5,
          maxWidth: 680,
        }}
      >
        Author and test page-builder templates against real talent + workspace
        data, then publish them into the consumer gallery. The canvas is
        ephemeral — nothing here touches a live page.
      </p>
    </div>
  );
}

/** Shown when no active platform tenant is bound to the session. */
export function BuilderLabNoTenant() {
  return (
    <section style={{ ...panelStyle, padding: 16, color: HQ.inkMuted, fontSize: 13 }}>
      No active platform tenant is bound to this session. Sign in as a platform
      super admin to use the Builder Lab.
    </section>
  );
}

/** Body of the "access restricted" card shown to non-super_admins. */
export function BuilderLabRestrictedNotice() {
  return (
    <div style={{ color: HQ.inkMuted, fontSize: 13, padding: "10px 0" }}>
      You don&apos;t have permission to author or publish builder templates.
    </div>
  );
}
