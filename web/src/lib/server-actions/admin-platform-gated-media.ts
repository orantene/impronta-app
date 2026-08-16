"use server";

/**
 * admin-platform-gated-media.ts — super-admin action for the gated media access
 * switch (the `platform_settings` singleton) on /platform/admin/settings.
 *
 * Turning this on makes every covered photo render through
 * `/api/media/asset/<id>`, which re-runs the two-key predicate before it hands
 * over any bytes, so revoking a release actually stops the file instead of
 * leaving a saved link working forever.
 *
 * It does NOT touch `MEDIA_URL_SIGNING_SECRET`. That stays an environment
 * variable, on purpose: it is what makes a gated URL unforgeable, and an action
 * that could write it would put URL-minting power behind an admin session. When
 * the secret is missing this action still saves the switch, and the card says
 * plainly that the feature is not active.
 *
 * Pattern mirrors admin-platform-workspace-ui.ts (platform-admin gated,
 * `{ ok, error }` result, revalidatePath on success). The DB write lives in the
 * server-only lib `@/lib/platform/gated-media` so this action file stays free
 * of raw `.from(...)` (the no-untenanted-from ratchet).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import { writePlatformGatedMediaSetting } from "@/lib/platform/gated-media";

const schema = z.object({ enabled: z.boolean() }).strict();

export type UpdateGatedMediaInput = z.infer<typeof schema>;

export async function updatePlatformGatedMedia(
  raw: UpdateGatedMediaInput,
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

  // Drops this instance's memo of the setting as part of the write, so the
  // re-render below already reflects the new position.
  const result = await writePlatformGatedMediaSetting(session.user.id, parsed.data.enabled);
  if (!result.ok) return { ok: false, error: CLIENT_ERROR.update };

  revalidatePath("/platform/admin/settings");
  return { ok: true };
}
