/**
 * TUL-1374: the money split of a Friends collective, applied when an order is
 * priced. The owner takes a % or a fixed amount from each member's line (capped
 * at 90%); the member is paid the rest. It is expressed through the order
 * line's `talent_cost_cents` (what the payee receives), so the commission
 * engine, the checkout collect and the payouts need no new split mode: the
 * workspace's lane is exactly the owner's take, and the line itself is the
 * snapshot, frozen on the order when it is created. Nothing here changes a
 * price, a platform fee or an amount the client pays.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { FRIENDS_COLLECTIVE_MODEL, buildLineSnapshot, memberNetCents, validateOwnerShare, type OwnerShare } from "./friends-collective";

export const SPLIT_UNAVAILABLE_MESSAGE = "We could not confirm the split for this order. Nothing was charged. Try again.";

type ShareRow = {
  owner_share_kind?: unknown;
  owner_share_bps?: unknown;
  owner_share_cents?: unknown;
  owner_share_currency?: unknown;
};

/** A roster row's stored share, or null when unset, half filled or invalid. */
export function parseOwnerShareRow(row: ShareRow): OwnerShare | null {
  let share: OwnerShare | null = null;
  if (row.owner_share_kind === "percent" && typeof row.owner_share_bps === "number") {
    share = { kind: "percent", bps: row.owner_share_bps };
  } else if (row.owner_share_kind === "fixed" && typeof row.owner_share_cents === "number" && typeof row.owner_share_currency === "string") {
    share = { kind: "fixed", amountCents: row.owner_share_cents, currency: row.owner_share_currency.trim().toUpperCase() };
  }
  return share && validateOwnerShare(share).ok ? share : null;
}

type SplitLine = {
  talentProfileId: string | null;
  totalCents: number;
  talentCostCents: number;
  label: string;
  /** Set when a share was applied: the owner's take and the accepted-share snapshot, frozen on the line. */
  ownerTakeCents?: number;
  ownerShareSnapshot?: Record<string, unknown>;
};

/** The split applies only when COLLECTIVE_SPLIT_ENABLED is exactly 1 (default OFF, staging first). */
export function collectiveSplitEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COLLECTIVE_SPLIT_ENABLED === "1";
}

export type AcceptedShare = { share: OwnerShare; version: number };

const LABEL_MAX = 300;

/**
 * New lines with each member's cost set to her line minus the owner's take. A
 * member with no share set keeps her line; a line with no talent is untouched.
 * A fixed share in another currency than the order refuses (never converted).
 */
export function applySharesToLines<L extends SplitLine>(
  lines: readonly L[],
  shares: ReadonlyMap<string, AcceptedShare>,
  orderCurrency: string,
  names: ReadonlyMap<string, string> = new Map(),
): { ok: true; lines: L[] } | { ok: false; error: "share_currency_mismatch" } {
  const out: L[] = [];
  for (const l of lines) {
    const next: L = { ...l, label: withMemberName(l.label, l.talentProfileId ? names.get(l.talentProfileId) : undefined) };
    const accepted = l.talentProfileId ? shares.get(l.talentProfileId) : undefined;
    if (accepted) {
      const { share } = accepted;
      if (share.kind === "fixed" && share.currency !== orderCurrency.trim().toUpperCase()) {
        return { ok: false, error: "share_currency_mismatch" };
      }
      next.talentCostCents = memberNetCents(l.totalCents, share);
      const snap = buildLineSnapshot(l.totalCents, share, accepted.version);
      next.ownerTakeCents = snap.ownerTakeCents;
      next.ownerShareSnapshot = snap.snapshot;
    }
    out.push(next);
  }
  return { ok: true, lines: out };
}

/** "Gel manicure · Ana": the member's price is always shown with her name. Never twice, never blank. */
function withMemberName(label: string, name: string | undefined): string {
  const n = name?.trim();
  if (!n || label.endsWith(` · ${n}`)) return label;
  const suffix = ` · ${n}`;
  return `${label.slice(0, Math.max(0, LABEL_MAX - suffix.length))}${suffix}`;
}

