import "server-only";

/**
 * "Save, then build": the one place the module writes the real product.
 *
 * Idempotent on `module_state.build`: a second tap returns the stored result
 * and creates nothing new. Writes `building` first so a reload mid-build
 * shows the building screen, then per path:
 *   provisionForChoice (TUL-82): myself / studio / both, each step an
 *   "ensure" (see provision-for-choice.ts), then the arrival from the stamp.
 *   The explicit choice sets the path; the AI reading only fills a gap.
 * `failed` keeps the answers and the workspace, never the person's words.
 */

import { getAppUrl } from "@/lib/auth-flow";
import { buildEditorPanelUrl } from "@/lib/admin/website-editor-links";
import { getTenantPreviewUrl } from "@/lib/site-admin/server/tenant-hosts";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { Brief } from "@/lib/tulala/brief-store";
import { listFact, stringFact } from "@/lib/tulala/brief-store";
import { setBriefStatus, snapshotBrief, type BriefOwner } from "@/lib/tulala/brief-store.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateBriefModuleState } from "@/lib/tulala/brief-module-state.server";
import { ENGINE_VERSION } from "@/lib/tulala/engine";
import type { AccessProfileWithDisplayName } from "@/lib/access-profile";

import { resolveWorkspaceFinishUrl } from "./finish-url";
import { combineLiveChecks, verifyLivePageWithRetry, type LiveCheck } from "./verify-live";
import { arrivalFromStamp, parseArrivalStamp, type ArrivalPayload } from "./arrival";
import { buildUnderstanding } from "./understanding";
import { pathToChoice, resolveBuildPath } from "./choice";
import { resolveEssentialsForBuild } from "./essentials-resolve";
import { provisionForChoice } from "./provision-for-choice.server";
import { ensureStockHero } from "./stock-hero.server";
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
  // TUL-82: the "How do you work?" choice sets the path; the AI never overrides it.
  const path: OnboardingPath = resolveBuildPath({
    choice: input.state.choice,
    statePath: input.state.path,
    aiPath: () => buildUnderstanding({ brief: input.brief, intent: input.state.intent ?? "unknown" }).path,
  });
  const choice = input.state.choice ?? pathToChoice(path);
  const startedAt = new Date().toISOString();
  await updateBriefModuleState(input.brief.id, { build: { status: "building", startedAt, path } as Record<string, unknown>, step: "building" });

  const person = {
    name: stringFact(input.brief, "person.professional_name") ?? stringFact(input.brief, "person.name"),
    city: stringFact(input.brief, "person.city"),
  };
  const essentials = resolveEssentialsForBuild({
    essentials: input.state.essentials ?? null,
    serviceFacts: listFact(input.brief, "work.services"),
    discipline: stringFact(input.brief, "work.discipline") ?? stringFact(input.brief, "work.industry"),
    tradeSlug: input.state.typeChoice?.slug ?? null,
    country: stringFact(input.brief, "person.country"),
    city: person.city,
    locale: input.locale,
  });
  const services = Math.max(listFact(input.brief, "work.services").length, essentials?.services.length ?? 0);
  const businessName = stringFact(input.brief, "business.name");
  const firstService = essentials?.services[0]?.name ?? listFact(input.brief, "work.services")[0] ?? null;
  const appUrl = getAppUrl();

  try {
    await snapshotBrief(input.brief.id, { expectedVersion: input.brief.currentVersion, reason: "intake", createdBy: input.userId, engineVersion: ENGINE_VERSION });

    const prov = await provisionForChoice(choice, {
      admin,
      userClient: input.userClient,
      userId: input.userId,
      email: input.email,
      profile: input.profile,
      brief: input.brief,
      locale: input.locale,
      requestHost: input.requestHost,
      talentTypeSlug: input.state.typeChoice?.kind === "talent" ? input.state.typeChoice.slug : null,
      linkSlug: input.state.linkSlug ?? null,
      essentials,
      designPaletteKey: input.state.designChoice ?? null,
    });
    if (!prov.ok) return failed(input, prov.code, prov.message);
    if (prov.warnings.length) logServerError("onboarding.build.warnings", new Error(prov.warnings.join(",")));
    await setBriefStatus(input.brief.id, "approved");

    const talentProfileId = prov.talent?.talentProfileId;
    // DS-60: a pro with no photo of her own gets a platform-stock hero, then a re-publish (best effort, never fails the build).
    if (prov.site && talentProfileId) await ensureStockHero(admin, { talentProfileId, locale: input.locale });
    const apex = appUrl.replace(/^https?:\/\/app\./, "https://");
    const talent = prov.talent
      ? {
          publicUrl: prov.talent.profileCode ? `${apex}/t/${prov.talent.profileCode}` : null,
          todayUrl: `${appUrl}/talent/today`,
          siteUrl: prov.site?.publicUrl ?? null,
        }
      : null;

    if (!prov.workspace) {
      // 1D: "ready" only when the real page opens with the person's own name.
      const liveCheck = await verifyLivePageWithRetry({ url: talent?.siteUrl ?? null, name: person.name });
      if (!liveCheck.ok) logServerError("onboarding.build.verifyLive", new Error(`talent:${liveCheck.reason}`));
      const arrival = arrivalFromStamp({ path, stamp: null, person, businessName: null, services, site: null, talent, liveCheck, firstService });
      return done(input, { status: "done", path, talentProfileId, arrival, finishedAt: new Date().toISOString() });
    }

    const ws = prov.workspace;
    if (ws.detail.kind === "free_limit_reuse") {
      const adminUrl = `${appUrl}${ws.detail.adminPath}`;
      const arrival = arrivalFromStamp({
        path, stamp: null, reusedExisting: true, person, businessName, services,
        site: { publicUrl: adminUrl, editorUrl: adminUrl, adminPath: adminUrl },
        talent,
      });
      return done(input, { status: "done", path, tenantId: ws.tenantId, tenantSlug: ws.tenantSlug, talentProfileId, arrival, finishedAt: new Date().toISOString() });
    }

    const result = ws.detail.result;
    const { data: agency, error: agencyErr } = await admin.from("agencies").select("settings").eq("id", result.tenantId).maybeSingle();
    // A failed stamp read is reported as "no stamp" (fallback arrival), never as a composed site.
    if (agencyErr) logServerError("onboarding.build.stampRead", agencyErr);
    const stamp = agencyErr ? null : parseArrivalStamp((agency?.settings as Record<string, unknown> | null)?.site_compose);
    const deliveredUrl = (await getTenantPreviewUrl(admin, result.tenantId, { requestHost: input.requestHost })) ?? result.publicUrl;
    // 1D: one source for the address: the promised link when the workspace got that slug.
    const finish = resolveWorkspaceFinishUrl({ linkSlug: input.state.linkSlug ?? null, tenantSlug: result.tenantSlug, delivered: deliveredUrl });
    const publicUrl = finish.url;
    const finishName = businessName ?? result.tenantName;
    const wsCheck = await verifyLivePageWithRetry({ url: publicUrl, name: finishName });
    if (!wsCheck.ok) logServerError("onboarding.build.verifyLive", new Error(`workspace:${wsCheck.reason}`));
    // "both" also owns a talent site: it must exist and open with her name, or the finish is not "ready".
    let talentCheck: LiveCheck | null = null;
    if (choice === "both") {
      talentCheck = await verifyLivePageWithRetry({ url: talent?.siteUrl ?? null, name: person.name ?? finishName });
      if (!talentCheck.ok) logServerError("onboarding.build.verifyLive", new Error(`talent:${talentCheck.reason}`));
    }
    const liveCheck = combineLiveChecks(wsCheck, talentCheck);
    const editorUrl = buildEditorPanelUrl({ editorBaseUrl: publicUrl, panel: "sections" }) ?? `${appUrl}${result.adminPath}`;
    // `reusedExisting` here is this lead's own crash-recovered workspace, not
    // the one-free-workspace refusal (handled above): a normal arrival.
    const arrival = arrivalFromStamp({
      path, stamp, person, businessName: finishName, services,
      site: { publicUrl, editorUrl, adminPath: `${appUrl}${result.adminPath}` },
      talent, liveCheck, urlDiffers: finish.differs, firstService,
      ownerProvides: choice === "studio" && !!prov.talent,
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
