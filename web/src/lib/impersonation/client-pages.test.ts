import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadBookingsPageData,
  loadDiscoverPageData,
  loadInquiriesPageData,
  loadMessagesPageData,
  loadPitchesPageData,
  loadReviewsPageData,
  loadSettingsPageData,
  loadShortlistsPageData,
  loadSubscriptionPageData,
  loadTodayPageData,
  type ClientPageDeps,
} from "@/app/(workspace)/[tenantSlug]/client/_data-bridge/client-page-loaders";
import { effectiveReadContext, type EffectiveReadContext } from "./effective-read";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

const A = "aaaaaaaa-staff-actor";
const B = "bbbbbbbb-impersonated-subject";
const TENANT = "tenant-1";
const RLS = { tag: "rls" } as unknown as SupabaseClient;
const ADMIN = { tag: "admin" } as unknown as SupabaseClient;

const impersonating: EffectiveReadContext = effectiveReadContext(A, {
  actorUser: { id: A },
  effectiveUserId: B,
  isImpersonating: true,
});
const plain: EffectiveReadContext = effectiveReadContext(A, null);
const foreign: EffectiveReadContext = { actorUserId: "other-actor", userId: B, impersonated: true };

function tag(c: unknown): string {
  return c === undefined || c === null ? "own" : (c as { tag: string }).tag;
}

/** Every dep logs `name|user|client` so a test can see exactly who a read was for. */
function fakeDeps(log: string[], opts: { admin?: boolean; profile?: boolean } = {}): ClientPageDeps {
  const rec =
    <T>(name: string, ret: T, clientIdx?: number) =>
    (...args: unknown[]) => {
      const client = clientIdx === undefined ? "n/a" : tag(args[clientIdx]);
      log.push(`${name}|${String(args[0])}|${client}`);
      return Promise.resolve(ret);
    };
  const deps = {
    profile: async (userId: string, _t: string, ctx?: EffectiveReadContext) => {
      log.push(`profile|${userId}|${ctx?.impersonated ? "imp" : "own"}`);
      return opts.profile === false ? null : { id: `cp-${userId}`, userId, displayName: "x", company: null, agencyName: "a", agencySlug: "a" };
    },
    rlsClient: async () => RLS,
    adminClient: () => (opts.admin === false ? null : ADMIN),
    subscription: rec("subscription", { tier: "standard" }),
    shortlists: rec("shortlists", []),
    pitches: rec("pitches", []),
    inquiries: rec("inquiries", [{ id: "inq-1" }], 2),
    bookings: rec("bookings", [{ agencyBookingId: "bk-1" }], 2),
    transactions: rec("transactions", []),
    payable: rec("payable", new Map()),
    upcoming: rec("upcoming", [], 2),
    roster: (async (tenantId: string) => {
      log.push(`roster|${tenantId}|n/a`);
      return [];
    }) as unknown,
    trust: (async (userId: string, _t: string, ctx?: EffectiveReadContext) => {
      log.push(`trust|${userId}|${ctx?.impersonated ? "imp" : "own"}`);
      return { trustLevel: "basic" };
    }) as unknown,
    reviews: rec("reviews", [], 2),
    ratingSummary: rec("ratingSummary", { average: 0, count: 0 }, 1),
    authored: rec("authored", [], 2),
    prefs: rec("prefs", null),
    messages: (async (_t: string, _i: string, viewer?: string) => {
      log.push(`messages|${viewer ?? "session"}|n/a`);
      return [];
    }) as unknown,
    details: (async (_t: string, _i: string, client?: SupabaseClient) => {
      log.push(`details|-|${tag(client)}`);
      return null;
    }) as unknown,
    reviewsEnabled: async () => true,
  };
  return deps as unknown as ClientPageDeps;
}

type Run = (ctx: EffectiveReadContext | undefined, deps: ClientPageDeps) => Promise<unknown>;

const pages: Array<[string, Run]> = [
  ["discover", (c, d) => loadDiscoverPageData(A, TENANT, c, d)],
  ["shortlists", (c, d) => loadShortlistsPageData(A, TENANT, c, d)],
  ["pitches", (c, d) => loadPitchesPageData(A, TENANT, c, d)],
  ["reviews", (c, d) => loadReviewsPageData(A, TENANT, c, d)],
  ["inquiries", (c, d) => loadInquiriesPageData(A, TENANT, c, d)],
  ["bookings", (c, d) => loadBookingsPageData(A, TENANT, c, d)],
  ["today", (c, d) => loadTodayPageData(A, TENANT, c, d)],
  ["messages", (c, d) => loadMessagesPageData(A, TENANT, c, undefined, d, false)],
  ["settings", (c, d) => loadSettingsPageData(A, TENANT, c, d)],
];

