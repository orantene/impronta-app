/**
 * TUL-82 · Onboarding 1A: one provisioning sequence per "How do you work?"
 * choice. Pure orchestration over injected steps (the real steps live in
 * `provision-for-choice.server.ts`), so the record set per choice and the
 * run-twice idempotency are unit-tested.
 *
 * Every step is an "ensure": it looks for the row first and creates only what
 * is missing, so a retry after any failure finishes the job without a second
 * workspace or a "-2" slug.
 *
 *   myself: promote(talent) → talent profile (+ hub roster) → talent site → home=talent
 *   studio: promote(agency_staff) → workspace (+ owner) → domain row → home=workspace
 *   both:   promote(talent) → talent profile (+ hub roster) → workspace (+ owner)
 *           → domain row → self roster (bookable) → profile approved/public → home=workspace
 *
 * Fatal: no talent profile (myself / both), no workspace (studio / both), no
 * self roster (both: she must be bookable). Non-fatal (reported as warnings,
 * fixed by the next retry): site publish, domain row, home surface.
 */

import {
  freshAppRoleForChoice,
  homeSurfaceForChoice,
  type OnboardingChoice,
} from "./choice";

export type StepFail = { ok: false; code: string; message: string };

export type EnsuredTalent = { talentProfileId: string; profileCode: string | null };
export type EnsuredWorkspace<W> = {
  tenantId: string;
  tenantSlug: string;
  /** True when the one-free-workspace rule handed back an existing workspace. */
  reusedFreeWorkspace: boolean;
  detail: W;
};

export type ChoiceProvisionDeps<W, S> = {
  /** Additive: only a fresh `client` + `onboarding` account changes role. */
  promoteFreshAppRole(role: "talent" | "agency_staff"): Promise<void>;
  ensureTalentProfile(): Promise<({ ok: true } & EnsuredTalent) | StepFail>;
  ensureTalentSite(talentProfileId: string): Promise<{ ok: true; site: S } | StepFail>;
  ensureWorkspace(opts: { withTalentProfile: boolean }): Promise<({ ok: true } & EnsuredWorkspace<W>) | StepFail>;
  ensureWorkspaceDomain(tenantId: string, tenantSlug: string): Promise<{ ok: true } | StepFail>;
  ensureSelfRoster(tenantId: string, talentProfileId: string): Promise<{ ok: true } | StepFail>;
  /**
   * TUL-84: persist services, hours, place, appointments and the first provider
   * invite. Optional (a build without essentials skips it). Never fatal: returns
   * warnings, and a retry finishes what failed because every write is an ensure.
   */
  applyEssentials?(ctx: { choice: OnboardingChoice; talent: EnsuredTalent | null; workspace: { tenantId: string; tenantSlug: string } | null }): Promise<string[]>;
  /** draft/hidden → approved/public; never downgrades a live profile. */
  promoteTalentProfileLive(talentProfileId: string): Promise<{ ok: true } | StepFail>;
  setHomeSurface(surface: "talent" | "workspace"): Promise<{ ok: true } | StepFail>;
};

export type ChoiceProvisionResult<W, S> =
  | {
      ok: true;
      choice: OnboardingChoice;
      talent: EnsuredTalent | null;
      site: S | null;
      workspace: EnsuredWorkspace<W> | null;
      warnings: string[];
    }
  | ({ choice: OnboardingChoice } & StepFail);

export async function runChoiceProvisioning<W, S>(
  choice: OnboardingChoice,
  deps: ChoiceProvisionDeps<W, S>,
): Promise<ChoiceProvisionResult<W, S>> {
  const warnings: string[] = [];
  const wantsTalent = choice !== "studio";
  const wantsWorkspace = choice !== "myself";

  await deps.promoteFreshAppRole(freshAppRoleForChoice(choice));

  let talent: EnsuredTalent | null = null;
  if (wantsTalent) {
    const tp = await deps.ensureTalentProfile();
    if (!tp.ok) return { ...tp, choice };
    talent = { talentProfileId: tp.talentProfileId, profileCode: tp.profileCode };
  }

  let site: S | null = null;
  if (choice === "myself" && talent) {
    const s = await deps.ensureTalentSite(talent.talentProfileId);
    if (s.ok) site = s.site;
    else warnings.push(`site:${s.code}`);
  }

  let workspace: EnsuredWorkspace<W> | null = null;
  if (wantsWorkspace) {
    const ws = await deps.ensureWorkspace({ withTalentProfile: wantsTalent });
    if (!ws.ok) return { ...ws, choice };
    workspace = { tenantId: ws.tenantId, tenantSlug: ws.tenantSlug, reusedFreeWorkspace: ws.reusedFreeWorkspace, detail: ws.detail };

    const domain = await deps.ensureWorkspaceDomain(ws.tenantId, ws.tenantSlug);
    if (!domain.ok) warnings.push(`domain:${domain.code}`);

    if (talent) {
      const roster = await deps.ensureSelfRoster(ws.tenantId, talent.talentProfileId);
      if (!roster.ok) return { ...roster, choice };
      // "both": she is publicly bookable on her workspace site from day one.
      const live = await deps.promoteTalentProfileLive(talent.talentProfileId);
      if (!live.ok) return { ...live, choice };
    }
  }

  if (deps.applyEssentials) {
    try {
      warnings.push(...(await deps.applyEssentials({ choice, talent, workspace: workspace ? { tenantId: workspace.tenantId, tenantSlug: workspace.tenantSlug } : null })));
    } catch (err) {
      warnings.push(`essentials:${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const home = await deps.setHomeSurface(homeSurfaceForChoice(choice));
  if (!home.ok) warnings.push(`home:${home.code}`);

  return { ok: true, choice, talent, site, workspace, warnings };
}
