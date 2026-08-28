"use server";

import { z } from "zod";

import { requireSession } from "@/lib/server/action-guards";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { supportFrom } from "./support-from";

type Ok = { ok: true };
type Fail = { ok: false; error: string };

const subSchema = z.object({
  endpoint: z.string().url().max(2000),
  p256dh: z.string().min(8).max(500),
  auth: z.string().min(8).max(500),
  userAgent: z.string().max(400).optional(),
});

export async function subscribePushAction(
  raw: z.infer<typeof subSchema>,
): Promise<Ok | Fail> {
  const parsed = subSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid subscription." };
  const session = await requireSession();
  if (!session.ok) return session;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };

  const { error } = await supportFrom(admin, "push_subscriptions").upsert(
    {
      user_id: session.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      user_agent: parsed.data.userAgent ?? null,
      disabled_at: null,
      failed_at: null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: "Could not save subscription." };
  return { ok: true };
}

export async function unsubscribePushAction(raw: {
  endpoint: string;
}): Promise<Ok | Fail> {
  const parsed = z.object({ endpoint: z.string().url().max(2000) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid endpoint." };
  const session = await requireSession();
  if (!session.ok) return session;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };

  await supportFrom(admin, "push_subscriptions")
    .update({ disabled_at: new Date().toISOString() })
    .eq("endpoint", parsed.data.endpoint)
    .eq("user_id", session.user.id);
  return { ok: true };
}
