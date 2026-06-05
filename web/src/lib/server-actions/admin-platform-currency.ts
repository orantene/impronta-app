"use server";

/**
 * admin-platform-currency.ts — super-admin action for the platform currency
 * policy (the `platform_settings` singleton) on /platform/admin/settings.
 *
 * Lets HQ run the platform in ONE operating currency (default USD) and turn the
 * multi-currency earnings display OFF (default) so talents see one clean figure
 * instead of EUR/USD tabs. Display/operation only — no FX is performed.
 *
 * Pattern mirrors admin-product-pricing.ts (platform-admin gated, `{ ok, error }`
 * result, revalidatePath on success). The DB write lives in the server-only lib
 * `@/lib/platform/operating-currency` so this action file stays free of raw
 * `.from(...)` (the no-untenanted-from ratchet).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import { DEFAULT_CURRENCY_OPTIONS } from "@/lib/billing/currencies";
import { writePlatformOperatingCurrency } from "@/lib/platform/operating-currency";

const schema = z
  .object({
    operatingCurrency: z.enum(DEFAULT_CURRENCY_OPTIONS),
    multiCurrencyDisplayEnabled: z.boolean(),
  })
  .strict();

export type UpdatePlatformCurrencyInput = z.infer<typeof schema>;

export async function updatePlatformCurrencySettings(
  raw: UpdatePlatformCurrencyInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Platform admin access required." };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await writePlatformOperatingCurrency(session.user.id, parsed.data);
  if (!result.ok) return { ok: false, error: CLIENT_ERROR.update };

  revalidatePath("/platform/admin/settings");
  // Talent dashboards read the operating currency in their layout — bust them.
  revalidatePath("/talent", "layout");
  return { ok: true };
}
