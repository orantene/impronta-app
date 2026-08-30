import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateGuestInstantPolicy } from "./instant-book-guest-policy";
import { runResolvedInstantBook } from "./instant-book-run";

describe("evaluateGuestInstantPolicy", () => {
  const guestOk = {
    signedIn: false,
    requireAccount: false,
    hasEmail: true,
    captchaConfigured: true,
    captchaOk: true as boolean | null,
    rateLimited: false,
  };

  it("signed-in path is unchanged (skips guest gates)", () => {
    const res = evaluateGuestInstantPolicy({
      ...guestOk,
      signedIn: true,
      requireAccount: true,
      hasEmail: false,
      captchaConfigured: true,
      captchaOk: null,
      rateLimited: true,
    });
    assert.deepEqual(res, { ok: true, path: "session" });
  });

  it("guest instant is allowed when captcha and email pass", () => {
    assert.deepEqual(evaluateGuestInstantPolicy(guestOk), { ok: true, path: "guest" });
  });

  it("require-account refuses with the sign-in outcome", () => {
    const res = evaluateGuestInstantPolicy({ ...guestOk, requireAccount: true });
    assert.deepEqual(res, { ok: false, reason: "needs_auth" });
  });

  it("captcha failure refuses", () => {
    const res = evaluateGuestInstantPolicy({ ...guestOk, captchaOk: false });
    assert.deepEqual(res, { ok: false, reason: "captcha_failed" });
  });

  it("missing captcha token refuses when captcha is configured", () => {
    const res = evaluateGuestInstantPolicy({ ...guestOk, captchaOk: null });
    assert.deepEqual(res, { ok: false, reason: "captcha_required" });
  });

  it("rate limit refuses", () => {
    const res = evaluateGuestInstantPolicy({ ...guestOk, rateLimited: true });
    assert.deepEqual(res, { ok: false, reason: "rate_limited" });
  });

  it("no email refuses validation", () => {
    const res = evaluateGuestInstantPolicy({ ...guestOk, hasEmail: false });
    assert.deepEqual(res, { ok: false, reason: "validation" });
  });

  it("no captcha configured does not demand a token", () => {
    const res = evaluateGuestInstantPolicy({
      ...guestOk,
      captchaConfigured: false,
      captchaOk: null,
    });
    assert.deepEqual(res, { ok: true, path: "guest" });
  });
});

describe("runResolvedInstantBook", () => {
  const payload = {
    talentProfileId: "tal-1",
    tenantId: "ten-1",
    offeringId: "off-1",
    payInPerson: true,
    reservation: {
      startsAt: "2026-09-01T15:00:00.000Z",
      endsAt: "2026-09-01T15:30:00.000Z",
      timezone: "America/New_York",
    },
  };
  const guestActor = {
    kind: "guest" as const,
    userId: "guest-user",
    contactName: "Ada",
    contactEmail: "ada@example.com",
    contactPhone: null,
  };
  const sessionActor = {
    kind: "session" as const,
    userId: "signed-in",
    contactName: "Bea",
    contactEmail: "bea@example.com",
    contactPhone: null,
  };

  it("guest instant creates the booking and notifies the guest", async () => {
    const notified: string[] = [];
    const booked: string[] = [];
    const res = await runResolvedInstantBook({
      actor: guestActor,
      payload,
      currencyCode: "USD",
      createBooking: async (engineInput) => {
        booked.push(engineInput.userId);
        assert.equal(engineInput.contactEmail, "ada@example.com");
        assert.equal(engineInput.offeringId, "off-1");
        return { ok: true, inquiryId: "inq-1", bookingId: "bk-1" };
      },
      notifyGuest: async (actor) => {
        notified.push(actor.contactEmail);
      },
    });
    assert.deepEqual(res, {
      ok: true,
      inquiryId: "inq-1",
      bookingId: "bk-1",
      redirectPath: "/c/inq-1?instant_booked=1",
      guest: true,
    });
    assert.deepEqual(booked, ["guest-user"]);
    assert.deepEqual(notified, ["ada@example.com"]);
  });

  it("signed-in path does not notify as a guest", async () => {
    let notified = false;
    const res = await runResolvedInstantBook({
      actor: sessionActor,
      payload,
      currencyCode: "USD",
      createBooking: async (engineInput) => {
        assert.equal(engineInput.userId, "signed-in");
        return { ok: true, inquiryId: "inq-2", bookingId: "bk-2" };
      },
      notifyGuest: async () => {
        notified = true;
      },
    });
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.guest, false);
    assert.equal(notified, false);
  });

  it("captcha / rate-limit / require-account actor fails do not create a booking", async () => {
    let created = 0;
    for (const reason of ["captcha_failed", "rate_limited", "needs_auth"] as const) {
      const res = await runResolvedInstantBook({
        actor: {
          kind: "fail",
          reason,
          error: reason,
          needsAuth: reason === "needs_auth",
        },
        payload,
        currencyCode: "USD",
        createBooking: async () => {
          created += 1;
          return { ok: true, inquiryId: "x", bookingId: "y" };
        },
        notifyGuest: async () => {},
      });
      assert.equal(res.ok, false);
      if (!res.ok && reason === "needs_auth") assert.equal(res.needsAuth, true);
    }
    assert.equal(created, 0);
  });
});
