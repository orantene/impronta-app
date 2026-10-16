"use server";

/**
 * Platform HQ · Posts moderation — server actions (Posts v1, TUL-1011).
 * Platform admin only: the check runs HERE, on the server, on every call; the
 * page's own gate is only a courtesy. The DB trigger is the last line.
 */

import { revalidatePath } from "next/cache";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import {
  restorePost,
  takedownPost,
  type PlatformAdminGate,
  type TakedownResult,
} from "@/lib/cms/posts-platform-admin";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const PATH = "/platform/admin/posts";

const gate: PlatformAdminGate = async () => {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) return { ok: false, error: "Platform admin access required." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role unavailable." };
  return { ok: true, userId: session.user.id, admin };
};

export async function takedownPostAction(input: { postId: string; reason: string }): Promise<TakedownResult> {
  await requireNotImpersonating();
  const result = await takedownPost(gate, { postId: input.postId, reason: input.reason });
  if (result.ok) revalidatePath(PATH);
  return result;
}

export async function restorePostAction(input: { postId: string }): Promise<TakedownResult> {
  await requireNotImpersonating();
  const result = await restorePost(gate, { postId: input.postId });
  if (result.ok) revalidatePath(PATH);
  return result;
}
