import "server-only";

import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type SupportCannedReply = {
  id: string;
  title: string;
  body: string;
};

/** Matches the four replies that shipped hardcoded in the HQ composer. */
export const DEFAULT_SUPPORT_CANNED_REPLIES: SupportCannedReply[] = [
  {
    id: "greeting",
    title: "Looking now",
    body: "Thanks for writing. I am looking at this now.",
  },
  {
    id: "need-more",
    title: "Need more",
    body: "Could you share a bit more detail, or a screenshot of what you see?",
  },
  {
    id: "fixed",
    title: "Try again",
    body: "This should be sorted. Could you try again and tell me if it is clear?",
  },
  {
    id: "resolve",
    title: "Resolving",
    body: "I am marking this resolved. Rate the ticket if you have a moment.",
  },
];

const entrySchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(2000),
});

const listSchema = z.array(entrySchema).max(30);

export async function loadSupportCannedReplies(): Promise<SupportCannedReply[]> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return DEFAULT_SUPPORT_CANNED_REPLIES;
    const { data } = await admin
      .from("platform_settings")
      .select("support_canned_replies")
      .eq("id", true)
      .maybeSingle();
    const raw = (data as { support_canned_replies?: unknown } | null)?.support_canned_replies;
    if (raw == null) return DEFAULT_SUPPORT_CANNED_REPLIES;
    const parsed = listSchema.safeParse(raw);
    if (!parsed.success) return DEFAULT_SUPPORT_CANNED_REPLIES;
    return parsed.data;
  } catch (err) {
    logServerError("platform.loadSupportCanned", err);
    return DEFAULT_SUPPORT_CANNED_REPLIES;
  }
}

export async function writeSupportCannedReplies(
  updatedBy: string,
  entries: SupportCannedReply[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = listSchema.safeParse(entries);
  if (!parsed.success) return { ok: false, error: "Invalid canned replies." };
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Not configured." };
    const { error } = await admin
      .from("platform_settings")
      .update({
        support_canned_replies: parsed.data,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      } as never)
      .eq("id", true);
    if (error) {
      logServerError("platform.writeSupportCanned", error);
      return { ok: false, error: "Could not save canned replies." };
    }
    return { ok: true };
  } catch (err) {
    logServerError("platform.writeSupportCanned", err);
    return { ok: false, error: "Could not save canned replies." };
  }
}
