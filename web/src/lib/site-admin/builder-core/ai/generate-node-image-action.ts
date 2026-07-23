"use server";

/**
 * Per-node AI image generation — the "Generate image" action behind an image
 * block. Staff-gated + scoped to the current tenant + bounded by a per-tenant
 * MONTHLY image quota (the user's explicit cost worry). It writes NOTHING to the
 * tree: it returns a hosted media URL, and the CLIENT patches the node's
 * `image.src` through the edit context (backfill-after-apply), so the result is
 * snapshotted + undoable like any edit.
 *
 * Cost is fused three ways: the quota check runs BEFORE the paid call; every
 * generation is logged; and its cost rolls into ai_usage_monthly, so image
 * spend also counts against the tenant spend cap.
 *
 * LIVE BLOCKER: production has no OpenAI key yet — this returns a clear
 * "not configured" error until one is added on /platform/admin/ai-providers.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { logServerError } from "@/lib/server/safe-error";
import {
  checkImageQuota,
  generateImageBytesFromPrompt,
  recordImageGenerationUsage,
  uploadGeneratedImageBytes,
} from "@/lib/ai/ai-image-generation";

export type GenerateNodeImageState =
  | { ok: true; url: string; mediaId: string; remaining: number }
  | { ok: false; error: string; code: string };

export async function generateNodeImageAction(input: {
  subject: string;
}): Promise<GenerateNodeImageState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  let tenantId: string;
  try {
    const scope = await requireTenantScope();
    tenantId = scope.tenantId;
  } catch {
    return { ok: false, error: "No active workspace.", code: "NO_SCOPE" };
  }

  const subject = (input.subject ?? "").trim();
  if (subject.length < 2) {
    return { ok: false, error: "Describe the image in a few words.", code: "BRIEF_TOO_SHORT" };
  }

  // Cost fuse #1 — the monthly cap, checked BEFORE the paid call.
  const quota = await checkImageQuota(tenantId);
  if (!quota.allowed) {
    return {
      ok: false,
      error: `Monthly image limit reached (${quota.cap} on the ${quota.plan} plan). It resets next month.`,
      code: "IMAGE_QUOTA",
    };
  }

  try {
    const bytes = await generateImageBytesFromPrompt(subject);
    const uploaded = await uploadGeneratedImageBytes({
      tenantId,
      userId: auth.user.id,
      bytes,
      alt: subject.slice(0, 200),
    });
    if (!uploaded) {
      await recordImageGenerationUsage({ tenantId, userId: auth.user.id, ok: false });
      return { ok: false, error: "Made the image but couldn't save it. Try again.", code: "UPLOAD_FAILED" };
    }
    await recordImageGenerationUsage({ tenantId, userId: auth.user.id, ok: true });
    return {
      ok: true,
      url: uploaded.url,
      mediaId: uploaded.id,
      remaining: Math.max(0, quota.remaining - 1),
    };
  } catch (err) {
    logServerError("ai-generate-node-image", err);
    await recordImageGenerationUsage({ tenantId, userId: auth.user.id, ok: false });
    const notConfigured = err instanceof Error && /OpenAI API key/i.test(err.message);
    return {
      ok: false,
      error: notConfigured
        ? "AI image generation isn't set up yet — add an OpenAI key in Platform HQ · AI."
        : "Couldn't generate that image. Try a different description.",
      code: notConfigured ? "OPENAI_NOT_CONFIGURED" : "GENERATION_FAILED",
    };
  }
}
