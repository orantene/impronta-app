"use server";

/**
 * admin-platform-payout-system.ts — super-admin action for the platform payout-rail
 * master switch (the `platform_settings` singleton) on /platform/admin/settings.
 *
 * Lets HQ choose which rail the whole platform settles on: Stripe Connect (default)
 * or Stripe v2 Global Payouts. Reversible; deletes no Global Payouts code.
 *
 * Pattern mirrors admin-platform-currency.ts (platform-admin gated, `{ ok, error }`
 * result, revalidatePath on success). The DB write lives in the server-only lib
 * `@/lib/payments/active-payout-system` so this action file stays free of raw
 * `.from(...)` (the no-untenanted-from ratchet).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import {
  writeActivePayoutSystem,
  type ActivePayoutSystem,
} from "@/lib/payments/active-payout-system";

const schema = z
  .object({
    system: z.enum(["connect", "global_payouts"]),
  })
  .strict();

export type UpdatePayoutSystemInput = z.infer<typeof schema>;

export async function updateActivePayoutSystem(
  raw: UpdatePayoutSystemInput,
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

  const result = await writeActivePayoutSystem(
    session.user.id,
    parsed.data.system as ActivePayoutSystem,
  );
  if (!result.ok) return { ok: false, error: CLIENT_ERROR.update };

  revalidatePath("/platform/admin/settings");
  // Talent payouts UI reads the active system to hide/show Global Payouts — bust it.
  revalidatePath("/talent", "layout");
  return { ok: true };
}
