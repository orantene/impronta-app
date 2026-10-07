"use server";

/**
 * Guest `?order=` cold-load resume — reader only.
 *
 * Resolves an order id to the guest-owned inquiry linked in conversation_records
 * (same table staff Messages uses). Never returns another guest's thread.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { decideOrderResume, decideTokenResume, parseGuestOrderQuery } from "@/lib/inquiry/guest-order-resume";
import { isSeedContact } from "@/lib/inquiry/guest-send-gate";
import type {
  ActiveGuestInquiry,
  GetActiveGuestInquiryResult,
} from "@/lib/inquiry/guest-chat-contract";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolveTalentSiteHostTenant } from "@/lib/messaging/talent-inquiry-tenant.server";
import { HUB_THREAD_ORIGIN } from "@/lib/messaging/thread-link";
import { publicThreadPath, verifyThreadToken } from "@/lib/messaging/thread-token";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

const GUEST_HEADER = "x-impronta-guest";

async function resolveGuestSessionId(admin: SupabaseClient): Promise<string | null> {
  const guestKey = (await headers()).get(GUEST_HEADER);
  if (!guestKey) return null;
  await admin.rpc("ensure_guest_session", { p_session_key: guestKey });
  const { data, error } = await admin
    .from("guest_sessions")
    .select("id")
    .eq("session_key", guestKey)
    .maybeSingle();
  if (error) {
    logServerError("guest-order-resume.resolveGuestSessionId", error);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

async function resolveTenantIdBySlug(admin: SupabaseClient, tenantSlug: string): Promise<string | null> {
  const hosted = await resolveTalentSiteHostTenant(admin);
  if (hosted.kind === "talent_site") return hosted.tenantId;
  const normalized = tenantSlug.trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await admin
    .from("agencies")
    .select("id, status")
    .eq("slug", normalized)
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("guest-order-resume.resolveTenantIdBySlug", error);
    return null;
  }
  if (!data) return null;
  if (data.status === "cancelled" || data.status === "archived") return null;
  return data.id as string;
}

/** The inquiry an order belongs to on this tenant (chip row first, then orders.inquiry_id), or null. */
async function inquiryIdForOrder(admin: SupabaseClient, tenantId: string, orderId: string): Promise<string | null> {
  const { data: records, error: recordErr } = await tenantScopedQuery(admin, "conversation_records", tenantId)
    .select("inquiry_id, linked_at")
    .eq("record_kind", "order")
    .eq("record_id", orderId)
    .is("unlinked_at", null)
    .order("linked_at", { ascending: false })
    .limit(1);
  if (recordErr) {
    logServerError("guest-order-resume.conversation_records", recordErr);
    return null;
  }
  const fromRecord = ((records ?? []) as Array<{ inquiry_id: string | null }>)[0]?.inquiry_id ?? null;
  if (fromRecord) return fromRecord;
  // Fallback: orders.inquiry_id when the chip row is missing (same seam as /pay).
  const { data: orderRow, error: orderErr } = await tenantScopedQuery(admin, "orders", tenantId)
    .select("inquiry_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) {
    logServerError("guest-order-resume.orders", orderErr);
    return null;
  }
  return (orderRow as { inquiry_id: string | null } | null)?.inquiry_id ?? null;
}

/**
 * Fresh-browser resume (TUL-11 B): `?t=<signed thread token>` (optionally with
 * `?order=`) on a talent site. The signed token is the only credential. It is
 * verified server-side (signature + expiry), must be minted for this host's
 * tenant, and a given order must belong to the token's inquiry. Returns the
 * hub `/c/t/<token>` URL to redirect to, or null for the safe fallback.
 */
export async function resolveGuestTokenResumeHref(input: {
  token: string | null | undefined;
  orderId?: string | null;
}): Promise<string | null> {
  try {
    const token = input.token?.trim();
    if (!token || token.length > 2048) return null;
    const verified = verifyThreadToken(token);
    if (!verified.ok) return null;
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const hosted = await resolveTalentSiteHostTenant(admin);
    if (hosted.kind !== "talent_site") return null;
    const orderId = input.orderId ? parseGuestOrderQuery(input.orderId) : null;
    if (input.orderId && !orderId) return null;
    const orderInquiryId = orderId && hosted.tenantId ? await inquiryIdForOrder(admin, hosted.tenantId, orderId) : null;
    const decision = decideTokenResume({
      tokenInquiryId: verified.inquiryId,
      tokenTenantId: verified.tenantId,
      hostTenantId: hosted.tenantId,
      orderId,
      orderInquiryId,
    });
    return decision === "redirect" ? `${HUB_THREAD_ORIGIN}${publicThreadPath(token)}` : null;
  } catch (err) {
    logServerError("guest-order-resume.resolveGuestTokenResumeHref", err);
    return null;
  }
}

/**
 * Cold-load `?order=<uuid>` → owned inquiry for the guest dock.
 * Returns `{ ok:true, active:null }` when there is nothing safe to open
 * (no cookie, foreign order, unlinked record) — never a leak.
 */
export async function getGuestInquiryByOrder(input: {
  tenantSlug: string;
  orderId: string;
}): Promise<GetActiveGuestInquiryResult> {
  try {
    const orderId = parseGuestOrderQuery(input.orderId);
    if (!orderId) return { ok: true, active: null };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: true, active: null };

    const guestSessionId = await resolveGuestSessionId(admin);
    if (!guestSessionId) return { ok: true, active: null };

    const tenantId = await resolveTenantIdBySlug(admin, input.tenantSlug);
    if (!tenantId) return { ok: true, active: null };

    const inquiryId = await inquiryIdForOrder(admin, tenantId, orderId);
    if (!inquiryId) return { ok: true, active: null };

    const { data: inq, error: inqErr } = await admin
      .from("inquiries")
      .select("id, contact_name, contact_email, contact_phone, status, guest_session_id")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (inqErr) {
      logServerError("guest-order-resume.inquiry", inqErr);
      return { ok: true, active: null };
    }
    if (!inq) return { ok: true, active: null };
    // Ownership gate — never open another session's thread from a shared URL.
    if (
      decideOrderResume({
        parsedOrderId: orderId,
        guestSessionId,
        inquiryId: inq.id as string,
        inquiryGuestSessionId: inq.guest_session_id as string | null,
      }) !== "open"
    ) {
      return { ok: true, active: null };
    }

    const contactPromoted = !isSeedContact(
      inq.contact_name as string | null,
      inq.contact_email as string | null,
    );
    const active: ActiveGuestInquiry = {
      inquiryId: inq.id as string,
      containsTalent: true,
      contactPromoted,
      prefill: {
        name: contactPromoted ? (inq.contact_name as string | null)?.trim() || null : null,
        email: contactPromoted ? (inq.contact_email as string | null)?.trim() || null : null,
        phone: (inq.contact_phone as string | null)?.trim() || null,
      },
    };
    return { ok: true, active };
  } catch (err) {
    logServerError("guest-order-resume.getGuestInquiryByOrder", err);
    return { ok: true, active: null };
  }
}
