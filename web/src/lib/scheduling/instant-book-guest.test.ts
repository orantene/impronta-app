import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateGuestInstantPolicy,
  resolveGuestBookingIdentity,
} from "./instant-book-guest-policy";
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
    const booked: Array<string | null> = [];
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

  it("redirects to checkout when the engine returns a checkout URL", async () => {
    const res = await runResolvedInstantBook({
      actor: guestActor,
      payload,
      currencyCode: "USD",
      createBooking: async () => ({
        ok: true,
        inquiryId: "inq-pay",
        bookingId: "bk-pay",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
      }),
      notifyGuest: async () => {},
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.redirectPath, "https://checkout.stripe.com/c/pay/cs_test");
    }
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

describe("resolveGuestBookingIdentity", () => {
  /**
   * D-100. A customer could not finish booking: /book → slot → "Confirm this
   * time" answered "Add your name and email to book." and stayed on /book,
   * with the name and the email in the request body.
   *
   * The chain: customer auth retirement made `ensureGuestClientByEmail` stop
   * minting `auth.users`, so a first-time guest comes back
   * `{ status: "unlinked", clientUserId: null }` BY DESIGN.
   * `resolveInstantBookActor` still required an id and mapped that null onto a
   * validation refusal. Every FIRST-TIME customer was refused; only someone who
   * already had an account could buy. No gate caught it because the surviving
   * unit tests all handed the orchestrator an actor that already had a user id.
   */
  it("a first-time guest with no account books as a guest, not a refusal", () => {
    const res = resolveGuestBookingIdentity({
      email: "new-customer@example.com",
      name: "Ada Lovelace",
      phone: null,
      clientUserId: null,
    });
    assert.deepEqual(res, {
      ok: true,
      userId: null,
      contactName: "Ada Lovelace",
      contactEmail: "new-customer@example.com",
      contactPhone: null,
    });
  });

  it("a returning guest keeps the account their orders already sit on", () => {
    const res = resolveGuestBookingIdentity({
      email: "Returning@Example.com ",
      name: " Bea ",
      phone: "+525500000000",
      clientUserId: "user-42",
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.userId, "user-42");
      assert.equal(res.contactEmail, "returning@example.com");
      assert.equal(res.contactName, "Bea");
      assert.equal(res.contactPhone, "+525500000000");
    }
  });

  it("a blank client id is no account, never an empty-string account", () => {
    const res = resolveGuestBookingIdentity({
      email: "c@example.com",
      name: "",
      phone: null,
      clientUserId: "   ",
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.userId, null);
      // No name given falls back to the one thing we can reach them at.
      assert.equal(res.contactName, "c@example.com");
    }
  });

  it("no reachable email is the ONLY thing that refuses here", () => {
    assert.deepEqual(
      resolveGuestBookingIdentity({
        email: "not-an-email",
        name: "Ada",
        phone: null,
        clientUserId: null,
      }),
      { ok: false, reason: "validation" },
    );
  });

  it("an accountless guest still reaches checkout through the orchestrator", async () => {
    const seen: Array<string | null> = [];
    const res = await runResolvedInstantBook({
      actor: {
        kind: "guest",
        userId: null,
        contactName: "Ada",
        contactEmail: "new-customer@example.com",
        contactPhone: null,
      },
      payload: {
        talentProfileId: "tal-1",
        tenantId: "ten-1",
        offeringId: "off-1",
        payInPerson: false,
      },
      currencyCode: "USD",
      createBooking: async (engineInput) => {
        seen.push(engineInput.userId);
        return {
          ok: true,
          inquiryId: "inq-guest",
          bookingId: "bk-guest",
          checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
        };
      },
      notifyGuest: async () => {},
    });
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.redirectPath, "https://checkout.stripe.com/c/pay/cs_test");
    assert.deepEqual(seen, [null]);
  });
});
