import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isPostAuthNextAllowedForActiveUser } from "@/lib/auth-flow";

import { activateGuestBookerIfEligible } from "./guest-activate.server";

type Counts = Partial<Record<"inquiries" | "agency_bookings" | "booking_transactions" | "orders", number>>;
type Chain = {
  select: () => Chain;
  eq: () => Chain;
  in: () => Chain;
  update: (patch: Record<string, unknown>) => Chain;
  upsert: () => Chain;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
  then: (resolve: (v: unknown) => void) => void;
};

/** Head-count fake: each table answers its own count; customers lists ids. */
function fake(profile: { app_role: string; account_status: string }, counts: Counts, customerIds: string[] = []) {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string): Chain {
      const chain: Chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        update: (patch) => {
          updates.push(patch);
          return chain;
        },
        upsert: () => chain,
        maybeSingle: async () => ({ data: profile, error: null }),
        then: (resolve) => {
          if (table === "profiles" || table === "client_profiles") return resolve({ error: null });
          if (table === "customers") return resolve({ data: customerIds.map((id) => ({ id })), error: null });
          resolve({ count: counts[table as keyof Counts] ?? 0, error: null });
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { admin, updates };
}

const onboardingClient = { app_role: "client", account_status: "onboarding" };

test("G2: a pay-only guest (no inquiry, a paid transaction) is activated", async () => {
  const { admin, updates } = fake(onboardingClient, { booking_transactions: 1 });
  assert.equal(await activateGuestBookerIfEligible(admin, { userId: "u1", emailProven: true }), true);
  assert.equal(updates[0]?.account_status, "active");
});

test("G2: a booking-only guest and an order-only guest are activated", async () => {
  assert.equal(await activateGuestBookerIfEligible(fake(onboardingClient, { agency_bookings: 1 }).admin, { userId: "u1", emailProven: true }), true);
  assert.equal(await activateGuestBookerIfEligible(fake(onboardingClient, { orders: 1 }, ["cu-1"]).admin, { userId: "u1", emailProven: true }), true);
});

test("G2: no history, unproven email, talent or active accounts never change", async () => {
  assert.equal(await activateGuestBookerIfEligible(fake(onboardingClient, {}).admin, { userId: "u1", emailProven: true }), false);
  assert.equal(await activateGuestBookerIfEligible(fake(onboardingClient, { agency_bookings: 1 }).admin, { userId: "u1", emailProven: false }), false);
  assert.equal(await activateGuestBookerIfEligible(fake({ app_role: "talent", account_status: "onboarding" }, { agency_bookings: 1 }).admin, { userId: "u1", emailProven: true }), false);
  assert.equal(await activateGuestBookerIfEligible(fake({ app_role: "client", account_status: "active" }, { agency_bookings: 1 }).admin, { userId: "u1", emailProven: true }), false);
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("G3/G9: every client sign-in path runs claim then activation before routing", () => {
  const paths: Array<{ file: string; before?: string }> = [
    { file: "src/lib/client-account/actions.ts" },
    { file: "src/app/auth/confirm/route.ts", before: "loadAccessProfile(supabase, user.id)" },
    { file: "src/app/auth/callback/route.ts", before: "loadAccessProfile(supabase, user.id)" },
    { file: "src/app/auth/otp-actions.ts", before: "loadAccessProfile(supabase, user.id)" },
    { file: "src/app/auth/actions.ts", before: "loadAccessProfile(supabase, user.id)" },
    { file: "src/lib/server-actions/client-guest-merge.ts" },
  ];
  for (const { file, before } of paths) {
    const src = read(file);
    const call = src.indexOf("await claimAndActivateVerifiedClient(");
    assert.ok(call > 0, `${file} must call claimAndActivateVerifiedClient`);
    if (before) assert.ok(call < src.indexOf(before), `${file}: claim must run before the destination profile read`);
  }
});

test("the wrapper claims everything, then activates, and only for client accounts", () => {
  const src = read("src/lib/client-account/after-verified-sign-in.server.ts");
  const role = src.indexOf('app_role !== "client"');
  const claim = src.indexOf("claimEverythingForVerifiedEmail(");
  const activate = src.indexOf("activateGuestBookerIfEligible(");
  assert.ok(role > 0 && claim > role && activate > claim);
  assert.ok(src.includes("if (!input.emailProven)"), "an unproven email never claims");
});

test("G11: an active client may return to /account after sign-in", () => {
  assert.equal(isPostAuthNextAllowedForActiveUser("/account", "client"), true);
  assert.equal(isPostAuthNextAllowedForActiveUser("/account/visits/abc", "client"), true);
  assert.equal(isPostAuthNextAllowedForActiveUser("/account", "talent"), false);
});
