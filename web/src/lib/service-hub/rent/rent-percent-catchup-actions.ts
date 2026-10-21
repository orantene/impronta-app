"use server";

/**
 * TUL-1717: the studio sends the payment link for a month's percentage that the automatic invoice could not carry. Same
 * guards as issueRent (staff with payment-request rights, flag + TEST key, not impersonating); idempotent per (plan, month).
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { logWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { userHasCapability } from "@/lib/access";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveAgendaPayPublicOrigin } from "@/lib/talent-agenda/pay-public-origin";
import { getRequestLocale } from "@/i18n/request-locale";
import { issueMissedPercent, type CatchupResult } from "./rent-percent-catchup";
import { buildCatchupDeps } from "./rent-percent-catchup.server";

export async function issueMissedPercentLink(input: { planId: string; salesMonth: string }): Promise<CatchupResult | { ok: false; reason: "unauthenticated" | "not_allowed" }> {
  await requireNotImpersonating();
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, reason: "unauthenticated" };
    if (!(await userHasCapability("booking.payment.request", auth.tenantId))) return { ok: false, reason: "not_allowed" };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };
    const hdrs = await headers();
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
    const proto = hdrs.get("x-forwarded-proto") === "http" ? "http" : "https";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role Supabase client (same as issueRent)
    const publicOrigin = await resolveAgendaPayPublicOrigin(admin as any, auth.tenantId, host ? `${proto}://${host}` : "");
    const locale = (await getRequestLocale()) === "es" ? "es" : "en";
    const result = await issueMissedPercent(
      { tenantId: auth.tenantId, planId: input.planId, salesMonth: input.salesMonth, locale },
      buildCatchupDeps(admin, { actorUserId: auth.user.id, publicOrigin }),
    );
    if (result.ok && !result.already) {
      await logWorkspaceAudit({
        tenantId: auth.tenantId,
        category: "billing",
        action: "workspace.rent_percent_catchup.issued",
        summary: "Sent the payment link for a month's percentage of sales the automatic invoice could not carry",
        targetType: "studio_rent_plan",
        targetId: input.planId,
        metadata: { sales_month: input.salesMonth },
      });
    }
    revalidatePath("/", "layout");
    return result;
  } catch (err) {
    logServerError("rent.catchup.issue", err);
    return { ok: false, reason: "unavailable" };
  }
}
