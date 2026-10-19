/**
 * TUL-1068 / TUL-1070 (P0, server side). A guest "talent" chip carries the
 * client's cart ids. The cart (`saved_talent`) has NO tenant column, so a talent a
 * visitor saved on another tenant's page (e.g. hub TAL-93940) rides into this
 * tenant's inquiry through `useCartTalentPreload` -> `captureGuestChip`. The
 * `startGuestChatInquiry` and `ensureGuestChatInquiry` paths already check the
 * roster; this chip path did not, so the foreign id landed in
 * `interpreted_query.talent.selected_ids` ("inside the qa-paid-owner inquiry").
 *
 * Pure: the roster lookup is injected so a two-tenant test needs no database.
 */
import type { GuestChipValue } from "@/lib/inquiry/guest-chat-contract";

export type RosterFilter = (talentProfileIds: string[]) => Promise<string[]>;

/** Keep only ids on the inquiry's own tenant roster (order and dedupe preserved). */
export async function scopeChipTalentToRoster(
  value: GuestChipValue,
  filterOnRoster: RosterFilter,
): Promise<GuestChipValue> {
  const v = value as { selectedIds?: unknown; selectedNames?: unknown };
  const raw = Array.isArray(v.selectedIds) ? v.selectedIds : [];
  const ids = [...new Set(raw.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean))];
  if (ids.length === 0) return value;
  const allowed = new Set(await filterOnRoster(ids));
  const kept = ids.filter((id) => allowed.has(id));
  if (kept.length === ids.length) return value;
  // Names are aligned to the ids the client sent; once any id is dropped they are
  // no longer aligned, so drop them too (the summary falls back to a count).
  return { ...(value as object), selectedIds: kept, selectedNames: undefined } as GuestChipValue;
}
