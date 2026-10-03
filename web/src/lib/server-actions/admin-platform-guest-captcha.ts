"use server";

/**
 * Super-admin action for temporary guest captcha enforcement
 * (`platform_settings.guest_captcha_enforced`) on /platform/admin/settings.
 *
 * Default remains enforced. Turning this off skips captcha for guest
 * Continuar al pago / instant-book while testing. Re-enable before real
 * launch / friend handoff of guest traffic.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import { writeGuestCaptchaEnforced } from "@/lib/platform/guest-captcha-enforcement";

const schema = z.object({ enforced: z.boolean() }).strict();

export type UpdateGuestCaptchaInput = z.infer<typeof schema>;

export async function updatePlatformGuestCaptcha(
  raw: UpdateGuestCaptchaInput,
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

  const result = await writeGuestCaptchaEnforced(session.user.id, parsed.data.enforced);
  if (!result.ok) return { ok: false, error: CLIENT_ERROR.update };

  revalidatePath("/platform/admin/settings");
  return { ok: true };
}
