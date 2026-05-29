"use server";

/**
 * admin-trial-offers.ts — platform-admin editor for the `plan_trial_offers`
 * catalog (default free-trial length + self-serve CTA copy per plan).
 *
 * Powers the Pricing dashboard → Trials tab. Every export is super_admin
 * gated. Writes use the service-role client because `plan_trial_offers` is
 * platform-level (no `tenant_id`) and write-locked to platform admins under
 * RLS — the gate here IS the authorization boundary.
 *
 * `upsertTrialOffer` is an UPSERT on the (audience, plan_key) unique key so
 * the admin can configure a plan that was never seeded without a separate
 * "create" path. The matching reader lives in `@/lib/plan-trials/offers`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

const PRICING_PATH = "/platform/admin/pricing";

// ─── Auth gate ───────────────────────────────────────────────────────────────

type GateOk = { ok: true; userId: string };
type GateErr = { ok: false; error: string };

async function requirePlatformAdmin(): Promise<GateOk | GateErr> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Platform admin access required." };
  }
  return { ok: true, userId: session.user.id };
}

// ─── upsertTrialOffer ────────────────────────────────────────────────────────

const trimToNull = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t.length === 0 ? null : t;
};

const upsertTrialOfferSchema = z
  .object({
    audience: z.enum(["workspace", "talent"]),
    planKey: z.string().min(1).max(64),
    trialDays: z.number().int().min(1).max(365),
    isEnabled: z.boolean(),
    ctaHeadline: z.string().max(120).nullable().optional(),
    ctaSubtext: z.string().max(280).nullable().optional(),
  })
  .strict();

export type UpsertTrialOfferInput = z.infer<typeof upsertTrialOfferSchema>;
export type UpsertTrialOfferResult = { ok: true } | { ok: false; error: string };

export async function upsertTrialOffer(
  raw: unknown,
): Promise<UpsertTrialOfferResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = upsertTrialOfferSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const input = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-trial-offers.upsert.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const { error } = await admin.from("plan_trial_offers").upsert(
    {
      audience: input.audience,
      plan_key: input.planKey,
      trial_days: input.trialDays,
      is_enabled: input.isEnabled,
      cta_headline: trimToNull(input.ctaHeadline),
      cta_subtext: trimToNull(input.ctaSubtext),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "audience,plan_key" },
  );
  if (error) {
    logServerError("admin-trial-offers.upsert.write", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(PRICING_PATH);
  return { ok: true };
}
