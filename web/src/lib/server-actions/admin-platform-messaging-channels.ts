"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { writeMessagingChannelsEnabled } from "@/lib/channels/flag";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { CLIENT_ERROR } from "@/lib/server/safe-error";

const schema = z.object({ enabled: z.boolean() }).strict();

export async function updatePlatformMessagingChannels(raw: { enabled: boolean }) {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false as const, error: "Platform admin access required." };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  const result = await writeMessagingChannelsEnabled(session.user.id, parsed.data.enabled);
  if (!result.ok) return { ok: false as const, error: CLIENT_ERROR.update };
  revalidatePath("/platform/admin/settings");
  return { ok: true as const };
}
