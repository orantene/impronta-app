"use server";

/**
 * Posts v1 writer actions (TUL-1006 save path + TUL-1007 paid gate).
 *
 * Two actor kinds, one write path (`lib/cms/posts-writer.ts`):
 *   talent*   — the talent writer. Scope from `resolvePostScope` (their owned
 *               business workspace's tenant, else their talent profile). Gate
 *               = talentPosts (Web Office), per actor, in both scopes.
 *   workspace* — workspace admins. Scope = the session tenant
 *               (`requireTenantScope`). Gate = workspace posts capability.
 * The tenant/talent id NEVER comes from client input.
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { requirePhase5Capability } from "@/lib/site-admin";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadOwnedBusinessWorkspace } from "@/lib/talent-site/server/workspace-site-context";
import { canPublishPosts } from "@/lib/access/posts-capability";
import { loadWorkspaceCanPublishPosts, resolvePostScope } from "@/lib/cms/posts-scope";
import {
  createPostDraft,
  publishPostNow,
  savePostDraft,
  unpublishPostNow,
  updatePostSettings,
  type PostDraftValues,
  type PostSettingsPatch,
  type PostWriteResult,
  type PostWriterContext,
  type PostWriterRecord,
} from "@/lib/cms/posts-writer";
import type { PostLocale } from "@/lib/cms/posts-shared";

export type PostWriterActionResult = PostWriteResult<PostWriterRecord>;
type UiLocale = "es" | "en";

type CtxResult = { ok: true; ctx: PostWriterContext } | { ok: false; result: PostWriterActionResult };

const denied = (message: string): CtxResult => ({
  ok: false,
  result: { ok: false, code: "write_failed", message },
});

async function talentCtx(uiLocale: UiLocale = "es"): Promise<CtxResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return denied(readOnly.error);
  const self = await requireTalentSelf();
  if (!self.ok) return denied(self.error);
  const admin = createServiceRoleClient();
  const scope = await resolvePostScope(
    { userId: self.session.user.id, talentProfileId: self.talentProfile.id },
    {
      loadOwnedBusinessWorkspace: (userId) =>
        admin
          ? loadOwnedBusinessWorkspace(admin, userId)
          : Promise.resolve({ ownsBusinessWorkspace: false, tenantId: null }),
    },
  );
  return {
    ok: true,
    ctx: {
      supabase: self.session.supabase,
      scope,
      actorProfileId: self.session.user.id,
      actorKind: "talent",
      canPublish: canPublishPosts(self.planKey),
      uiLocale,
    },
  };
}

async function workspaceCtx(
  cap: "agency.site_admin.pages.edit" | "agency.site_admin.pages.publish",
  uiLocale: UiLocale = "en",
): Promise<CtxResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return denied(readOnly.error);
  const auth = await requireSession();
  if (!auth.ok) return denied(auth.error);
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return denied("Select an agency workspace before managing posts.");
  try {
    await requirePhase5Capability(cap, scope.tenantId);
  } catch {
    return denied("Not authorized.");
  }
  const admin = createServiceRoleClient();
  const canPublish = admin ? await loadWorkspaceCanPublishPosts(admin, scope.tenantId) : false;
  return {
    ok: true,
    ctx: {
      supabase: auth.supabase,
      scope: { kind: "tenant", tenantId: scope.tenantId },
      actorProfileId: auth.user.id,
      actorKind: "workspace_admin",
      canPublish,
      uiLocale,
    },
  };
}

async function run(
  label: string,
  ctxP: Promise<CtxResult>,
  op: (ctx: PostWriterContext) => Promise<PostWriterActionResult>,
): Promise<PostWriterActionResult> {
  try {
    const c = await ctxP;
    if (!c.ok) return c.result;
    return await op(c.ctx);
  } catch (error) {
    logServerError(`cms/posts-writer-actions/${label}`, error);
    return { ok: false, code: "write_failed", message: "Could not save. Try again." };
  }
}

// ---- talent writer ---------------------------------------------------------

export async function talentCreatePostDraftAction(
  input: { locale: PostLocale } & PostDraftValues,
  uiLocale?: UiLocale,
): Promise<PostWriterActionResult> {
  return run("talent-create", talentCtx(uiLocale), (ctx) => createPostDraft(ctx, input));
}

export async function talentSavePostDraftAction(
  input: { id: string } & PostDraftValues,
  uiLocale?: UiLocale,
): Promise<PostWriterActionResult> {
  return run("talent-save", talentCtx(uiLocale), (ctx) => savePostDraft(ctx, input));
}

export async function talentUpdatePostSettingsAction(
  input: { id: string; patch: PostSettingsPatch },
  uiLocale?: UiLocale,
): Promise<PostWriterActionResult> {
  return run("talent-settings", talentCtx(uiLocale), (ctx) => updatePostSettings(ctx, input));
}

export async function talentPublishPostAction(
  input: { id: string; draft?: PostDraftValues },
  uiLocale?: UiLocale,
): Promise<PostWriterActionResult> {
  return run("talent-publish", talentCtx(uiLocale), (ctx) => publishPostNow(ctx, { id: input.id, draft: input.draft }));
}

export async function talentUnpublishPostAction(
  input: { id: string },
  uiLocale?: UiLocale,
): Promise<PostWriterActionResult> {
  return run("talent-unpublish", talentCtx(uiLocale), (ctx) => unpublishPostNow(ctx, input));
}

// ---- workspace admin -------------------------------------------------------

export async function workspaceCreatePostDraftAction(
  input: { locale: PostLocale } & PostDraftValues,
  uiLocale?: UiLocale,
): Promise<PostWriterActionResult> {
  return run("ws-create", workspaceCtx("agency.site_admin.pages.edit", uiLocale), (ctx) => createPostDraft(ctx, input));
}

export async function workspaceSavePostDraftAction(
  input: { id: string } & PostDraftValues,
  uiLocale?: UiLocale,
): Promise<PostWriterActionResult> {
  return run("ws-save", workspaceCtx("agency.site_admin.pages.edit", uiLocale), (ctx) => savePostDraft(ctx, input));
}

export async function workspaceUpdatePostSettingsAction(
  input: { id: string; patch: PostSettingsPatch },
  uiLocale?: UiLocale,
): Promise<PostWriterActionResult> {
  const cap = input.patch.status !== undefined ||
    input.patch.published_at !== undefined ||
    input.patch.scheduled_publish_at !== undefined
    ? "agency.site_admin.pages.publish"
    : "agency.site_admin.pages.edit";
  return run("ws-settings", workspaceCtx(cap, uiLocale), (ctx) => updatePostSettings(ctx, input));
}

export async function workspacePublishPostAction(
  input: { id: string; draft?: PostDraftValues },
  uiLocale?: UiLocale,
): Promise<PostWriterActionResult> {
  return run("ws-publish", workspaceCtx("agency.site_admin.pages.publish", uiLocale), (ctx) =>
    publishPostNow(ctx, { id: input.id, draft: input.draft }),
  );
}

export async function workspaceUnpublishPostAction(
  input: { id: string },
  uiLocale?: UiLocale,
): Promise<PostWriterActionResult> {
  return run("ws-unpublish", workspaceCtx("agency.site_admin.pages.publish", uiLocale), (ctx) =>
    unpublishPostNow(ctx, input),
  );
}
