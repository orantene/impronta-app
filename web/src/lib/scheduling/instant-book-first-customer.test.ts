/**
 * D-100, at the defect site.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM instant-book-guest.test.ts. The first
 * regression cover for D-100 tested `resolveGuestBookingIdentity`, a pure
 * helper written as part of the fix. Putting the original bad line back into
 * `resolveInstantBookActor`:
 *
 *     if (!provisioned.clientUserId) {
 *       return fail("validation", "Add your name and email to book.");
 *     }
 *
 * reintroduced the bug in full and `npm run test:scheduling` still passed
 * 195 of 195. A helper that did not exist when the bug shipped cannot pin the
 * bug: nothing asserted that the resolver actually delegates to it, so the
 * resolver was free to refuse first and never reach it.
 *
 * These tests drive the REAL `resolveInstantBookActor` and hand its answer to
 * the REAL `runResolvedInstantBook`, which is exactly the pair the server
 * action wires (`createInstantBookingAction`: resolve the actor, then run).
 * The request-coupled collaborators — `headers()`, the guest cookie, the
 * captcha fetch, the service-role client — come in through the `__hooks`
 * seam, so the code under test is the shipped code and only the I/O is
 * doubled.
 *
 * The customer journey being pinned is the one that broke: someone who has
 * never bought here before types a name and an email, presses "Confirm this
 * time", and gets a booking rather than "Add your name and email to book."
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveInstantBookActor } from "./instant-book-guest";
import { runResolvedInstantBook } from "./instant-book-run";

/** What `ensureGuestClientByEmail` returns for an email with no account. */
const NO_ACCOUNT_YET = { status: "unlinked", clientUserId: null } as const;

/**
 * Every collaborator a guest booking touches, all answering "nothing is
 * wrong": no captcha configured, no abuse, and an email that has never been
 * seen here. The only variable left is the one D-100 got wrong.
 */
function cleanRequestHooks(
  provision: { status: "unlinked"; clientUserId: null } | { status: "matched"; clientUserId: string },
) {
  const seen: { ensureGuestClientCalls: number } = { ensureGuestClientCalls: 0 };
  return {
    seen,
    hooks: {
      resolveClientIp: async () => "203.0.113.7",
      getGuestSessionKey: async () => "guest-session-abc",
      checkAbuse: async () => ({ ok: true }) as { ok: true },
      verifyCaptcha: async () => ({ configured: false, ok: true as boolean | null }),
      ensureGuestClient: async () => {
        seen.ensureGuestClientCalls += 1;
        return provision;
      },
    },
  };
}

const OFFERING = {
  talentProfileId: "tal-gel-manicure",
  tenantId: "ten-impronta",
  offeringId: "off-gel-manicure",
  payInPerson: false,
  reservation: {
    startsAt: "2026-09-12T15:00:00.000Z",
    endsAt: "2026-09-12T15:45:00.000Z",
    timezone: "America/Mexico_City",
  },
};

