"use server";

/**
 * admin-platform-workspace-ui.ts — super-admin action for the workspace-UI
 * switches (the `platform_settings` singleton) on /platform/admin/settings.
 *
 * Lets HQ show/hide the workspace shell's floating "+" quick-action button, the
 * first-run guided tour, and the storefront admin quick bar. The first two ship
 * hidden by default; the quick bar ships VISIBLE (it shipped that way in #1001,
 * so HQ opts out of it rather than into it).
 *
 * Pattern mirrors admin-platform-payout-system.ts (platform-admin gated,
 * `{ ok, error }` result, revalidatePath on success). The DB write lives in the
 * server-only lib `@/lib/platform/workspace-ui` so this action file stays free
 * of raw `.from(...)` (the no-untenanted-from ratchet).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import { writePlatformWorkspaceUi } from "@/lib/platform/workspace-ui";

const schema = z
  .object({
    fabEnabled: z.boolean(),
    tourEnabled: z.boolean(),
    quickBarEnabled: z.boolean(),
    supportEnabled: z.boolean(),
  })
  .strict();

export type UpdateWorkspaceUiInput = z.infer<typeof schema>;

export async function updatePlatformWorkspaceUi(
  raw: UpdateWorkspaceUiInput,
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

  const result = await writePlatformWorkspaceUi(session.user.id, parsed.data);
  if (!result.ok) return { ok: false, error: CLIENT_ERROR.update };

  revalidatePath("/platform/admin/settings");
  return { ok: true };
}
