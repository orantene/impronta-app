import { revalidateTag, updateTag } from "next/cache";

/**
 * Render-safe cache-tag invalidation.
 *
 * `updateTag` / `revalidateTag` are only legal inside Server Actions and Route
 * Handlers. When called during a Server Component *render* they throw
 * ("used ... during render which is unsupported"). Most site-admin writes run
 * inside actions, so they invalidate normally — but the workspace-provisioning
 * trampoline (`/onboarding/workspace` → `provisionWorkspaceFromLead` →
 * `onboardStarterContent` → publishSection / publishHomepage) executes those
 * same publish helpers *during render*, which crashed provisioning with a 500
 * (digest surfaced as "We hit a snag setting up your workspace").
 *
 * A brand-new tenant has nothing in the public cache to invalidate, and the
 * browser is redirected to freshly-rendered admin immediately after, so
 * skipping the tag update in that context is safe. These helpers perform the
 * real invalidation when allowed and swallow *only* the render-context guard
 * error — cache invalidation is best-effort and must never crash a publish.
 */

function isRenderContextGuardError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /during render|outside (of )?a request|Server Action|Route Handler/i.test(
    message,
  );
}

export function safeUpdateTag(tag: string): void {
  try {
    updateTag(tag);
  } catch (err) {
    if (!isRenderContextGuardError(err)) throw err;
  }
}

export function safeRevalidateTag(tag: string, profile: string): void {
  try {
    revalidateTag(tag, profile);
  } catch (err) {
    if (!isRenderContextGuardError(err)) throw err;
  }
}