export const TALENT_NO_LONGER_SELLS = "talent_no_longer_sells" as const;

/** Own refusal copy: a member the owner removed and who has no recorded share. */
export function talentNoLongerSellsCopy(locale: string | null | undefined): string {
  return (locale ?? "").toLowerCase().startsWith("es") ? "Esta persona ya no vende aquí" : "This professional no longer sells here";
}

const UNDEFINED_COLUMN = "42703";

/**
 * If the workspace is a Friends collective, set every member line's cost from
 * her share (mutating `lines` in place, so the order insert carries it). Any
 * read problem other than "the column does not exist yet" REFUSES the order:
 * a collective sale is never priced without its split.
 */
export async function applyCollectiveOwnerShares<L extends SplitLine>(
  admin: SupabaseClient,
  tenantId: string,
  orderCurrency: string,
  lines: L[],
): Promise<{ ok: true; lines: L[] } | { ok: false; error: string; code?: typeof TALENT_NO_LONGER_SELLS }> {
  const refuse = (detail: unknown) => {
    logServerError("collective-split", detail);
    return { ok: false as const, error: SPLIT_UNAVAILABLE_MESSAGE };
  };
  try {
    // Flag-gated and OFF by default, and checked FIRST: with the flag off no workspace is
    // read at all, so this code cannot slow down or refuse a single order anywhere.
    if (!collectiveSplitEnabled()) return { ok: true, lines };
    const { data: agency, error: aErr } = await admin.from("agencies").select("work_model").eq("id", tenantId).maybeSingle();
    if (aErr) return aErr.code === UNDEFINED_COLUMN ? { ok: true, lines } : refuse(aErr);
    if ((agency as { work_model?: string | null } | null)?.work_model !== FRIENDS_COLLECTIVE_MODEL) return { ok: true, lines };

    const talentIds = [...new Set(lines.map((l) => l.talentProfileId).filter((x): x is string => !!x))];
    const shares = new Map<string, AcceptedShare>();
    if (talentIds.length > 0) {
      const { data: rows, error } = await admin
        .from("agency_talent_roster")
        .select("talent_profile_id, status, owner_share_kind, owner_share_bps, owner_share_cents, owner_share_currency, owner_share_version")
        .eq("tenant_id", tenantId)
        .in("talent_profile_id", talentIds);
      if (error) return refuse(error);
      const all = (rows ?? []) as Array<ShareRow & { talent_profile_id: string; status?: string | null; owner_share_version?: number | null }>;
      // A live row always wins. A talent with only a removed row still sells an already agreed
      // booking: her LAST ACCEPTED share applies. No share on record for her: refuse (TUL-1699).
      const live = new Set(all.filter((r) => r.status !== "removed").map((r) => r.talent_profile_id));
      for (const r of all) {
        if (r.status === "removed" && live.has(r.talent_profile_id)) continue;
        const s = parseOwnerShareRow(r);
        if (s) shares.set(r.talent_profile_id, { share: s, version: Number(r.owner_share_version) || 1 });
        else if (r.status === "removed") {
          logServerError("collective-split", "removed roster member without a recorded share");
          return { ok: false as const, error: talentNoLongerSellsCopy("en"), code: TALENT_NO_LONGER_SELLS };
        }
      }
    }
    const names = new Map<string, string>();
    if (talentIds.length > 0) {
      const { data: profiles, error: nErr } = await admin.from("talent_profiles").select("id, display_name").in("id", talentIds);
      if (nErr) return refuse(nErr);
      for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
        if (p.display_name?.trim()) names.set(p.id, p.display_name.trim());
      }
    }
    const applied = applySharesToLines(lines, shares, orderCurrency, names);
    if (!applied.ok) return refuse(applied.error);
    applied.lines.forEach((l, i) => {
      lines[i].talentCostCents = l.talentCostCents;
      lines[i].label = l.label;
      lines[i].ownerTakeCents = l.ownerTakeCents;
      lines[i].ownerShareSnapshot = l.ownerShareSnapshot;
    });
    return { ok: true, lines };
  } catch (err) {
    return refuse(err);
  }
}
