"use server";

/**
 * Platform-admin server actions for "Notification email copies"
 * (public.notification_email_copies). Same guard contract as ./actions.ts:
 * every action refuses while impersonating (inline
 * assertNotImpersonating, first awaited statement) and re-checks super_admin
 * server-side; all writes use the service-role client (the table has RLS on
 * with no policies, so only service role can touch it).
 */

import { revalidatePath } from "next/cache";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { sendEmailResult } from "@/lib/email";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import {
  COPY_KIND_LABELS,
  isPlausibleCopyEmail,
  normalizeCopyKinds,
} from "@/lib/notifications/email-copies/kinds";
import { invalidateCopyListCache } from "@/lib/notifications/email-copies/recipients";

const REVALIDATE_PATH = "/platform/admin/email";

export type CopyActionResult = { ok: true } | { ok: false; error: string };

type GuardOk = { ok: true; actorId: string };
type GuardFail = { ok: false; error: string };

async function guard(): Promise<GuardOk | GuardFail> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Please sign in again." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden." };
  }
  return { ok: true, actorId: session.user.id };
}

function done(): CopyActionResult {
  invalidateCopyListCache();
  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

export async function addNotificationCopy(input: {
  email: string;
  label?: string | null;
  kinds: string[];
}): Promise<CopyActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error };
  const g = await guard();
  if (!g.ok) return g;
  const email = (input.email ?? "").trim().toLowerCase();
  if (!isPlausibleCopyEmail(email)) return { ok: false, error: "Enter a valid email address." };
  const label = (input.label ?? "").trim().slice(0, 120) || null;
  const kinds = normalizeCopyKinds(input.kinds ?? []);
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };
  const { error } = await admin.from("notification_email_copies").insert({
    email,
    label,
    kinds,
    created_by: g.actorId,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "That address is already on the list." };
    }
    logServerError("platform.emailCopies.add", error);
    return { ok: false, error: "Could not add the address." };
  }
  return done();
}

export async function updateNotificationCopy(input: {
  id: string;
  kinds?: string[];
  paused?: boolean;
  label?: string | null;
}): Promise<CopyActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error };
  const g = await guard();
  if (!g.ok) return g;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.kinds) patch.kinds = normalizeCopyKinds(input.kinds);
  if (typeof input.paused === "boolean") patch.paused = input.paused;
  if (input.label !== undefined) patch.label = (input.label ?? "").trim().slice(0, 120) || null;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };
  const { error } = await admin
    .from("notification_email_copies")
    .update(patch)
    .eq("id", input.id);
  if (error) {
    logServerError("platform.emailCopies.update", error);
    return { ok: false, error: "Could not save the change." };
  }
  return done();
}

export async function removeNotificationCopy(id: string): Promise<CopyActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error };
  const g = await guard();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };
  const { error } = await admin.from("notification_email_copies").delete().eq("id", id);
  if (error) {
    logServerError("platform.emailCopies.remove", error);
    return { ok: false, error: "Could not remove the address." };
  }
  return done();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Send a simple test email to one list address, naming the kinds it receives. */
export async function sendNotificationCopyTest(id: string): Promise<CopyActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error };
  const g = await guard();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };
  const { data, error } = await admin
    .from("notification_email_copies")
    .select("email, kinds, paused")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) logServerError("platform.emailCopies.test.load", error);
    return { ok: false, error: "Address not found." };
  }
  const row = data as { email: string; kinds: string[] | null; paused: boolean };
  const kinds = normalizeCopyKinds(row.kinds ?? []);
  const items = kinds.length
    ? kinds.map((k) => `<li>${escapeHtml(COPY_KIND_LABELS[k])}</li>`).join("")
    : "<li>Nothing selected yet</li>";
  const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 12px;font-size:20px">Test notification copy</h2>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5">This address is on the Tulala notification copy list${row.paused ? " (currently paused)" : ""}. It receives copies of:</p>
    <ul style="font-size:14px;line-height:1.6;margin:0 0 8px">${items}</ul>
  </div>`;
  const result = await sendEmailResult({
    to: row.email,
    subject: "Tulala: test notification copy",
    html,
    tenantId: null,
  });
  if (result.status === "failed") return { ok: false, error: result.error };
  if (result.status !== "sent") return { ok: false, error: "Email sending is not configured here." };
  return { ok: true };
}