describe("resolveInstantBookActor — the first-time customer", () => {
  it("a first-time guest with a name and an email is NOT refused", async () => {
    const { hooks, seen } = cleanRequestHooks(NO_ACCOUNT_YET);

    const actor = await resolveInstantBookActor({
      user: null,
      tenantId: OFFERING.tenantId,
      requireAccount: false,
      contactName: "C01 guest",
      contactEmail: "first-time@example.com",
      contactPhone: null,
      captchaToken: null,
      honeypot: "",
      __hooks: hooks,
    });

    // The failing production answer was exactly this, with the name and the
    // email sitting in the request body.
    assert.notEqual(
      actor.kind,
      "fail",
      actor.kind === "fail"
        ? `a first-time customer was refused: ${actor.error}`
        : "unreachable",
    );
    if (actor.kind === "fail") return;

    assert.equal(actor.kind, "guest");
    assert.equal(actor.userId, null, "no account yet is null, never invented");
    assert.equal(actor.contactName, "C01 guest");
    assert.equal(actor.contactEmail, "first-time@example.com");
    assert.equal(seen.ensureGuestClientCalls, 1, "the account match must still be attempted");
  });

  it("that same resolved actor reaches a booking, end to end", async () => {
    const { hooks } = cleanRequestHooks(NO_ACCOUNT_YET);

    // Step 1 — what createInstantBookingAction does first.
    const actor = await resolveInstantBookActor({
      user: null,
      tenantId: OFFERING.tenantId,
      requireAccount: false,
      contactName: "C01 guest",
      contactEmail: "first-time@example.com",
      contactPhone: "+525500000000",
      captchaToken: null,
      honeypot: "",
      __hooks: hooks,
    });

    // Step 2 — what it does with the answer. No reshaping in between: the
    // actor object the resolver produced is the one the orchestrator runs.
    const bookedAs: Array<string | null> = [];
    const res = await runResolvedInstantBook({
      actor,
      payload: OFFERING,
      currencyCode: "MXN",
      createBooking: async (engineInput) => {
        bookedAs.push(engineInput.userId);
        assert.equal(engineInput.contactEmail, "first-time@example.com");
        assert.equal(engineInput.offeringId, "off-gel-manicure");
        return {
          ok: true,
          inquiryId: "inq-first",
          bookingId: "bk-first",
          checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_first",
        };
      },
      notifyGuest: async () => {},
    });

    assert.equal(
      res.ok,
      true,
      res.ok ? "unreachable" : `the booking was refused: ${res.error}`,
    );
    if (!res.ok) return;
    assert.equal(res.guest, true);
    assert.equal(res.redirectPath, "https://checkout.stripe.com/c/pay/cs_test_first");
    assert.deepEqual(bookedAs, [null], "a guest buys with no auth user, by design");
  });

  it("no refusal here ever reads 'Add your name and email to book.' when both were given", async () => {
    const { hooks } = cleanRequestHooks(NO_ACCOUNT_YET);

    const actor = await resolveInstantBookActor({
      user: null,
      tenantId: OFFERING.tenantId,
      requireAccount: false,
      contactName: "Ada Lovelace",
      contactEmail: "ada@example.com",
      contactPhone: null,
      captchaToken: null,
      honeypot: "",
      __hooks: hooks,
    });

    if (actor.kind === "fail") {
      assert.notEqual(
        actor.error,
        "Add your name and email to book.",
        "the customer supplied both; blaming them for a state they cannot change is the dead end D-100 was",
      );
      assert.fail(`unexpected refusal: ${actor.reason} / ${actor.error}`);
    }
  });

  it("a returning guest still books onto the account their orders sit on", async () => {
    const { hooks } = cleanRequestHooks({ status: "matched", clientUserId: "user-42" });

    const actor = await resolveInstantBookActor({
      user: null,
      tenantId: OFFERING.tenantId,
      requireAccount: false,
      contactName: "Bea",
      contactEmail: "Returning@Example.com",
      contactPhone: null,
      captchaToken: null,
      honeypot: "",
      __hooks: hooks,
    });

    assert.notEqual(actor.kind, "fail");
    if (actor.kind === "fail") return;
    assert.equal(actor.userId, "user-42");
    assert.equal(actor.contactEmail, "returning@example.com");
  });

  it("a missing email is still refused — a receipt has to reach someone", async () => {
    const { hooks } = cleanRequestHooks(NO_ACCOUNT_YET);

    const actor = await resolveInstantBookActor({
      user: null,
      tenantId: OFFERING.tenantId,
      requireAccount: false,
      contactName: "No Email",
      contactEmail: "",
      contactPhone: null,
      captchaToken: null,
      honeypot: "",
      __hooks: hooks,
    });

    assert.equal(actor.kind, "fail");
    if (actor.kind !== "fail") return;
    assert.equal(actor.reason, "validation");
  });

  it("require_account_to_book is still the ONE thing that demands sign-in", async () => {
    const { hooks } = cleanRequestHooks(NO_ACCOUNT_YET);

    const actor = await resolveInstantBookActor({
      user: null,
      tenantId: OFFERING.tenantId,
      requireAccount: true,
      contactName: "C01 guest",
      contactEmail: "first-time@example.com",
      contactPhone: null,
      captchaToken: null,
      honeypot: "",
      __hooks: hooks,
    });

    assert.equal(actor.kind, "fail");
    if (actor.kind !== "fail") return;
    assert.equal(actor.reason, "needs_auth");
    assert.equal(actor.needsAuth, true);
  });
});
