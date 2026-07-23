/**
 * hub-roster-adapter.ts — pure shape adapter for the HUB-host guest-chat talent
 * picker (P0-5 / W0-F).
 *
 * The platform hub (kind='hub') owns no `agency_talent_roster` of its own, so the
 * agency-scoped `loadDefaultStorefrontRoster` returns an empty/failed roster and
 * the in-chat talent picker shows "Couldn't load the roster." On a hub host the
 * roster must instead come from the cross-tenant Discover index (the same source
 * the global directory lists 100+ profiles from). This maps a
 * `DiscoverTalentListItem` into the `GuestRosterItem` shape the picker consumes.
 *
 * PURE module (no "use server", no supabase, no server-only runtime) so it is
 * unit-testable and safe to import from the guest-roster server action without a
 * non-async export footgun. The two source/target imports are type-only, so they
 * carry no runtime code (the `server-only` guard on discover.ts is erased).
 */

import type { DiscoverTalentListItem } from "@/app/(workspace)/[tenantSlug]/_data-bridge/discover";
import type { GuestRosterItem } from "./guest-chat-unified-contract";

/**
 * Map cross-tenant Discover rows to the guest roster-lite items the in-chat
 * talent picker (SearchTalentField) renders: id / name / category / city / thumb.
 * Public information only — the same name + face a directory card already shows.
 * Nulls are normalized to `undefined` so the item matches the agency-path shape
 * (`loadDefaultStorefrontRoster` maps the same way).
 */
export function discoverTalentsToRosterItems(
  items: readonly DiscoverTalentListItem[],
): GuestRosterItem[] {
  return items.map((t) => ({
    id: t.id,
    name: t.displayName,
    primaryTypeLabel: t.primaryTypeLabel ?? undefined,
    city: t.homeCity ?? undefined,
    photoUrl: t.headshotUrl,
  }));
}
