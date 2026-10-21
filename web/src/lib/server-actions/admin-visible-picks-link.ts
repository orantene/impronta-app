"use server";

/**
 * TUL-1687 / TUL-1716: should Settings show the link to "Who stays visible"
 * (/admin/settings/visible-picks)? The decision lives in `@/lib/service-hub/load-visible-picks-link`
 * (flag, then the session's workspace, then `agency.roster.edit`; read only, never writes an audit row).
 *
 * TUL-1744: this exported action takes NO arguments. Its test seam used to be a parameter
 * here, and a "use server" export takes its arguments from the client.
 */
import { loadVisiblePicksLinkWith, type VisiblePicksLinkResult } from "@/lib/service-hub/load-visible-picks-link";

export type { VisiblePicksLinkResult } from "@/lib/service-hub/load-visible-picks-link";

export async function loadVisiblePicksLink(): Promise<VisiblePicksLinkResult> {
  return loadVisiblePicksLinkWith();
}
