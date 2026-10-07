import "server-only";

/**
 * TUL-82 · the real steps behind `runChoiceProvisioning`. Each one reuses the
 * existing writer for that record; none of them creates a row it can find.
 *
 *   talent profile + hub roster → writeTalentProfileFromBrief (complete_talent_onboarding RPC)
 *   talent site                 → provisionTalentPersonalSiteIfMissing + ensureOwnSitePublished
 *   workspace + owner           → upsertLeadForBrief + provisionWorkspaceFromLead
 *                                 (lead.provisioned_tenant_id, orphan rollback, free limit)
 *   domain row                  → ensureWorkspaceSubdomainRow
 *   self roster (bookable)      → ensureSelfRosterSiteVisible
 *   profile live (both)         → promoteTalentProfileLive (shared with 1E)
 *   home                        → profiles.home_surface_preference
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccessProfileWithDisplayName } from "@/lib/access-profile";
import { isTalentSiteSubdomainsEnabled } from "@/lib/access/talent-site-subdomains";
import { getAppUrl } from "@/lib/auth-flow";
import { ensureHubRosterRow } from "@/lib/saas/ensure-hub-roster.server";
import { ensureSelfRosterSiteVisible } from "@/lib/saas/ensure-self-roster";
import { ensureWorkspaceSubdomainRow } from "@/lib/saas/ensure-workspace-domain";
import { provisionWorkspaceFromLead, type ProvisionWorkspaceResult } from "@/lib/saas/workspace-signup.server";
import { logServerError } from "@/lib/server/safe-error";
import { applyMaisonDesignAction } from "@/lib/talent-site/server/maison-apply-actions";
import { provisionTalentPersonalSiteIfMissing } from "@/lib/talent-site/server/provision";
import { publishMaxSiteAction } from "@/lib/talent-site/server/site-management-actions";
import type { Brief } from "@/lib/tulala/brief-store";
import { linkBriefObjects } from "@/lib/tulala/brief-store.server";
import { upsertLeadForBrief } from "@/lib/tulala/approve.server";

import type { DesignLookKey } from "./finish-url";
import { onboardingDesignApplyInput } from "./design-apply-input";
import type { OnboardingChoice } from "./choice";
import { runChoiceProvisioning, type ChoiceProvisionResult } from "./provision-for-choice";
import { ensureOwnSitePublished } from "./publish-own-site";
import { createEssentialsStore, resolveTalentHubTenantId } from "./essentials.server";
import { runEssentialsWrites, type Essentials } from "./essentials";
import { writeTalentProfileFromBrief } from "./talent-writer.server";
import { promoteTalentProfileLive } from "./talent-profile-promotion.server";

export type WorkspaceDetail =
  | { kind: "provisioned"; result: Extract<ProvisionWorkspaceResult, { ok: true }> }
  | { kind: "free_limit_reuse"; displayName: string; adminPath: string };

export type TalentSiteDetail = { publicUrl: string | null };

export type ProvisionForChoiceInput = {
  admin: SupabaseClient;
  userClient: SupabaseClient;
  userId: string;
  email: string | null;
  profile: AccessProfileWithDisplayName | null;
  brief: Brief;
  locale: "en" | "es";
  requestHost: string | null;
  /** Talent type chip slug (`module_state.typeChoice`), when the person tapped one. */
  talentTypeSlug: string | null;
  /** The link name chosen at "Ready to build" (held for the lead). */
  linkSlug: string | null;
  /** TUL-84: the confirmed essentials (resolved from module state + brief facts); null skips the writes. */
  essentials?: Essentials | null;
  /** 1D: the Maison palette the talent picked; applied before publish. Null = default. */
  designPaletteKey?: DesignLookKey | null;
};

export type ProvisionForChoiceResult = ChoiceProvisionResult<WorkspaceDetail, TalentSiteDetail>;

