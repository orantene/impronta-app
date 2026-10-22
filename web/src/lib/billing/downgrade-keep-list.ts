/**
 * TUL-1291 · the keep-list rule of a downgrade, in one pure place so the billed path (stored with the pending change,
 * applied by the webhook at period end) and the unbilled path (applied now) can never disagree about who stays visible.
 *
 * `rosterIds` MUST be read server-side for the caller's own tenant (active + pending rows). A client-sent id that is not in
 * that list is refused, so a keep-list can never name another workspace's talent. When the roster already fits the cap the
 * request is ignored and everyone is kept: a downgrade that fits must never archive anyone.
 */
export type KeepListResult =
  | { ok: true; keep: string[]; overflow: number }
  | { ok: false; code: "needs_selection" | "none_selected" | "too_many" | "not_in_roster"; error: string };

export function resolveKeepList(args: {
  rosterIds: string[];
  /** What the owner picked; undefined when no picker was shown. */
  requestedKeepIds?: string[];
  /** Target plan talent cap; null = unlimited. */
  cap: number | null;
}): KeepListResult {
  const roster = [...new Set(args.rosterIds)];
  const cap = args.cap == null ? null : Math.max(0, args.cap);
  if (cap == null || roster.length <= cap) return { ok: true, keep: roster, overflow: 0 };

  const overflow = roster.length - cap;
  if (args.requestedKeepIds === undefined) {
    return { ok: false, code: "needs_selection", error: `Choose which ${cap} talent stay visible before moving to this plan.` };
  }
  const requested = [...new Set(args.requestedKeepIds)];
  if (requested.length === 0) {
    return { ok: false, code: "none_selected", error: "Choose at least one talent to keep visible." };
  }
  const inRoster = new Set(roster);
  if (requested.some((id) => !inRoster.has(id))) {
    return { ok: false, code: "not_in_roster", error: "Some selected talent are not on your roster." };
  }
  if (requested.length > cap) {
    return { ok: false, code: "too_many", error: `This plan allows up to ${cap} talent. You selected ${requested.length}.` };
  }
  return { ok: true, keep: requested, overflow };
}

/** Picker state transition: toggling an id off always works; toggling one on is ignored once the cap is reached. */
export function toggleKeepSelection(selected: string[], id: string, cap: number): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  if (selected.length >= cap) return selected;
  return [...selected, id];
}
