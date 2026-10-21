import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfferLine } from "@/lib/coordinator/offer-line";
import { planReplacement } from "@/lib/coordinator/replace-talent";
import { minorUnitDivisor } from "@/lib/orders/money-format";
import { notifyCoordinatorRoleAssigned } from "@/lib/notifications/producers/coordinator-role-notify";
import { afterResponse } from "@/lib/server/after-response";
import { logServerError } from "@/lib/server/safe-error";
import { projectReplaceTalent, type ProjectOpsReason } from "./project-ops";

/**
 * TUL-1603: replace a person on a project, then do the follow-ups the plan
 * (`planReplacement`) models, each one fail-closed:
 *
 *  - The NEW person gets their own bell (role, event, call time; nothing else).
 *  - The CLIENT is told only if the dropped person was shown by name
 *    (`workspace_service_listings.show_who = 'name'`). Portfolio, hidden, no
 *    listing, or a read that fails all mean "do not tell": a person the client
 *    never saw by name stays invisible.
 *  - Only the changed seat is re-sent; the rest of the team is not touched.
 *  - The PAYOUT move is a plan with an idempotency key behind
 *    `movePayoutForReplacement`. No payout writer exists for a project
 *    assignment in this code (the swap RPC moves the `booking_talent` row and
 *    its cost; actual payouts settle elsewhere), so the seam returns
 *    `not_wired` and moves nothing.
 */

export type PayoutMove = { talentProfileId: string; deltaCents: number };

export type PayoutMoveInput = { tenantId: string; bookingId: string; operationKey: string; moves: readonly PayoutMove[] };

export type PayoutMoveResult = { ok: true; already: boolean } | { ok: false; reason: "not_wired" | "invalid" | "unavailable" };

/** One key per replacement operation: a retried replacement derives the same key, so a writer can dedupe. */
export function payoutMoveKey(input: Pick<PayoutMoveInput, "tenantId" | "bookingId" | "operationKey">): string {
  return `replace-payout:${input.tenantId}:${input.bookingId}:${input.operationKey.trim()}`;
}

/** The typed seam for the payout writer. Intentionally not wired: it moves no money. */
export async function movePayoutForReplacement(_input: PayoutMoveInput): Promise<PayoutMoveResult> {
  void _input;
  return { ok: false, reason: "not_wired" };
}

export type ShowWho = "name" | "portfolio" | "hidden" | "unknown";

/** How the client was shown this person. A read failure is "unknown", never "name". */
export async function readShowWho(admin: SupabaseClient, tenantId: string, talentProfileId: string): Promise<ShowWho> {
  try {
    const { data, error } = await admin
      .from("workspace_service_listings")
      .select("show_who, status")
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", talentProfileId);
    if (error) {
      logServerError("projects.readShowWho", error);
      return "unknown";
    }
    const rows = ((data ?? []) as Array<{ show_who?: unknown; status?: unknown }>).filter((r) => r.status !== "hidden");
    if (rows.some((r) => r.show_who === "name")) return "name";
    if (rows.some((r) => r.show_who === "portfolio")) return "portfolio";
    return "hidden";
  } catch (err) {
    logServerError("projects.readShowWho", err);
    return "unknown";
  }
}

type NotifyParams = Parameters<typeof notifyCoordinatorRoleAssigned>[0];

export type ReplaceDeps = {
  replace: (input: {
    tenantId: string;
    bookingId: string;
    fromTalentId: string;
    toTalentId: string;
    operationKey: string;
  }) => Promise<{ ok: true; bookingId: string } | { ok: false; reason: ProjectOpsReason }>;
  notify: (params: NotifyParams) => Promise<boolean>;
  movePayout?: (input: PayoutMoveInput) => Promise<PayoutMoveResult>;
};

export type ReplaceOutcome =
  | {
      ok: true;
      bookingId: string;
      clientNotice: "none" | "person_changed";
      changedSeatIds: string[];
      payoutPlan: PayoutMove[];
      payout: { status: "not_wired" | "moved" | "already" | "failed" | "skipped"; key: string };
    }
  | { ok: false; reason: ProjectOpsReason };

