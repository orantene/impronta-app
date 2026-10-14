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
  const admin = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "eq"]) chain[m] = self;
      if (table === "profiles") {
        chain.maybeSingle = async () => ({ data: profile, error: null });
        chain.update = (patch: Record<string, unknown>) => { updates.push(patch); return chain; };
        chain.then = (r: (v: unknown) => void) => r({ error: null });
      } else {
        chain.then = (r: (v: unknown) => void) => r({ count: inquiryCount, error: null });
      }
      return chain;
    },
  } as unknown as SupabaseClient;
  return { admin, updates };
}

test("guest booker with a booking is activated and onboarding is marked complete", async () => {
  const { admin, updates } = fake({ app_role: "client", account_status: "onboarding" }, 2);
  assert.equal(await activateGuestBookerIfEligible(admin, { userId: "u1", emailProven: true }), true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].account_status, "active");
  assert.ok(typeof updates[0].onboarding_completed_at === "string");
});

test("no booking, unproven email or an already-active account change nothing", async () => {
  const none = fake({ app_role: "client", account_status: "onboarding" }, 0);
  assert.equal(await activateGuestBookerIfEligible(none.admin, { userId: "u1", emailProven: true }), false);
  assert.equal(none.updates.length, 0);
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
  const activate = src.indexOf("activateGuestBookerIfEligible(adminForClaim", gate);
  assert.ok(gate > 0 && relink > gate && activate > relink, "activation must follow the claim relink inside the mayClaim gate");
});

test("W5-11: passwordless code + magic-link confirm activate after claim relink", () => {
  const otp = readFileSync(join(process.cwd(), "src/app/auth/otp-actions.ts"), "utf8");
  const otpRelink = otp.indexOf("await relinkFirstConfirmedClaim(user.id)");
  const otpActivate = otp.indexOf("activateGuestBookerIfEligible(adminForActivate", otpRelink);
  assert.ok(otpRelink > 0 && otpActivate > otpRelink, "submitEmailCode must activate after relink");

  const confirm = readFileSync(join(process.cwd(), "src/app/auth/confirm/route.ts"), "utf8");
  const confirmRelink = confirm.indexOf("await relinkFirstConfirmedClaim(user.id)");
  const confirmActivate = confirm.indexOf("activateGuestBookerIfEligible(adminForActivate", confirmRelink);
  assert.ok(confirmRelink > 0 && confirmActivate > confirmRelink, "auth/confirm must activate after relink");
});
