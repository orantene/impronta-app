import "server-only";

/**
 * "Save, then build": the one place the module writes the real product.
 *
 * Idempotent on `module_state.build`: a second tap returns the stored result
 * and creates nothing new. Writes `building` first so a reload mid-build
 * shows the building screen, then per path:
 *   talent          → the profile row (minimal here; Phase 5 fills it)
 *   business / both → lead + slug hold → provisionWorkspaceFromLead (which
 *                     stamps the brief on the tenant and composes the site
 *                     inside onboardStarterContent) → arrival from the stamp
 * `failed` keeps the answers and the workspace, never the person's words.
 */

import { getAppUrl } from "@/lib/auth-flow";
import { provisionWorkspaceFromLead } from "@/lib/saas/workspace-signup.server";
import { buildEditorPanelUrl } from "@/lib/admin/website-editor-links";
import { getTenantPreviewUrl } from "@/lib/site-admin/server/tenant-hosts";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { Brief } from "@/lib/tulala/brief-store";
import { listFact, stringFact } from "@/lib/tulala/brief-store";
import { linkBriefObjects, setBriefStatus, snapshotBrief, type BriefOwner } from "@/lib/tulala/brief-store.server";
import { updateBriefModuleState } from "@/lib/tulala/brief-module-state.server";
import { upsertLeadForBrief } from "@/lib/tulala/approve.server";
import { ENGINE_VERSION } from "@/lib/tulala/engine";
import { promoteFreshProfileToWorkspaceOwner } from "@/lib/auth/promote-talent-signup";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessProfileWithDisplayName } from "@/lib/access-profile";

import { arrivalFromStamp, parseArrivalStamp, type ArrivalPayload } from "./arrival";
import { writeTalentProfileFromBrief } from "./talent-writer.server";
import { buildUnderstanding } from "./understanding";
import type { OnboardingPath, PersistedModuleState } from "./module-state";

export type BuildStatus =
  | { status: "building"; startedAt: string; path: OnboardingPath }
  | { status: "done"; path: OnboardingPath; tenantId?: string; tenantSlug?: string; talentProfileId?: string; arrival: ArrivalPayload; finishedAt: string }
  | { status: "failed"; path: OnboardingPath; code: string; message: string; finishedAt: string };

export function parseBuildStatus(raw: unknown): BuildStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.status === "building" || r.status === "done" || r.status === "failed") return r as unknown as BuildStatus;
  return null;
}

