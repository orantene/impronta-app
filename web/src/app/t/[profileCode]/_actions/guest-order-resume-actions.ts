"use server";

/**
 * Guest `?order=` cold-load resume — reader only.
 *
 * Resolves an order id to the guest-owned inquiry linked in conversation_records
 * (same table staff Messages uses). Never returns another guest's thread.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { decideOrderResume, parseGuestOrderQuery } from "@/lib/inquiry/guest-order-resume";
import { isSeedContact } from "@/lib/inquiry/guest-send-gate";
import type {
  ActiveGuestInquiry,
  GetActiveGuestInquiryResult,
} from "@/lib/inquiry/guest-chat-contract";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolveTalentSiteHostTenant } from "@/lib/messaging/talent-inquiry-tenant.server";
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

    const { data: records, error: recordErr } = await tenantScopedQuery(admin, "conversation_records", tenantId)
      .select("inquiry_id, linked_at")
      .eq("record_kind", "order")
      .eq("record_id", orderId)
      .is("unlinked_at", null)
      .order("linked_at", { ascending: false })
      .limit(1);
    if (recordErr) {
      logServerError("guest-order-resume.conversation_records", recordErr);
      return { ok: true, active: null };
    }
    let inquiryId = ((records ?? []) as Array<{ inquiry_id: string | null }>)[0]?.inquiry_id ?? null;

    // Fallback: orders.inquiry_id when the chip row is missing (same seam as /pay).
    if (!inquiryId) {
      const { data: orderRow, error: orderErr } = await tenantScopedQuery(admin, "orders", tenantId)
        .select("inquiry_id")
        .eq("id", orderId)
        .maybeSingle();
      if (orderErr) {
        logServerError("guest-order-resume.orders", orderErr);
        return { ok: true, active: null };
      }
      inquiryId = (orderRow as { inquiry_id: string | null } | null)?.inquiry_id ?? null;
    }
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
