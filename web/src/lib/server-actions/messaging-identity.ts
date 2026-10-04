"use server";

/**
 * Identity capture readers/writers for Messages v5 (D04 / M07).
 * Split out of `messaging-engine.ts` to keep that file under the max-lines
 * ratchet. Auth is `messagingInquiryManager` (staff OR active coordinator)
 * so talent inbox Capture identity Save is not refused with `not_allowed`
 * ("You cannot do that from here.") — same seam as catalog #2281 / offers.
 */

import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmail, normalizePhoneE164 } from "@/lib/customers/customer-identity";
import { matchCustomers } from "@/lib/messaging/match-customers";
import { fail } from "@/lib/messaging/refusals";
import { messagingInquiryManager } from "@/lib/messaging/staff-guard";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { ActionResult } from "@/lib/messaging/types";

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
  const g = await messagingInquiryManager(parsed.data.inquiryId);
  if (!g.ok) return g;
  // D-MSG-336: tenants can exceed 200 customers. An unordered `.limit(200)`
  // missed the fixture customer (446 on journeys) so Same person? never
  // fired. Prefer identity-key lookup when email/phone is present; keep a
  // capped scan only for name-only match.
  const email = normalizeEmail(parsed.data.email);
  const phone = normalizePhoneE164(parsed.data.phone);
  let query = scoped(g.admin, "customers", g.tenantId).select("id, display_name, email, phone_e164");
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
  const g = await messagingInquiryManager(parsed.data.inquiryId);
  if (!g.ok) return g;
  return callRpc(g.admin, "messaging_set_identity", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_level: parsed.data.level,
    p_method: parsed.data.method,
    p_customer_id: parsed.data.customerId,
    p_expected_version: parsed.data.expectedVersion,
  });
}
