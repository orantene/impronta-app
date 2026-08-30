/**
 * Instant-book orchestration after the actor is resolved.
 * Injectable so tests can prove guest create / signed-in unchanged
 * without a live convert RPC.
 */

export type InstantBookRunPayload = {
  talentProfileId: string;
  tenantId: string;
  offeringId?: string | null;
  payInPerson?: boolean;
  variantId?: string | null;
  addOnIds?: string[];
  quantity?: number;
  reservation?: { startsAt: string; endsAt: string; timezone: string } | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  sourcePage?: string | null;
};

export type InstantBookRunActor = {
  kind: "session" | "guest";
  userId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
};

export type InstantBookRunFail = {
  kind: "fail";
  reason: "needs_auth" | "captcha_failed" | "captcha_required" | "rate_limited" | "validation";
  error: string;
  needsAuth?: boolean;
};

export type InstantBookRunResult =
  | { ok: true; inquiryId: string; bookingId: string; redirectPath: string; guest: boolean }
  | {
      ok: false;
      error: string;
      needsAuth?: boolean;
      upgrade?: boolean;
      slotTaken?: boolean;
    };

export type InstantEngineResult =
  | { ok: true; inquiryId: string; bookingId: string }
  | {
      ok: false;
      reason: string;
      error?: string;
    };

export function mapActorFail(fail: InstantBookRunFail): InstantBookRunResult {
  return {
    ok: false,
    error: fail.error,
    needsAuth: fail.needsAuth === true || fail.reason === "needs_auth",
  };
}

export function mapEngineFail(res: Extract<InstantEngineResult, { ok: false }>): InstantBookRunResult {
  const msg =
    res.reason === "instant_book_not_enabled"
      ? "Instant booking isn't available for this talent right now."
      : res.reason === "no_fixed_rate"
        ? "This talent hasn't set an instant-book rate yet."
        : res.reason === "not_authenticated"
          ? "Please sign in to book instantly."
          : res.reason === "slot_taken"
            ? res.error ?? "That time was just taken. Pick another time."
            : res.reason === "plan_lacks_capability"
              ? res.error ?? "This plan cannot auto-confirm. Send a request or upgrade."
              : res.reason === "slot_required"
                ? res.error ?? "Pick a time to book this service."
                : "We couldn't complete the booking. Please try the inquiry option instead.";
  return {
    ok: false,
    error: msg,
    needsAuth: res.reason === "not_authenticated",
    upgrade: res.reason === "plan_lacks_capability",
    slotTaken: res.reason === "slot_taken",
  };
}

export async function runResolvedInstantBook(input: {
  actor: InstantBookRunActor | InstantBookRunFail;
  payload: InstantBookRunPayload;
  currencyCode: string;
  createBooking: (
    engineInput: InstantBookRunPayload & InstantBookRunActor & { currencyCode: string },
  ) => Promise<InstantEngineResult>;
  notifyGuest: (actor: InstantBookRunActor, tenantId: string) => Promise<void>;
}): Promise<InstantBookRunResult> {
  if (input.actor.kind === "fail") return mapActorFail(input.actor);

  const actor = input.actor;
  const res = await input.createBooking({
    ...input.payload,
    ...actor,
    currencyCode: input.currencyCode,
  });
  if (!res.ok) return mapEngineFail(res);

  if (actor.kind === "guest") {
    await input.notifyGuest(actor, input.payload.tenantId);
  }

  return {
    ok: true,
    inquiryId: res.inquiryId,
    bookingId: res.bookingId,
    redirectPath: `/c/${res.inquiryId}?instant_booked=1`,
    guest: actor.kind === "guest",
  };
}
