import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { POST as favoritePost, DELETE as favoriteDelete } from "@/app/api/discover/favorites/[talentId]/route";
import { POST as shortlistPost } from "@/app/api/discover/shortlists/route";
import { clientApproveCurrentOffer, clientRejectCurrentOffer, createInquiryPaymentIntent, sendInquiryMessageAsClient, startInquiryCheckout } from "@/lib/server-actions/client-pipeline";
import { messagingClientAcceptOffer, messagingClientReply } from "@/lib/server-actions/messaging-client";
import { reportReviewAction } from "@/lib/reviews/review-actions";
import { markToggleTipSeen, setNotificationPrefs, setPreferredSurface } from "@/lib/server-actions/user-prefs";
import { refundOwnBookingPayment } from "@/lib/talent-agenda/refund-actions";
import { EXTRA_ALLOW } from "./readonly-actions.allow";
import {
  IMPERSONATION_READ_ONLY_REFUSAL,
  ImpersonationReadOnlyError,
  setReadOnlyProbeForTests,
  type ReadOnlyProbe,
} from "./readonly-guard";

/**
 * TUL-256 batch 3b. End-to-end proof, per action, that a verified impersonation
 * is refused with the new message and ZERO writes happen. "Zero writes" is
 * measured at the only exits a write has: every outbound `fetch` (Supabase REST,
 * Stripe, Resend all go through it) is recorded and must stay at zero, and the
 * identity probe must have run exactly once per refused call.
 */

const REFUSAL = "Exit 'viewing as' to make changes / Sal de 'ver como' para hacer cambios";

type Calls = { cookie: number; identity: number };
let fetchCalls: string[] = [];
const realFetch = globalThis.fetch;

function probe(impersonating: boolean): { p: ReadOnlyProbe; calls: Calls } {
  const calls: Calls = { cookie: 0, identity: 0 };
  return {
    calls,
    p: {
      hasCookie: async () => {
        calls.cookie += 1;
        return impersonating;
      },
      isImpersonating: async () => {
        calls.identity += 1;
        return impersonating;
      },
    },
  };
}

beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = (async (input: unknown) => {
    fetchCalls.push(String(input));
    throw new Error("network is closed in this test");
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  setReadOnlyProbeForTests(null);
});

/** Refused = rejected with the typed error, or resolved to an error carrying the refusal / a bare ok:false. */
async function refused(run: () => Promise<unknown>): Promise<boolean> {
  try {
    const v = await run();
    if (v instanceof Response) {
      const body = (await v.json()) as { error?: string };
      return v.status === 403 && body.error === IMPERSONATION_READ_ONLY_REFUSAL;
    }
    const json = JSON.stringify(v ?? null);
    return json.includes(IMPERSONATION_READ_ONLY_REFUSAL) || json === JSON.stringify({ ok: false });
  } catch (e) {
    return e instanceof ImpersonationReadOnlyError;
  }
}

test("the refusal text is exactly the PM wording", () => {
  assert.equal(IMPERSONATION_READ_ONLY_REFUSAL, REFUSAL);
});

const ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ["clientApproveCurrentOffer", () => clientApproveCurrentOffer("inq")],
  ["clientRejectCurrentOffer", () => clientRejectCurrentOffer("inq")],
  ["startInquiryCheckout (pay now)", () => startInquiryCheckout("inq")],
  ["createInquiryPaymentIntent (pay now)", () => createInquiryPaymentIntent("inq")],
  ["sendInquiryMessageAsClient", () => sendInquiryMessageAsClient("inq", "hello")],
  ["reportReviewAction", () => reportReviewAction("talent" as never, "review")],
  ["messagingClientReply", () => messagingClientReply({ token: "t", body: "hi" })],
  ["messagingClientAcceptOffer", () => messagingClientAcceptOffer({ token: "t", offerId: "o", offerVersion: 1 })],
  ["setPreferredSurface", () => setPreferredSurface("talent")],
  ["setNotificationPrefs", () => setNotificationPrefs({})],
  ["markToggleTipSeen", () => markToggleTipSeen()],
  ["refundOwnBookingPayment", () => refundOwnBookingPayment({ bookingId: "b" })],
  ["route POST /api/discover/favorites/[talentId]", () => favoritePost(new Request("http://x/api/discover/favorites/t", { method: "POST" }), { params: Promise.resolve({ talentId: "t" }) })],
  ["route DELETE /api/discover/favorites/[talentId]", () => favoriteDelete(new Request("http://x/api/discover/favorites/t", { method: "DELETE" }), { params: Promise.resolve({ talentId: "t" }) })],
  ["route POST /api/discover/shortlists", () => shortlistPost(new Request("http://x/api/discover/shortlists", { method: "POST", body: "{}" }))],
];