async function holdSubdomainForLead(admin: SupabaseClient, slug: string, leadId: string): Promise<void> {
  const { error } = await admin.from("saas_subdomain_reservations").upsert(
    { slug, lead_id: leadId, reserved_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
    { onConflict: "slug" },
  );
  if (error) logServerError("onboarding.provisionForChoice.holdSubdomain", error);
}

export async function provisionForChoice(
  choice: OnboardingChoice,
  input: ProvisionForChoiceInput,
): Promise<ProvisionForChoiceResult> {
  const { admin, brief, userId } = input;
  const apex = getAppUrl().replace(/^https?:\/\/app\./, "https://");

  return runChoiceProvisioning<WorkspaceDetail, TalentSiteDetail>(choice, {
    async promoteFreshAppRole(role) {
      // Additive: only a brand-new account (client + onboarding) moves. A
      // talent adding a workspace keeps `talent`; capabilities come from rows.
      const { error } = await admin
        .from("profiles")
        .update({ app_role: role })
        .eq("id", userId)
        .eq("app_role", "client")
        .eq("account_status", "onboarding");
      if (error) logServerError("onboarding.provisionForChoice.promote", error);
    },

    async ensureTalentProfile() {
      const tp = await writeTalentProfileFromBrief({
        userClient: input.userClient, admin, userId, email: input.email, brief,
        locale: input.locale, typeSlug: input.talentTypeSlug, originDomain: input.requestHost,
        displayNameFallback: input.essentials?.name ?? null,
        skipDraftOfferings: !!input.essentials?.services.length,
      });
      if (!tp.talentProfileId) return { ok: false, code: "talent_writer_failed", message: "Could not create your page." };
      // TUL-157: the writer's hub step logs and moves on when it fails. Give it
      // a second, idempotent chance so no sign-up leaves a talent roster-less.
      if (tp.wrote.roster !== "written") {
        await ensureHubRosterRow(admin, { talentProfileId: tp.talentProfileId, addedBy: userId });
      }
      await linkBriefObjects(brief.id, { talentProfileId: tp.talentProfileId });
      return { ok: true, talentProfileId: tp.talentProfileId, profileCode: tp.profileCode };
    },

    async ensureTalentSite(talentProfileId) {
      const draft = await provisionTalentPersonalSiteIfMissing(talentProfileId, "free", userId);
      if (!draft.ok) logServerError("onboarding.provisionForChoice.siteDraft", new Error(draft.error));
      const own = await ensureOwnSitePublished({
        subdomainsEnabled: isTalentSiteSubdomainsEnabled(),
        pathOrigin: apex,
        readSite: async () => {
          const [site, prof] = await Promise.all([
            admin.from("talent_sites").select("site_slug, site_published_at, theme_design_slug").eq("talent_profile_id", talentProfileId).maybeSingle(),
            admin.from("talent_profiles").select("is_demo").eq("id", talentProfileId).maybeSingle(),
          ]);
          if (site.error) return { row: null, isDemo: false, error: site.error.message };
          return { row: site.data ?? null, isDemo: Boolean((prof.data as { is_demo?: boolean } | null)?.is_demo) };
        },
        forceDesign: !!input.designPaletteKey,
        applyDefaultDesign: () => applyMaisonDesignAction(onboardingDesignApplyInput(input.designPaletteKey)),
        publish: () => publishMaxSiteAction(),
      }).catch((err) => ({ ok: false as const, error: String(err) }));
      if (!own.ok) {
        logServerError("onboarding.provisionForChoice.publishOwnSite", new Error(own.error));
        return { ok: false, code: "site_publish_failed", message: own.error };
      }
      return { ok: true, site: { publicUrl: own.publicUrl } };
    },

    async ensureWorkspace({ withTalentProfile }) {
      const email = input.email;
      if (!email) return { ok: false, code: "no_email", message: "No email on the account." };
      // One lead per brief (upsert), so a retry reuses it and with it
      // `provisioned_tenant_id`: no second workspace, no "-2" slug.
      const leadId = await upsertLeadForBrief({
        brief,
        choice: { talentProfile: withTalentProfile, workspace: true, workspaceType: "business", workspacePlan: null, talentPlan: null },
        email,
        locale: input.locale,
        profileId: userId,
      });
      if (!leadId) return { ok: false, code: "lead_failed", message: "Could not save your business." };
      if (input.linkSlug) {
        await admin.from("saas_marketing_signups").update({ subdomain_wanted: input.linkSlug }).eq("id", leadId);
        await holdSubdomainForLead(admin, input.linkSlug, leadId);
      }
      await linkBriefObjects(brief.id, { signupLeadId: leadId });

      const result = await provisionWorkspaceFromLead({ leadId, userId, userEmail: email, profile: input.profile });
      if (result.ok) {
        return { ok: true, tenantId: result.tenantId, tenantSlug: result.tenantSlug, reusedFreeWorkspace: false, detail: { kind: "provisioned", result } };
      }
      // One free workspace per owner: "both" / "studio" reuse the one they
      // already own instead of failing (findFreeWorkspaceLimitBlocker).
      if (result.error === "free_workspace_limit" && result.existingWorkspace) {
        const { data, error } = await admin.from("agencies").select("id").eq("slug", result.existingWorkspace.slug).maybeSingle();
        if (error || !data?.id) return { ok: false, code: "free_workspace_lookup_failed", message: result.message };
        return {
          ok: true,
          tenantId: data.id as string,
          tenantSlug: result.existingWorkspace.slug,
          reusedFreeWorkspace: true,
          detail: { kind: "free_limit_reuse", displayName: result.existingWorkspace.displayName, adminPath: result.existingWorkspace.adminPath },
        };
      }
      return { ok: false, code: result.error, message: result.message };
    },

    async ensureWorkspaceDomain(tenantId, tenantSlug) {
      const r = await ensureWorkspaceSubdomainRow(admin, { tenantId, slug: tenantSlug });
      return r.ok ? { ok: true } : { ok: false, code: r.error, message: "Could not register the workspace address." };
    },

    async ensureSelfRoster(tenantId, talentProfileId) {
      const r = await ensureSelfRosterSiteVisible(admin, { tenantId, talentProfileId, addedBy: userId });
      return r.ok ? { ok: true } : { ok: false, code: "self_roster_failed", message: r.error };
    },

    async applyEssentials({ choice: c, talent, workspace }) {
      const essentials = input.essentials;
      if (!essentials || !essentials.services.length) return [];
      let talentCtx: { talentProfileId: string; tenantId: string } | null = null;
      if (talent) {
        const tenantId = workspace?.tenantId ?? (await resolveTalentHubTenantId(admin, talent.talentProfileId));
        if (!tenantId) return ["essentials:no_talent_tenant"];
        talentCtx = { talentProfileId: talent.talentProfileId, tenantId };
      }
      const r = await runEssentialsWrites(createEssentialsStore(admin), { choice: c, essentials, talent: talentCtx, workspace });
      return r.warnings;
    },

    async promoteTalentProfileLive(talentProfileId) {
      const r = await promoteTalentProfileLive(admin, talentProfileId);
      return r.ok ? { ok: true } : { ok: false, code: "talent_profile_publish_failed", message: r.error };
    },

    async setHomeSurface(surface) {
      const { error } = await admin.from("profiles").update({ home_surface_preference: surface }).eq("id", userId);
      if (error) {
        logServerError("onboarding.provisionForChoice.homeSurface", error);
        return { ok: false, code: "home_surface_failed", message: error.message };
      }
      return { ok: true };
    },
  });
}
