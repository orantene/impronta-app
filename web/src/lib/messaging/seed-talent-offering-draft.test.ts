import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { signTalentOfferingIntent } from "./talent-offering-intent";
import { seedTalentOfferingDraft } from "./seed-talent-offering-draft";

const PROFILE = "11111111-1111-4111-8111-111111111111";
const OFFERING = "22222222-2222-4222-8222-222222222222";
const TENANT = "33333333-3333-4333-8333-333333333333";
const INQUIRY = "44444444-4444-4444-8444-444444444444";

function client(failTable: string): SupabaseClient {
  const chain = (table: string) => {
    const fail = table === failTable;
    const api = {
      select() {
        return api;
      },
      eq() {
        return api;
      },
      in() {
        return api;
      },
      maybeSingle: () =>
        Promise.resolve(
          fail
            ? { data: null, error: { message: "down" } }
            : {
                data:
                  table === "talent_offerings"
                    ? {
                        id: OFFERING,
                        title: "Soft Gel Largo",
                        currency: "MXN",
                        talent_profile_id: PROFILE,
                        tenant_id: TENANT,
                        status: "published",
                      }
                    : null,
                error: null,
              },
        ),
    };
    return api;
  };
  return { from: chain } as unknown as SupabaseClient;
}

test("a failed talent profile read is unavailable, not a missing actor", async () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-secret-for-pos-messages";
  try {
    const token = signTalentOfferingIntent({
      profileId: PROFILE,
      offeringId: OFFERING,
      intent: "ask",
    });
    assert.ok(token);
    const result = await seedTalentOfferingDraft(client("talent_profiles"), {
      token: token!,
      tenantId: TENANT,
      inquiryId: INQUIRY,
      talentProfileId: PROFILE,
    });
    assert.deepEqual(result, { ok: false, reason: "unavailable" });
  } finally {
    process.env.GUEST_COOKIE_SECRET = prev;
  }
});