async function holdSubdomainForLead(admin: SupabaseClient, slug: string, leadId: string): Promise<void> {
  const { error } = await admin.from("saas_subdomain_reservations").upsert(
    { slug, lead_id: leadId, reserved_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
    { onConflict: "slug" },
  );
  if (error) logServerError("onboarding.build.holdSubdomain", error);
}

export async function runOnboardingBuild(input: {
  owner: BriefOwner;
  brief: Brief;
  state: PersistedModuleState;
  userClient: SupabaseClient;
  userId: string;
  email: string | null;
  profile: AccessProfileWithDisplayName | null;
  requestHost: string | null;
  locale: "en" | "es";
}): Promise<BuildStatus> {
  const existing = parseBuildStatus(input.state.build);
  // done → return it (a second tap creates nothing). failed → retry (the
  // provisioner is idempotent on the lead). building → in flight, unless stale.
  if (existing?.status === "done") return existing;
  if (existing?.status === "building" && Date.now() - Date.parse(existing.startedAt) < 3 * 60 * 1000) return existing;

  const admin = createServiceRoleClient();
  if (!admin) return failed(input, "service_unavailable", "Database not available.");
  const path: OnboardingPath =
    input.state.path ?? buildUnderstanding({ brief: input.brief, intent: input.state.intent ?? "unknown" }).path;
  const startedAt = new Date().toISOString();
  await updateBriefModuleState(input.brief.id, { build: { status: "building", startedAt, path } as Record<string, unknown>, step: "building" });

  const person = {
    name: stringFact(input.brief, "person.professional_name") ?? stringFact(input.brief, "person.name"),
    city: stringFact(input.brief, "person.city"),
  };
  const services = listFact(input.brief, "work.services").length;
  const businessName = stringFact(input.brief, "business.name");
  const appUrl = getAppUrl();

  try {
    await snapshotBrief(input.brief.id, { expectedVersion: input.brief.currentVersion, reason: "intake", createdBy: input.userId, engineVersion: ENGINE_VERSION });

    let talentProfileId: string | undefined;
    let talent: { publicUrl: string | null; todayUrl: string } | null = null;
    if (path !== "business") {
      const tp = await writeTalentProfileFromBrief({
        userClient: input.userClient, admin, userId: input.userId, email: input.email, brief: input.brief,
        locale: input.locale, typeSlug: input.state.typeChoice?.kind === "talent" ? input.state.typeChoice.slug : null, originDomain: input.requestHost,
      });
      if (!tp.talentProfileId && path === "talent") return failed(input, "talent_writer_failed", "Could not create your page.");
      if (tp.talentProfileId) {
        talentProfileId = tp.talentProfileId;
        await linkBriefObjects(input.brief.id, { talentProfileId: tp.talentProfileId });
        talent = { publicUrl: tp.profileCode ? `${appUrl.replace(/^https?:\/\/app\./, "https://")}/t/${tp.profileCode}` : null, todayUrl: `${appUrl}/talent/today` };
      }
    }

    if (path === "talent") {
      await setBriefStatus(input.brief.id, "approved");
      const arrival = arrivalFromStamp({ path, stamp: null, person, businessName: null, services, site: null, talent });
      return done(input, { status: "done", path, talentProfileId, arrival, finishedAt: new Date().toISOString() });
    }

    // Business / both: lead → hold → provision (stamps brief, composes site).
    const email = input.email;
    if (!email) return failed(input, "no_email", "No email on the account.");
    const leadId = await upsertLeadForBrief({
      brief: input.brief,
      choice: { talentProfile: path === "both", workspace: true, workspaceType: "business", workspacePlan: null, talentPlan: null },
      email,
      locale: input.locale,
      profileId: input.userId,
    });
    if (!leadId) return failed(input, "lead_failed", "Could not save your business.");
    if (input.state.linkSlug) {
      await admin.from("saas_marketing_signups").update({ subdomain_wanted: input.state.linkSlug }).eq("id", leadId);
      await holdSubdomainForLead(admin, input.state.linkSlug, leadId);
    }
    await linkBriefObjects(input.brief.id, { signupLeadId: leadId });
    await setBriefStatus(input.brief.id, "approved");

    // A business-only signup is staff of its workspace from the first minute;
    // "both" keeps the talent role (a talent with a profile stays active).
    if (path === "business") await promoteFreshProfileToWorkspaceOwner(input.userId);
    const result = await provisionWorkspaceFromLead({ leadId, userId: input.userId, userEmail: email, profile: input.profile });
    if (!result.ok) {
      if (result.error === "free_workspace_limit" && result.existingWorkspace) {
        const arrival = arrivalFromStamp({
          path, stamp: null, reusedExisting: true, person, businessName, services,
          site: { publicUrl: `${appUrl}${result.existingWorkspace.adminPath}`, editorUrl: `${appUrl}${result.existingWorkspace.adminPath}`, adminPath: `${appUrl}${result.existingWorkspace.adminPath}` },
          talent,
        });
        return done(input, { status: "done", path, tenantSlug: result.existingWorkspace.slug, talentProfileId, arrival, finishedAt: new Date().toISOString() });
      }
      return failed(input, result.error, result.message);
    }

    const { data: agency, error: agencyErr } = await admin.from("agencies").select("settings").eq("id", result.tenantId).maybeSingle();
    // A failed stamp read is reported as "no stamp" (fallback arrival), never as a composed site.
    if (agencyErr) logServerError("onboarding.build.stampRead", agencyErr);
    const stamp = agencyErr ? null : parseArrivalStamp((agency?.settings as Record<string, unknown> | null)?.site_compose);
    const publicUrl = (await getTenantPreviewUrl(admin, result.tenantId, { requestHost: input.requestHost })) ?? result.publicUrl;
    const editorUrl = buildEditorPanelUrl({ editorBaseUrl: publicUrl, panel: "sections" }) ?? `${appUrl}${result.adminPath}`;
    // `reusedExisting` here is this lead's own crash-recovered workspace, not
    // the one-free-workspace refusal (handled above): a normal arrival.
    const arrival = arrivalFromStamp({
      path, stamp, person, businessName: businessName ?? result.tenantName, services,
      site: { publicUrl, editorUrl, adminPath: `${appUrl}${result.adminPath}` },
      talent,
    });
    return done(input, { status: "done", path, tenantId: result.tenantId, tenantSlug: result.tenantSlug, talentProfileId, arrival, finishedAt: new Date().toISOString() });
  } catch (err) {
    logServerError("onboarding.build", err);
    return failed(input, "provision_failed", "Something went wrong while building.");
  }
}

async function done(input: { brief: Brief }, status: Extract<BuildStatus, { status: "done" }>): Promise<BuildStatus> {
  await updateBriefModuleState(input.brief.id, { build: status as unknown as Record<string, unknown>, step: "arrival" });
  return status;
}

async function failed(input: { brief: Brief; state: PersistedModuleState }, code: string, message: string): Promise<BuildStatus> {
  const status: BuildStatus = { status: "failed", path: input.state.path ?? "talent", code, message, finishedAt: new Date().toISOString() };
  // (path is informational here; the retry recomputes it)
  await updateBriefModuleState(input.brief.id, { build: status as unknown as Record<string, unknown>, step: "arrival" });
  return status;
}
