/**
 * entries.ts — the owner's service hub: groups of what people offer, as ONE
 * entry the workspace sells (TUL-1369). Pure; the screen and the actions call it.
 *
 * Grouping rule (approved): only the SAME category, a duration within 15
 * minutes and the SAME booking type. A missing category or duration never
 * matches. "Suggestions" are rule based and deterministic: same input, same
 * output; nothing here calls a model.
 */

export const DURATION_TOLERANCE_MINUTES = 15;

export type BookingType = "request" | "instant";

export type EntryListing = {
  listingId: string;
  talentProfileId: string;
  talentName: string;
  title: string;
  categoryId: string | null;
  durationMinutes: number | null;
  bookingType: BookingType;
  priceCents: number | null;
  currency: string;
  /** The entry that holds it, or null when it waits in the review queue. */
  entryId: string | null;
  /** The talent has consented to the listing. */
  talentAccepted: boolean;
};

export type GroupBlocker = "category" | "duration" | "booking_type";

export function groupBlockers(a: EntryListing, b: EntryListing): GroupBlocker[] {
  const out: GroupBlocker[] = [];
  if (a.categoryId == null || b.categoryId == null || a.categoryId !== b.categoryId) out.push("category");
  if (
    a.durationMinutes == null ||
    b.durationMinutes == null ||
    Math.abs(a.durationMinutes - b.durationMinutes) > DURATION_TOLERANCE_MINUTES
  ) {
    out.push("duration");
  }
  if (a.bookingType !== b.bookingType) out.push("booking_type");
  return out;
}

function spreadWithin(items: readonly EntryListing[]): boolean {
  const d = items.map((i) => i.durationMinutes);
  if (d.some((x) => x == null)) return false;
  const nums = d as number[];
  return Math.max(...nums) - Math.min(...nums) <= DURATION_TOLERANCE_MINUTES;
}

export type JoinCheck = { ok: true } | { ok: false; blockers: Array<GroupBlocker | "already_member"> };

/** Compatible with EVERY member, and the whole group's spread stays within the tolerance (no chains of small steps). */
export function canJoinEntry(members: readonly EntryListing[], candidate: EntryListing): JoinCheck {
  if (members.some((m) => m.listingId === candidate.listingId)) return { ok: false, blockers: ["already_member"] };
  if (members.length === 0) return { ok: true };
  const blockers = new Set<GroupBlocker>();
  for (const m of members) for (const b of groupBlockers(m, candidate)) blockers.add(b);
  if (!spreadWithin([...members, candidate])) blockers.add("duration");
  const order: GroupBlocker[] = ["category", "duration", "booking_type"];
  const list = order.filter((b) => blockers.has(b));
  return list.length === 0 ? { ok: true } : { ok: false, blockers: list };
}

export type Difference = { field: "price" | "duration" | "title"; values: Array<{ talentName: string; value: number | string | null }> };

/** What differs between the people in one entry, per person; fields that match are not listed. */
export function perTalentDifferences(members: readonly EntryListing[]): Difference[] {
  if (members.length < 2) return [];
  const fields: Array<[Difference["field"], (m: EntryListing) => number | string | null]> = [
    ["price", (m) => m.priceCents],
    ["duration", (m) => m.durationMinutes],
    ["title", (m) => m.title],
  ];
  const out: Difference[] = [];
  for (const [field, get] of fields) {
    const vals = members.map(get);
    if (new Set(vals.map((v) => JSON.stringify(v))).size > 1) {
      out.push({ field, values: members.map((m) => ({ talentName: m.talentName, value: get(m) })) });
    }
  }
  return out;
}

export type GroupSuggestion = {
  categoryId: string;
  bookingType: BookingType;
  listingIds: string[];
  differences: Difference[];
};

export function suggestGroups(listings: readonly EntryListing[]): GroupSuggestion[] {
  const pool = listings.filter((l) => l.entryId == null && l.talentAccepted && l.categoryId != null && l.durationMinutes != null);
  const clusters = new Map<string, EntryListing[]>();
  for (const l of pool) {
    const key = `${l.categoryId}|${l.bookingType}`;
    clusters.set(key, [...(clusters.get(key) ?? []), l]);
  }
  const out: GroupSuggestion[] = [];
  for (const [, items] of [...clusters.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...items].sort((a, b) => (a.durationMinutes! - b.durationMinutes!) || a.listingId.localeCompare(b.listingId));
    let bucket: EntryListing[] = [];
    const flush = () => {
      if (bucket.length >= 2) {
        out.push({
          categoryId: bucket[0].categoryId!,
          bookingType: bucket[0].bookingType,
          listingIds: bucket.map((b) => b.listingId),
          differences: perTalentDifferences(bucket),
        });
      }
      bucket = [];
    };
    for (const l of sorted) {
      if (bucket.length > 0 && l.durationMinutes! - bucket[0].durationMinutes! > DURATION_TOLERANCE_MINUTES) flush();
      bucket.push(l);
    }
    flush();
  }
  return out;
}

export type QueueOption = "accept_into_group" | "new_entry" | "skip";
export type QueueItem = { listing: EntryListing; joinableEntryIds: string[]; options: QueueOption[] };

/**
 * New services offered by people and accepted by them, not held by any entry yet.
 * Each can be accepted into a compatible group, made a new entry, or skipped.
 */
export function reviewQueue(
  listings: readonly EntryListing[],
  entries: ReadonlyArray<{ entryId: string; listings: readonly EntryListing[] }>,
): QueueItem[] {
  return listings
    .filter((l) => l.entryId == null && l.talentAccepted)
    .map((listing) => {
      const joinableEntryIds = entries.filter((e) => canJoinEntry(e.listings, listing).ok).map((e) => e.entryId);
      return { listing, joinableEntryIds, options: joinableEntryIds.length > 0 ? ["accept_into_group", "new_entry", "skip"] : ["new_entry", "skip"] } satisfies QueueItem;
    });
}

export type MergeCheck = { ok: true } | { ok: false; blockers: Array<GroupBlocker | "empty"> };

export function mergeCheck(a: readonly EntryListing[], b: readonly EntryListing[]): MergeCheck {
  if (a.length === 0 || b.length === 0) return { ok: false, blockers: ["empty"] };
  const all = [...a, ...b];
  const blockers = new Set<GroupBlocker>();
  for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) for (const x of groupBlockers(all[i], all[j])) blockers.add(x);
  if (!spreadWithin(all)) blockers.add("duration");
  const list = (["category", "duration", "booking_type"] as GroupBlocker[]).filter((x) => blockers.has(x));
  return list.length === 0 ? { ok: true } : { ok: false, blockers: list };
}

export type SplitCheck =
  | { ok: true; keep: string[]; out: string[] }
  | { ok: false; reason: "nothing_to_split" | "nothing_left" | "not_a_member" };

export function splitCheck(members: readonly EntryListing[], splitOutIds: readonly string[]): SplitCheck {
  const ids = new Set(members.map((m) => m.listingId));
  const out = [...new Set(splitOutIds)];
  if (out.length === 0) return { ok: false, reason: "nothing_to_split" };
  if (out.some((id) => !ids.has(id))) return { ok: false, reason: "not_a_member" };
  const keep = members.map((m) => m.listingId).filter((id) => !out.includes(id));
  if (keep.length === 0) return { ok: false, reason: "nothing_left" };
  return { ok: true, keep, out };
}
