"use server";

/**
 * TUL-1376: studio and member actions for station rent. Every action is flag-gated (test mode
 * only), seat/role checked and idempotent. Staff propose, the MEMBER accepts (consent to be
 * charged), the studio issues one invoice per month by hand. Nothing here touches a price,
 * fee or commission rule: the rent line goes through the ordinary order and payment-link path.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { logWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { userHasCapability } from "@/lib/access";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { notifyRentPlanMemberResponse } from "@/lib/notifications/producers/rent-notify";
import { ownerGuard } from "./rent-owner.server";
import { releaseStationHold } from "./rent-station.server";
import { resolveAgendaPayPublicOrigin } from "@/lib/talent-agenda/pay-public-origin";
import { getRequestLocale } from "@/i18n/request-locale";
import { currentRentPeriod, validateRentProposal } from "./rent-cycle";
import { rentBillingGate } from "./rent-gate";
import { issueRentInvoice, type RentIssueResult } from "./rent-issue";
import { buildRentIssueDeps } from "./rent-store.server";

type Fail<R extends string> = { ok: false; reason: R };

export type ProposeRentResult = { ok: true } | Fail<"unauthenticated" | "owner_only" | "disabled" | "not_test_mode" | "invalid" | "not_on_roster" | "already_has_plan" | "unavailable">;

export async function proposeRentPlan(input: {
  talentProfileId: string;
  monthlyRentCents: number;
  currency: string;
  startsOn: string;
}): Promise<ProposeRentResult> {
  await requireNotImpersonating();
  try {
    const g = await ownerGuard();
    if (!g.ok) return g;
    const gate = rentBillingGate();
    if (!gate.ok) return gate;
    const proposal = { monthlyRentCents: input.monthlyRentCents, currency: input.currency.trim().toUpperCase(), startsOn: input.startsOn };
    if (!validateRentProposal(proposal).ok) return { ok: false, reason: "invalid" };

    const { data: member } = await tenantScopedQuery(g.admin, "agency_talent_roster", g.tenantId)
      .select("id")
      .eq("talent_profile_id", input.talentProfileId)
      .neq("status", "removed")
      .maybeSingle();
    if (!member) return { ok: false, reason: "not_on_roster" };

    const { error } = await tenantScopedQuery(g.admin, "studio_rent_plans", g.tenantId).insert({
      talent_profile_id: input.talentProfileId,
      monthly_rent_cents: proposal.monthlyRentCents,
      currency: proposal.currency,
      starts_on: proposal.startsOn,
      status: "proposed",
      proposed_by: g.userId,
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") return { ok: false, reason: "already_has_plan" };
      logServerError("rent.propose", error);
      return { ok: false, reason: "unavailable" };
    }
    await logWorkspaceAudit({
      tenantId: g.tenantId,
      category: "roster",
      action: "workspace.rent_plan.proposed",
      summary: "Proposed a monthly station rent to a member (pending the member's acceptance)",
      targetType: "talent_profile",
      targetId: input.talentProfileId,
      metadata: { monthly_rent_cents: proposal.monthlyRentCents, currency: proposal.currency, starts_on: proposal.startsOn },
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("rent.propose", err);
    return { ok: false, reason: "unavailable" };
  }
}

export type SetRentStatusResult = { ok: true } | Fail<"unauthenticated" | "owner_only" | "not_found" | "invalid" | "unavailable">;

/** Owner: pause, resume or end an accepted plan. (A plan cannot be activated here: only the member does that.) */
export async function setRentPlanStatus(input: { planId: string; status: "paused" | "active" | "ended" }): Promise<SetRentStatusResult> {
  await requireNotImpersonating();
  try {
    const g = await ownerGuard();
    if (!g.ok) return g;
    const { data: plan } = await tenantScopedQuery(g.admin, "studio_rent_plans", g.tenantId).select("id, status, accepted_at").eq("id", input.planId).maybeSingle();
    const row = plan as { status: string; accepted_at: string | null } | null;
    if (!row) return { ok: false, reason: "not_found" };
    const from = row.status;
    const allowed =
      (input.status === "paused" && from === "active") ||
      (input.status === "active" && from === "paused" && row.accepted_at != null) ||
      (input.status === "ended" && (from === "active" || from === "paused" || from === "proposed"));
    if (!allowed) return { ok: false, reason: "invalid" };
    const { error } = await tenantScopedQuery(g.admin, "studio_rent_plans", g.tenantId)
      .update({
        status: input.status,
        updated_at: new Date().toISOString(),
        ...(input.status === "ended" ? { ended_by: "owner", ended_at: new Date().toISOString() } : {}),
      })
      .eq("id", input.planId)
      .eq("status", from);
    if (error) {
      logServerError("rent.setStatus", error);
      return { ok: false, reason: "unavailable" };
    }
    if (input.status === "ended") {
      const { data: ended } = await tenantScopedQuery(g.admin, "studio_rent_plans", g.tenantId).select("talent_profile_id").eq("id", input.planId).maybeSingle();
      const tp = (ended as { talent_profile_id?: string } | null)?.talent_profile_id;
      if (tp) await releaseStationHold(g.admin, { tenantId: g.tenantId, planId: input.planId, talentProfileId: tp });
    }
    await logWorkspaceAudit({
      tenantId: g.tenantId,
      category: "roster",
      action: "workspace.rent_plan.status",
      summary: `Rent plan ${from} to ${input.status}`,
      targetType: "studio_rent_plan",
      targetId: input.planId,
      metadata: { from, to: input.status },
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("rent.setStatus", err);
    return { ok: false, reason: "unavailable" };
  }
}

/** Issue (or re-open) the rent invoice for `period` (default: this month). Staff with payment-request rights. */
export async function issueRent(input: { planId: string; period?: string }): Promise<RentIssueResult | Fail<"unauthenticated" | "not_allowed">> {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role Supabase client (same as the other callers)
    const publicOrigin = await resolveAgendaPayPublicOrigin(admin as any, auth.tenantId, host ? `${proto}://${host}` : "");
    const locale = (await getRequestLocale()) === "es" ? "es" : "en";
    const result = await issueRentInvoice(
      { tenantId: auth.tenantId, planId: input.planId, period: input.period ?? currentRentPeriod(new Date()), locale },
      { ...buildRentIssueDeps(admin, { actorUserId: auth.user.id, publicOrigin }) },
    );
    if (result.ok && !result.already) {
      await logWorkspaceAudit({
        tenantId: auth.tenantId,
        category: "billing",
        action: "workspace.rent_invoice.issued",
        summary: "Issued a monthly station rent invoice",
        targetType: "studio_rent_invoice",
        targetId: result.invoiceId,
        metadata: { period: input.period ?? currentRentPeriod(new Date()) },
      });
    }
    revalidatePath("/", "layout");
    return result;
  } catch (err) {
    logServerError("rent.issue", err);
    return { ok: false, reason: "unavailable" };
  }
}

export type RespondRentResult = { ok: true } | Fail<"unauthenticated" | "not_found" | "unavailable">;

/**
 * The member answers a proposal. Accepting is the consent to be charged and records exactly what
 * was agreed (terms version, amount, currency); it is the only way a plan becomes active.
 * The update is pinned to the amount the member was shown, so a proposal edited in between
 * cannot be accepted by mistake.
 */
export async function respondRentPlan(input: { planId: string; accept: boolean; seenAmountCents?: number }): Promise<RespondRentResult> {
  await requireNotImpersonating();
  try {
    const me = await requireTalentSelf();
    if (!me.ok) return { ok: false, reason: "unauthenticated" };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };
    const { data: plan, error: readErr } = await admin
      .from("studio_rent_plans")
      .select("id, tenant_id, monthly_rent_cents, currency, terms_version")
      .eq("id", input.planId)
      .eq("talent_profile_id", me.talentProfile.id)
      .eq("status", "proposed")
      .maybeSingle();
    if (readErr) {
      logServerError("rent.respond.read", readErr);
      return { ok: false, reason: "unavailable" };
    }
    const row = plan as { id: string; tenant_id: string; monthly_rent_cents: number; currency: string; terms_version: number } | null;
    if (!row) return { ok: false, reason: "not_found" };
    if (input.accept && input.seenAmountCents != null && input.seenAmountCents !== row.monthly_rent_cents) return { ok: false, reason: "not_found" };
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("studio_rent_plans")
      .update(
        input.accept
          ? { status: "active", accepted_at: now, updated_at: now, accepted_terms_version: row.terms_version, accepted_amount_cents: row.monthly_rent_cents, accepted_currency: row.currency }
          : { status: "declined", updated_at: now },
      )
      .eq("id", row.id)
      .eq("status", "proposed")
      .eq("monthly_rent_cents", row.monthly_rent_cents)
      .eq("terms_version", row.terms_version)
      .select("id")
      .maybeSingle();
    if (error) {
      logServerError("rent.respond", error);
      return { ok: false, reason: "unavailable" };
    }
    if (!data) return { ok: false, reason: "not_found" };
    await logWorkspaceAudit({
      tenantId: row.tenant_id,
      category: "roster",
      action: input.accept ? "workspace.rent_plan.accepted" : "workspace.rent_plan.declined",
      summary: input.accept ? "Member accepted the monthly station rent" : "Member declined the monthly station rent",
      targetType: "studio_rent_plan",
      targetId: input.planId,
      metadata: { terms_version: row.terms_version, amount_cents: row.monthly_rent_cents, currency: row.currency },
    });
    if (!input.accept) {
      // The owner hears about a decline (email + bell). Never throws; deduped on plan id + outcome.
      await notifyRentPlanMemberResponse({ admin, tenantId: row.tenant_id, planId: row.id, talentProfileId: me.talentProfile.id, outcome: "declined" });
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("rent.respond", err);
    return { ok: false, reason: "unavailable" };
  }
}

/** The member ends their own active or paused plan. The owner sees it on the Station rent card and in the audit log. */
export async function memberEndRentPlan(input: { planId: string }): Promise<RespondRentResult> {
  await requireNotImpersonating();
  try {
    const me = await requireTalentSelf();
    if (!me.ok) return { ok: false, reason: "unauthenticated" };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("studio_rent_plans")
      .update({ status: "ended", ended_by: "member", ended_at: now, updated_at: now })
      .eq("id", input.planId)
      .eq("talent_profile_id", me.talentProfile.id)
      .in("status", ["active", "paused"])
      .select("id, tenant_id")
      .maybeSingle();
    if (error) {
      logServerError("rent.memberEnd", error);
      return { ok: false, reason: "unavailable" };
    }
    if (!data) return { ok: false, reason: "not_found" };
    await releaseStationHold(admin, { tenantId: (data as { tenant_id: string }).tenant_id, planId: input.planId, talentProfileId: me.talentProfile.id });
    await logWorkspaceAudit({
      tenantId: (data as { tenant_id: string }).tenant_id,
      category: "roster",
      action: "workspace.rent_plan.ended_by_member",
      summary: "Member ended the monthly station rent",
      targetType: "studio_rent_plan",
      targetId: input.planId,
      metadata: {},
    });
    await notifyRentPlanMemberResponse({
      admin,
      tenantId: (data as { tenant_id: string }).tenant_id,
      planId: input.planId,
      talentProfileId: me.talentProfile.id,
      outcome: "ended",
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("rent.memberEnd", err);
    return { ok: false, reason: "unavailable" };
  }
}
