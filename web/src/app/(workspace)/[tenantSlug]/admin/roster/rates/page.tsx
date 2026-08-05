// Admin — Roster · Rates.
//
// Per-talent day rates live HERE, next to the roster, because they are roster
// DATA: you work down the list of people you represent. The tenant-wide
// FALLBACK (what a card shows when a talent has no price of their own) is a
// policy and stays in Settings → Starting prices.
//
// They were originally shipped together under Settings, which conflated the
// two: editing 51 individual people is not a "setting".
//
// Capability + tenant scoping are enforced inside the server actions the
// client card calls (see lib/server-actions/admin-roster-rates.ts), which is
// also what the sibling roster sub-pages rely on.

import { RosterRateCardEditor } from "@/components/admin/account/RosterRateCardEditor";

export const dynamic = "force-dynamic";

export default function AdminRosterRatesPage() {
  // Hosted INSIDE the workspace shell's <main> via the canonical-route
  // matcher in admin-shell-client.tsx — the shell supplies page padding,
  // so this wrapper only constrains width.
  return (
    <div className="mx-auto w-full max-w-5xl">
      <RosterRateCardEditor />
    </div>
  );
}