export async function replaceTalentOnProject(
  admin: SupabaseClient,
  input: { tenantId: string; bookingId: string; fromTalentId: string; toTalentId: string; operationKey: string },
  deps?: ReplaceDeps,
): Promise<ReplaceOutcome> {
  const d: ReplaceDeps = deps ?? {
    replace: (i) => projectReplaceTalent(admin as never, i),
    notify: notifyCoordinatorRoleAssigned,
  };
  const key = payoutMoveKey(input);
  const swapped = await d.replace(input);
  if (!swapped.ok) return swapped;

  const done = (over: Partial<Extract<ReplaceOutcome, { ok: true }>> = {}): ReplaceOutcome => ({
    ok: true,
    bookingId: swapped.bookingId,
    clientNotice: "none",
    changedSeatIds: [],
    payoutPlan: [],
    payout: { status: "skipped", key },
    ...over,
  });

  try {
    const [bookingRes, seatRes, droppedShow] = await Promise.all([
      admin.from("agency_bookings").select("id, title, starts_at, timezone, currency_code").eq("id", input.bookingId).eq("tenant_id", input.tenantId).maybeSingle(),
      admin
        .from("booking_talent")
        .select("id, role_label, talent_cost_total, units")
        .eq("booking_id", input.bookingId)
        .eq("tenant_id", input.tenantId)
        .eq("talent_profile_id", input.toTalentId)
        .maybeSingle(),
      readShowWho(admin, input.tenantId, input.fromTalentId),
    ]);
    const booking = bookingRes.data as { title: string | null; starts_at: string | null; timezone: string | null; currency_code: string | null } | null;
    const seat = seatRes.data as { id: string; role_label: string | null; talent_cost_total: unknown } | null;
    if (bookingRes.error || seatRes.error || !booking || !seat) {
      if (bookingRes.error || seatRes.error) logServerError("projects.replaceTalentOnProject.context", bookingRes.error ?? seatRes.error);
      return done();
    }

    const cost = Math.round(Number(seat.talent_cost_total ?? 0) * minorUnitDivisor((booking.currency_code ?? "USD").toUpperCase()));
    const line: OfferLine = {
      id: seat.id,
      kind: "talent",
      talentProfileId: input.fromTalentId,
      label: seat.role_label ?? "",
      units: 1,
      unitPriceCents: 0,
      talentCostCents: Number.isFinite(cost) && cost >= 0 ? cost : 0,
      // The client is told only for a person shown BY NAME; anything else stays quiet.
      showWho: droppedShow === "name" ? "name" : "hidden",
      talentConfirmed: null,
    };
    const plan = planReplacement({
      lines: [line],
      droppedTalentId: input.fromTalentId,
      replacement: { talentProfileId: input.toTalentId, costCents: line.talentCostCents, showWho: "hidden" },
    });
    if (!plan.ok) return done();

    // The new person's own bell, after the write, fire-and-forget.
    afterResponse(
      () =>
        d.notify({
          admin,
          tenantId: input.tenantId,
          jobId: input.bookingId,
          roleId: seat.id,
          role: seat.role_label ?? "",
          eventTitle: booking.title ?? "",
          startsAt: booking.starts_at,
          timeZone: booking.timezone ?? "UTC",
          talentProfileId: input.toTalentId,
        }),
      "projects.replaceTalentOnProject.notify",
    );

    const move = d.movePayout ?? movePayoutForReplacement;
    let payoutStatus: "not_wired" | "moved" | "already" | "failed" = "failed";
    try {
      const moved = await move({ tenantId: input.tenantId, bookingId: input.bookingId, operationKey: input.operationKey, moves: plan.payoutMoves });
      payoutStatus = moved.ok ? (moved.already ? "already" : "moved") : moved.reason === "not_wired" ? "not_wired" : "failed";
    } catch (err) {
      logServerError("projects.replaceTalentOnProject.payout", err);
    }

    return done({
      clientNotice: plan.clientNotice,
      changedSeatIds: plan.changedLineIds,
      payoutPlan: plan.payoutMoves,
      payout: { status: payoutStatus, key },
    });
  } catch (err) {
    logServerError("projects.replaceTalentOnProject", err);
    return done();
  }
}
