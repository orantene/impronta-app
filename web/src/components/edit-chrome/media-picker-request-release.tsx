"use client";

/**
 * media-picker-request-release.tsx — the way OUT of a locked media tile.
 *
 * The picker's lock note ends with "ask them to release it" and used to stop
 * there: the request UI lives on a completely different surface (the talent's
 * own profile, media section), so the sentence was an instruction with no
 * door. Execution-plan-2026-08-15 §3 B9.
 *
 * Its own file rather than inline in `media-picker-drawer.tsx` because that
 * file sits within a handful of lines of its 800-line max-lines budget.
 *
 * Cool attention blue (#2c5fdb) — admin chrome forbids amber/gold/orange.
 */

import { fireOpenShellDrawer } from "@/components/admin/shell/internal/open-drawer-bridge";

export function RequestReleaseButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        // The profile shell in edit-self mode, scrolled to Media — where the
        // locked tiles and the real "Request release" action live.
        fireOpenShellDrawer("talent-profile-edit", { mode: "edit-self", section: "media" });
      }}
      className="justify-self-start rounded-md border border-[#2c5fdb] px-2 py-1 text-[11px] font-semibold text-[#2c5fdb]"
    >
      {label}
    </button>
  );
}
