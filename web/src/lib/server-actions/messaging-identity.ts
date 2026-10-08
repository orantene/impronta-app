"use server";

/**
 * Identity capture readers/writers for Messages v5 (D04 / M07).
 * Split out of `messaging-engine.ts` to keep that file under the max-lines
 * ratchet. Auth is `messagingInquiryManager` (staff OR active coordinator),
 * then the hub talent seller via `talentSellerPaymentActor` — same fallback
 * as `messagingRequestPayment`. Manager-only refused Soft Gel dock Capture
 * identity Save with `not_allowed` (Tip Live Soft Gel, 2026-10-04).
 */

import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmail, normalizePhoneE164 } from "@/lib/customers/customer-identity";
import { matchCustomers } from "@/lib/messaging/match-customers";
import { fail } from "@/lib/messaging/refusals";
import { messagingInquiryManager } from "@/lib/messaging/staff-guard";
import { talentSellerPaymentActor } from "@/lib/messaging/talent-payment-actor";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { ActionResult } from "@/lib/messaging/types";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";

const uuid = z.string().uuid();
const version = z.number().int().nonnegative();
const scoped = tenantScopedQuery;

function parseRpc(data: unknown): ActionResult<{ version?: number }> {
  const row = data as { ok?: boolean; reason?: string; version?: number } | null;
  if (!row) return fail("unavailable");
  if (row.ok) return { ok: true, version: row.version };
  if (row.reason === "conflict") return fail("conflict");
  if (row.reason === "not_found") return fail("not_found");
  return fail("unavailable");
}

async function callRpc(admin: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(name, args);
  if (error) return fail("unavailable");
  return parseRpc(data);
}

/** Match customers for identity capture / "Same person?". */
export async function messagingMatchCustomers(input: {
  inquiryId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const parsed = z
    .object({
      inquiryId: uuid,
      name: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const gated = await messagingInquiryManager(parsed.data.inquiryId);
  // Seller path: only her private pool (hub sellers share tenant_id). Managers
  // keep the tenant-wide match they had before this seller fallback.
  let g: Awaited<ReturnType<typeof messagingInquiryManager>> | Awaited<ReturnType<typeof talentSellerPaymentActor>>;
  let ownerTalentProfileId: string | null = null;
  if (gated.ok) {
    g = gated;
  } else {
    const seller = await talentSellerPaymentActor(parsed.data.inquiryId);
    if (!seller.ok) return seller;
    g = seller;
    ownerTalentProfileId = seller.talentProfileId;
  }
  // D-MSG-336: tenants can exceed 200 customers. An unordered `.limit(200)`
  // missed the fixture customer (446 on journeys) so Same person? never
  // fired. Prefer identity-key lookup when email/phone is present; keep a
  // capped scan only for name-only match.
  const email = normalizeEmail(parsed.data.email);
  const phone = normalizePhoneE164(parsed.data.phone);
  let query = scoped(g.admin, "customers", g.tenantId).select("id, display_name, email, phone_e164");
  if (ownerTalentProfileId) {
    query = query.eq("owner_talent_profile_id", ownerTalentProfileId);
  }
  if (email || phone) {
    const parts: string[] = [];
    if (email) parts.push(`email.eq.${email}`);
    if (phone) parts.push(`phone_e164.eq.${phone}`);
    query = query.or(parts.join(","));
  } else {
    query = query.order("updated_at", { ascending: false }).limit(200);
  }
  const { data, error } = await query;
  if (error) return fail("unavailable");
  return {
    ok: true as const,
    matches: matchCustomers({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      customers: (data ?? []) as { id: string; display_name: string | null; email: string | null; phone_e164: string | null }[],
    }),
  };
}

/** Link / confirm identity on a thread. */
export async function messagingCaptureIdentity(input: {
  inquiryId: string;
  level: "linked" | "confirmed" | "granted";
  method: "phone" | "email" | "sms_code" | "name_only" | "staff";
  customerId: string | null;
  expectedVersion: number;
}) {
  await requireNotImpersonating();
  const parsed = z
    .object({
      inquiryId: uuid,
      level: z.enum(["linked", "confirmed", "granted"]),
      method: z.enum(["phone", "email", "sms_code", "name_only", "staff"]),
      customerId: uuid.nullable(),
      expectedVersion: version,
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const gated = await messagingInquiryManager(parsed.data.inquiryId);
  const g = gated.ok ? gated : await talentSellerPaymentActor(parsed.data.inquiryId);
  if (!g.ok) return g;
  // Capture links an already-chosen customerId; pool scoping is enforced on
  // match + createClient (seller private pool vs manager agency pool).
  return callRpc(g.admin, "messaging_set_identity", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_level: parsed.data.level,
    p_method: parsed.data.method,
    p_customer_id: parsed.data.customerId,
    p_expected_version: parsed.data.expectedVersion,
  });
}
