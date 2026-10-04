import "server-only";

import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { OwningParty } from "@/lib/inquiry/owning-party-resolver";

/**
 * B2 — link inquiries.customer_id via ensureCustomer when contact email/phone
 * is present. Talent-direct (single talent owning party = talent) → private
 * owner pool; otherwise agency pool (owner null). Best-effort: never fails submit.
 */
export async function linkInquiryCustomer(args: {
  tenantId: string;
  inquiryId: string;
  contactEmail: string | null | undefined;
  contactPhone: string | null | undefined;
  contactName: string | null | undefined;
  clientUserId: string | null | undefined;
  talentProfileIds: string[];
  owningParties: Map<string, OwningParty>;
}): Promise<void> {
  const email = (args.contactEmail ?? "").trim();
  const phone = (args.contactPhone ?? "").trim();
  if (!email && !phone) return;

  let ownerTalentProfileId: string | null = null;
  if (args.talentProfileIds.length === 1) {
    const tid = args.talentProfileIds[0]!;
    if (args.owningParties.get(tid)?.type === "talent") {
      ownerTalentProfileId = tid;
    }
  }

  try {
    const ensured = await ensureCustomer({
      tenantId: args.tenantId,
      email: email || null,
      phone: phone || null,
      displayName: args.contactName,
      userId: args.clientUserId ?? null,
      ownerTalentProfileId,
    });
    if (!ensured.ok) return;

    const admin = createServiceRoleClient();
    if (!admin) return;
    const { error } = await admin
      .from("inquiries")
      .update({ customer_id: ensured.customerId })
      .eq("id", args.inquiryId);
    if (error) {
      logServerError("inquiry-engine-submit.linkCustomer", error);
    }
  } catch (err) {
    logServerError(
      "inquiry-engine-submit.linkCustomer",
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}