for (const [name, run] of ACTIONS) {
  test(`impersonating: ${name} is refused and writes nothing`, async () => {
    const { p, calls } = probe(true);
    setReadOnlyProbeForTests(p);
    assert.equal(await refused(run), true, `${name} must be refused with the new message`);
    assert.deepEqual(fetchCalls, [], `${name} must make no outbound call`);
    assert.equal(calls.identity, 1, `${name} must stop at the guard`);
  });
}

test("not impersonating: three actions behave as before (guard cost one cookie read, no refusal)", async () => {
  const runs: Array<() => Promise<unknown>> = [
    () => setPreferredSurface("talent"),
    () => sendInquiryMessageAsClient("inq", "hello"),
    () => reportReviewAction("talent" as never, "review"),
  ];
  for (const run of runs) {
    const { p, calls } = probe(false);
    setReadOnlyProbeForTests(p);
    let out: unknown;
    try {
      out = await run();
    } catch (e) {
      assert.ok(!(e instanceof ImpersonationReadOnlyError), "guard must not throw for a normal user");
      out = e;
    }
    assert.ok(!JSON.stringify(out ?? null).includes(IMPERSONATION_READ_ONLY_REFUSAL));
    assert.equal(calls.cookie, 1);
    assert.equal(calls.identity, 0);
  }
});

// ── Exceptions: sign-out and stop-impersonation keep working ────────────────

const EXEMPT: Array<[string, string, string]> = [
  ["signOut", "src/app/auth/actions.ts", "SIGN-OUT"],
  ["endImpersonationToAdmin", "src/lib/server-actions/admin-impersonation.ts", "STOP-IMPERSONATION"],
  ["deskSignOutToLogin", "src/lib/support/desk/desk-sign-out.ts", "SIGN-OUT"],
];

function bodyOf(src: string, name: string): string {
  const at = src.search(new RegExp(`export\\s+async\\s+function\\s+${name}\\b`));
  assert.ok(at >= 0, `${name} not found`);
  const open = src.indexOf("{", src.indexOf(")", at) + 1);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}" && --d === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

for (const [name, file, tag] of EXEMPT) {
  test(`exempt: ${name} never consults the guard and is allow-listed as ${tag}`, () => {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    assert.doesNotMatch(bodyOf(src, name), /NotImpersonating/);
    const entry = EXTRA_ALLOW.find(([suffix, names]) => file.endsWith(suffix) && names.includes(name));
    assert.ok(entry, `${name} must be on the allow-list`);
    assert.match(entry[2], new RegExp(tag));
  });
}

test("exempt actions run while impersonating: the guard is not consulted and never refuses", async () => {
  const mods = [
    async () => (await import("@/app/auth/actions")).signOut(),
    async () => (await import("@/lib/server-actions/admin-impersonation")).endImpersonationToAdmin(),
    async () => (await import("@/lib/support/desk/desk-sign-out")).deskSignOutToLogin(),
  ];
  for (const run of mods) {
    const { p, calls } = probe(true);
    setReadOnlyProbeForTests(p);
    try {
      await run();
    } catch (e) {
      // With no request scope they fail on their own (cookies, redirect); never on the guard.
      assert.ok(!(e instanceof ImpersonationReadOnlyError));
    }
    assert.equal(calls.cookie, 0, "the guard must not be consulted");
    assert.equal(calls.identity, 0);
  }
});