for (const [name, run] of pages) {
  test(`${name}: actor A impersonating B reads only B's rows, through the admin client`, async () => {
    const log: string[] = [];
    const out = await run(impersonating, fakeDeps(log));
    assert.ok(out, "expected data");
    assert.ok(log.length > 1, "expected reads");
    assert.ok(!log.some((l) => l.includes(A)), `the actor's id leaked into a read: ${log.join(", ")}`);
    for (const l of log) {
      const [kind, user, client] = l.split("|");
      if (kind === "roster") continue; // tenant-scoped, not user-keyed
      if (kind !== "details") assert.equal(user, B, `${l}: not keyed on the subject`);
      if (kind === "profile" || kind === "trust") assert.equal(client, "imp");
      else if (client !== "n/a") {
        assert.equal(client, "admin", `${l}: RLS-bound read did not get the admin client`);
      }
    }
  });

  test(`${name}: not impersonating behaves as before (session user, no injected client)`, async () => {
    for (const ctx of [plain, undefined]) {
      const log: string[] = [];
      const out = await run(ctx, fakeDeps(log));
      assert.ok(out);
      for (const l of log) {
        const [kind, user, client] = l.split("|");
        if (kind === "roster") continue;
        if (kind !== "details" && kind !== "messages") assert.equal(user, A, `${l}: not the session user`);
        assert.ok(client === "own" || client === "n/a", `${l}: unexpected injected client`);
      }
    }
  });

  test(`${name}: a context built for another actor reads as the session user`, async () => {
    const log: string[] = [];
    await run(foreign, fakeDeps(log));
    assert.ok(!log.some((l) => l.includes(B)), `subject id used from a forged context: ${log.join(", ")}`);
    assert.ok(!log.some((l) => l.endsWith("|admin") || l.endsWith("|imp")), "forged context got the admin path");
  });

  test(`${name}: impersonating without an admin client fails closed (null, no reads)`, async () => {
    const log: string[] = [];
    const out = await run(impersonating, fakeDeps(log, { admin: false }));
    assert.equal(out, null);
    assert.deepEqual(log, []);
  });

  test(`${name}: no profile for the effective user is null`, async () => {
    const log: string[] = [];
    const out = await run(impersonating, fakeDeps(log, { profile: false }));
    assert.equal(out, null);
    assert.deepEqual(log, [`profile|${B}|imp`]);
  });
}

test("settings: notification prefs (a session-bound action) are not read while impersonating", async () => {
  const log: string[] = [];
  await loadSettingsPageData(A, TENANT, impersonating, fakeDeps(log));
  assert.ok(!log.some((l) => l.startsWith("prefs|")));
  const own: string[] = [];
  await loadSettingsPageData(A, TENANT, plain, fakeDeps(own));
  assert.ok(own.includes(`prefs|${A}|n/a`));
});

test("messages: the thread is rendered for the subject and the pinned id must be in their list", async () => {
  const log: string[] = [];
  const out = (await loadMessagesPageData(A, TENANT, impersonating, "inq-1", fakeDeps(log), false)) as {
    initialActiveId: string | null;
    pinnedNotFound: boolean;
  };
  assert.equal(out.initialActiveId, "inq-1");
  assert.ok(log.includes(`messages|${B}|n/a`));
  assert.ok(log.includes("details|-|admin"));
  const other = (await loadMessagesPageData(A, TENANT, impersonating, "not-theirs", fakeDeps([]), false)) as {
    initialActiveId: string | null;
    pinnedNotFound: boolean;
  };
  assert.equal(other.pinnedNotFound, true);
  assert.equal(other.initialActiveId, null);
});

test("subscription: reads the effective user's plan; forged context and plain read the session user", async () => {
  const a: string[] = [];
  await loadSubscriptionPageData(A, impersonating, fakeDeps(a));
  assert.ok(a[0].startsWith(`subscription|${B}|`));
  const b: string[] = [];
  await loadSubscriptionPageData(A, foreign, fakeDeps(b));
  assert.ok(b[0].startsWith(`subscription|${A}|`));
  const c: string[] = [];
  await loadSubscriptionPageData(A, plain, fakeDeps(c));
  assert.ok(c[0].startsWith(`subscription|${A}|`));
});

test("every client-portal page that reads user data goes through its loader", () => {
  const base = join(WEB_ROOT, "src", "app", "(workspace)", "[tenantSlug]", "client");
  const pagesDir: Array<[string, string]> = [
    ["discover/page.tsx", "loadDiscoverPageData("],
    ["shortlists/page.tsx", "loadShortlistsPageData("],
    ["subscription/page.tsx", "loadSubscriptionPageData("],
    ["pitches/page.tsx", "loadPitchesPageData("],
    ["reviews/page.tsx", "loadReviewsPageData("],
    ["inquiries/page.tsx", "loadInquiriesPageData("],
    ["bookings/page.tsx", "loadBookingsPageData("],
    ["today/page.tsx", "loadTodayPageData("],
    ["messages/page.tsx", "loadMessagesPageData("],
    ["settings/page.tsx", "loadSettingsPageData("],
    ["discover/map/page.tsx", "resolveClientPageRead("],
  ];
  for (const [rel, call] of pagesDir) {
    const src = readFileSync(join(base, rel), "utf8");
    assert.ok(src.includes(call), `${rel} must call ${call}`);
    assert.ok(src.includes("clientPageReadCtx("), `${rel} must build its context from the verified helper`);
    assert.ok(!/loadClientSelfProfile\(/.test(src), `${rel} must not load the profile keyed on the actor`);
    assert.ok(!/loadClient(Inquiries|Bookings|Upcoming|Pitches|Subscription)\(\s*session\.user\.id/.test(src), `${rel} reads data keyed on session.user.id`);
  }
});
