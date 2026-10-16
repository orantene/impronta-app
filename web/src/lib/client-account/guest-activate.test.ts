import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { shouldActivateGuestBooker } from "./guest-activate";
import { activateGuestBookerIfEligible } from "./guest-activate.server";

const base = { emailProven: true, appRole: "client", accountStatus: "onboarding", hasBooking: true };

test("verified code + existing booking -> active; any other combination stays as it is", () => {
  assert.equal(shouldActivateGuestBooker(base), true);
  assert.equal(shouldActivateGuestBooker({ ...base, hasBooking: false }), false); // signed up with no booking
  assert.equal(shouldActivateGuestBooker({ ...base, emailProven: false }), false);
  assert.equal(shouldActivateGuestBooker({ ...base, accountStatus: "active" }), false);
  assert.equal(shouldActivateGuestBooker({ ...base, appRole: "talent" }), false);
  assert.equal(shouldActivateGuestBooker({ ...base, appRole: "agency_staff" }), false);
});

// A tiny recording fake of the admin client.
function fake(profile: { app_role: string; account_status: string } | null, inquiryCount: number) {
  const updates: Array<Record<string, unknown>> = [];
  const upserts: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "eq"]) chain[m] = self;
      if (table === "profiles") {
        chain.maybeSingle = async () => ({ data: profile, error: null });
        chain.update = (patch: Record<string, unknown>) => { updates.push(patch); return chain; };
        chain.then = (r: (v: unknown) => void) => r({ error: null });
      } else if (table === "client_profiles") {
        chain.upsert = async (row: Record<string, unknown>) => { upserts.push(row); return { error: null }; };
      } else {
        chain.then = (r: (v: unknown) => void) => r({ count: inquiryCount, error: null });
      }
      return chain;
    },
  } as unknown as SupabaseClient;
  return { admin, updates, upserts };
}

test("guest booker with a booking is activated and onboarding is marked complete", async () => {
  const { admin, updates } = fake({ app_role: "client", account_status: "onboarding" }, 2);
  assert.equal(await activateGuestBookerIfEligible(admin, { userId: "u1", emailProven: true }), true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].account_status, "active");
  assert.ok(typeof updates[0].onboarding_completed_at === "string");
});

// TUL-669: ensure_profile_for_current_user recomputes account_status on every
// request and keeps a client 'active' only when a client_profiles row exists.
// Without that row the activation above is undone on the next page load.
test("activation also creates the client_profiles row the profile RPC requires", async () => {
  const { admin, upserts } = fake({ app_role: "client", account_status: "onboarding" }, 1);
  assert.equal(await activateGuestBookerIfEligible(admin, { userId: "u1", emailProven: true }), true);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].user_id, "u1");
});

test("no booking, unproven email or an already-active account change nothing", async () => {
  const none = fake({ app_role: "client", account_status: "onboarding" }, 0);
  assert.equal(await activateGuestBookerIfEligible(none.admin, { userId: "u1", emailProven: true }), false);
  assert.equal(none.updates.length, 0);
  assert.equal(none.upserts.length, 0);
  const unproven = fake({ app_role: "client", account_status: "onboarding" }, 3);
  assert.equal(await activateGuestBookerIfEligible(unproven.admin, { userId: "u1", emailProven: false }), false);
  assert.equal(unproven.updates.length, 0);
  const active = fake({ app_role: "client", account_status: "active" }, 3);
  assert.equal(await activateGuestBookerIfEligible(active.admin, { userId: "u1", emailProven: true }), false);
  assert.equal(active.updates.length, 0);
});

test("sign-in activates only inside the verified-claim gate, after the claim relink", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/client-account/actions.ts"), "utf8");
  const gate = src.indexOf("if (mayClaim) {");
  const relink = src.indexOf("await relinkFirstConfirmedClaim(input.userId);", gate);
  const activate = src.indexOf("claimAndActivateVerifiedClient(", gate);
  assert.ok(gate > 0 && relink > gate && activate > relink, "claim + activation must follow the claim relink inside the mayClaim gate");
});

import { shouldActivateSelfSignedClient } from "./guest-activate";

test("TUL-771: an explicit client sign-up activates a fresh client row; nothing else does", () => {
  assert.equal(shouldActivateSelfSignedClient({ signupIntent: "client", appRole: "client", accountStatus: "onboarding" }), true);
  // no intent (a guest booker with no booking keeps onboarding, owner decision TUL-465)
  assert.equal(shouldActivateSelfSignedClient({ signupIntent: null, appRole: "client", accountStatus: "onboarding" }), false);
  // never touches a talent, staff or already-active account
  assert.equal(shouldActivateSelfSignedClient({ signupIntent: "client", appRole: "talent", accountStatus: "onboarding" }), false);
  assert.equal(shouldActivateSelfSignedClient({ signupIntent: "client", appRole: "agency_staff", accountStatus: "onboarding" }), false);
  assert.equal(shouldActivateSelfSignedClient({ signupIntent: "client", appRole: "client", accountStatus: "active" }), false);
  assert.equal(shouldActivateSelfSignedClient({ signupIntent: "talent", appRole: "client", accountStatus: "onboarding" }), false);
});
