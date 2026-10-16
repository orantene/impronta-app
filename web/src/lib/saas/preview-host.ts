/**
 * Vercel preview hosts for the Tulala project count as the platform `app` host
 * (same as app.tulala.digital), so QA can open a branch preview directly.
 *
 * Security: this applies ONLY when `VERCEL_ENV === "preview"`. A production
 * build never accepts a vercel.app host. The pattern is anchored to the
 * `tulala` project and the `oran-tenes-projects` team scope, one DNS label,
 * so no other project, team or suffix trick matches. Auth cookies on these
 * hosts stay host-only (`cookieDomainForHost` returns undefined), because
 * `vercel.app` is a public suffix.
 */
import type { HostContext } from "./host-context";

/** `tulala-<hash>-oran-tenes-projects.vercel.app` and `tulala-git-<branch>-oran-tenes-projects.vercel.app`. */
const PREVIEW_HOST_RE = /^tulala-[a-z0-9-]+-oran-tenes-projects\.vercel\.app$/;

export function previewHostContext(
  hostInput: string,
  vercelEnv: string | undefined,
): Extract<HostContext, { kind: "app" }> | null {
  if (vercelEnv !== "preview") return null;
  const hostname = (hostInput.split(":")[0] ?? "").trim().toLowerCase();
  if (!PREVIEW_HOST_RE.test(hostname)) return null;
  return { kind: "app", tenantId: null, hostname };
}
