/**
 * TUL-1378: the service hub rules (the approved 20 rules, TUL-1365), as pure,
 * capability-scoped functions. Nothing here names a client or a trade; the five
 * group models are the only vocabulary. Pure, no I/O: readers and actions call
 * these so every surface applies the same rule.
 *
 * Models (TUL-1365): coordinator_agency (the workspace sets the price and talks
 * to the client), friends_collective (an owner coordinates, members never see the
 * client chat), open_network (talents sell directly), rental_studio (members rent
 * the space and sell directly), team_studio (the studio sells its people).
 */

export type HubModel = "coordinator_agency" | "friends_collective" | "open_network" | "rental_studio" | "team_studio";

// ── Plan caps and downgrade ───────────────────────────────────────────────────

/** `joinedAt` null = unknown: such a person counts as the NEWEST, never the longest-standing. */
export type CapCandidate = { id: string; pinned: boolean; joinedAt: string | null };

export type VisibleWithinCap = {
  /** In priority order: the owner's picks first, then longest standing. */
  visibleIds: string[];
  /** Hidden from the public site; still members. */
  hiddenIds: string[];
  /** Always empty: a downgrade never removes anyone. Kept so a caller can assert it. */
  removedIds: string[];
  /** Hidden members who still have open jobs: they keep serving them. */
  keepOpenJobsFor: string[];
};

/**
 * A downgrade (or any roster over its plan cap) HIDES the extra people and never
 * removes them. The owner picks who stays visible (`pinned`); picks fill the cap
 * first (earliest joined wins when there are more picks than seats), then the
 * longest-standing members. `cap` null = unlimited. Open jobs continue.
 */
export function pickVisibleWithinCap(
  people: readonly CapCandidate[],
  cap: number | null,
  opts: { openJobIds?: ReadonlySet<string> } = {},
): VisibleWithinCap {
  const joined = (c: CapCandidate) => (c.joinedAt && c.joinedAt.trim() ? c.joinedAt : null);
  const byJoined = (a: CapCandidate, b: CapCandidate) => {
    const x = joined(a);
    const y = joined(b);
    if (x === y) return 0;
    if (x === null) return 1; // unknown sorts last
    if (y === null) return -1;
    return x.localeCompare(y);
  };
  const ordered = [...people].sort((a, b) => Number(b.pinned) - Number(a.pinned) || byJoined(a, b) || a.id.localeCompare(b.id));
  const keep = cap == null ? ordered.length : Math.max(0, Math.trunc(cap));
  const visibleIds = ordered.slice(0, keep).map((p) => p.id);
  const hiddenIds = ordered.slice(keep).map((p) => p.id);
  return {
    visibleIds,
    hiddenIds,
    removedIds: [],
    keepOpenJobsFor: hiddenIds.filter((id) => opts.openJobIds?.has(id)),
  };
}

// ── Leaving ───────────────────────────────────────────────────────────────────

export type LeavingOutcome = {
  entriesLeaveHub: true;
  /** Open bookings are always honoured; nothing is cancelled by leaving. */
  honourOpenBookings: true;
  /** Where the old links go: the group, else the talent's public profile, else a plain 404. */
  redirectTo: "group" | "talent_profile" | "none";
};

export function leavingOutcome(input: {
  who: "member" | "talent" | "owner";
  hasOpenBookings: boolean;
  groupStillExists: boolean;
  talentHasPublicProfile: boolean;
}): LeavingOutcome {
  return {
    entriesLeaveHub: true,
    honourOpenBookings: true,
    redirectTo: input.groupStillExists ? "group" : input.talentHasPublicProfile ? "talent_profile" : "none",
  };
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export type ReviewRoute = {
  publicOn: "workspace_entry" | "talent";
  /** Coordinator models: the client's private feedback goes to the talent. */
  privateFeedbackToTalent: boolean;
  /** Studio: the public entry reads "with <talent>". */
  withLabel: boolean;
};

export function reviewRoute(model: HubModel): ReviewRoute {
  switch (model) {
    case "coordinator_agency":
    case "friends_collective":
      return { publicOn: "workspace_entry", privateFeedbackToTalent: true, withLabel: false };
    case "team_studio":
      return { publicOn: "workspace_entry", privateFeedbackToTalent: false, withLabel: true };
    case "open_network":
    case "rental_studio":
      return { publicOn: "talent", privateFeedbackToTalent: false, withLabel: false };
  }
}

// ── Whose customer ────────────────────────────────────────────────────────────

/** Talents never get the workspace's customer list. Only that workspace's staff do. */
export function customerListVisible(input: { role: "talent" | "staff"; sameWorkspaceStaff: boolean }): boolean {
  return input.role === "staff" && input.sameWorkspaceStaff;
}

// ── Currency ──────────────────────────────────────────────────────────────────

/** A 3-letter ISO code, upper-cased, or null. Fail closed: a bad or empty value is never turned into "". */
function validCurrency(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** What the hub shows a price in: the workspace currency (with an approximate line), else the service's own. null = no valid currency: show no price. */
export function hubPriceCurrency(input: { workspaceCurrency: string | null; serviceCurrency: string }): string | null {
  return validCurrency(input.workspaceCurrency) ?? validCurrency(input.serviceCurrency);
}

/** The charge is always in the SELLER OF RECORD's currency (the service itself keeps the talent's currency). null = refuse the charge; never the other party's currency. */
export function chargeCurrency(input: { seller: "workspace" | "talent"; workspaceCurrency: string; talentCurrency: string }): string | null {
  return validCurrency(input.seller === "workspace" ? input.workspaceCurrency : input.talentCurrency);
}

// ── Safety officer ────────────────────────────────────────────────────────────

/** Only where the talent talks to the client directly. */
export function safetyOfficerApplies(model: HubModel): boolean {
  return model === "open_network" || model === "rental_studio";
}
