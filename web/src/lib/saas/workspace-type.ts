/**
 * workspace-type.ts — `agencies.workspace_type` → which workspace surfaces exist.
 *
 * TWO KINDS OF WORKSPACE
 * ──────────────────────
 *   "talent"   (default, and what every existing workspace is) — an agency /
 *              studio / network that REPRESENTS talent. Roster is the spine.
 *   "business" — a local business (restaurant, gym, clinic) that wants a site
 *              and books talent as a CLIENT. It represents nobody, so the
 *              surfaces about REPRESENTING people are noise: pitching talent
 *              outward, taking applications to join a roster, publishing to the
 *              directory. It still has people — staff — so the People page
 *              itself stays. Everything else — site builder, inbox, calendar,
 *              clients, media, settings, payments — is identical. A business
 *              workspace is NOT read-only.
 *
 * HIDE, NEVER DELETE
 * ──────────────────
 * Flipping a workspace to "business" hides surfaces. It does not archive,
 * delete, or otherwise touch a single roster row. Flipping back restores the
 * previous experience exactly. Nothing in this module (or anything reading it)
 * may be used to justify a destructive write.
 *
 * FAIL CLOSED MEANS "SHOW EVERYTHING"
 * ───────────────────────────────────
 * Note the direction: for a plan-tier normalizer, the safe fallback is the
 * LEAST-privileged tier. Here it is the opposite. An unrecognised, null, or
 * newly-added `workspace_type` must never make an existing agency's roster
 * vanish, so anything we do not recognise degrades to "talent" — the type that
 * shows every surface.
 *
 * PURITY
 * ──────
 * Zero runtime imports on purpose. This module is read from the client shell
 * (`internal/state/context.tsx`), from a server layout, and from `server-only`
 * route guards. Pulling the `"use client"` fixtures module in here to get the
 * canonical page list would drag a client graph into the server-only guards, so
 * `visibleWorkspacePages` takes the page list as an argument instead and the
 * one caller that owns that list passes it.
 */

import type { WorkspacePage } from "@/components/admin/shell/internal/state/types";

export const WORKSPACE_TYPES = ["talent", "business"] as const;

export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

/** The type every workspace is unless it has explicitly opted out. */
export const DEFAULT_WORKSPACE_TYPE: WorkspaceType = "talent";

const KNOWN_WORKSPACE_TYPES: ReadonlySet<string> = new Set<string>(WORKSPACE_TYPES);

/**
 * Raw `agencies.workspace_type` → the workspace-type union.
 *
 * Fails CLOSED toward "talent" (see the module header): null, "", an unknown
 * string, a number, an object — anything we cannot positively identify as
 * "business" keeps every surface visible. Tolerates whitespace/case so a
 * hand-edited DB row cannot silently hide an agency's roster.
 */
export function normalizeWorkspaceType(raw: unknown): WorkspaceType {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return KNOWN_WORKSPACE_TYPES.has(value)
    ? (value as WorkspaceType)
    : DEFAULT_WORKSPACE_TYPE;
}

/** True when this workspace represents talent, i.e. roster surfaces apply. */
export function rosterEnabled(type: WorkspaceType): boolean {
  return type === "talent";
}

/**
 * Workspace nav pages a "business" workspace does not get.
 *
 * `pitches` is outbound "here is my talent" marketing. It is meaningless
 * without a roster to pitch, and there is no reading of it that applies to a
 * restaurant, so it is hidden and the page is clamped away.
 *
 * `roster` IS NOT HIDDEN, and used to be. It is the live route of the People
 * destination, the row every workspace has: a restaurant has staff, and People
 * is the same set of humans under the name its preset gives them ("Team"). With
 * `roster` on this list the People row was dropped from the rail of every
 * business workspace and the page clamped to Overview, which is a surface with
 * no door rather than a surface that does not apply.
 *
 * WHAT STILL REFUSES A BUSINESS WORKSPACE, AND WHERE. The roster's talent-only
 * sub-routes — /admin/roster/{new,applications,registration,rates} — each call
 * `assertRosterWorkspace`, which 404s when `rosterEnabled` is false. That is a
 * ROUTE gate on the server and it is untouched by this list; the rail agrees
 * with it because those three children carry `requires: { workspaceType:
 * "talent" }` in the destination registry. Hiding a link and refusing a route
 * are different jobs, and this list only ever did the first.
 */
export const BUSINESS_HIDDEN_PAGES: readonly WorkspacePage[] = ["pitches"];

const BUSINESS_HIDDEN_PAGE_SET: ReadonlySet<WorkspacePage> = new Set(BUSINESS_HIDDEN_PAGES);

/** Is `page` reachable in a workspace of this type? */
export function workspacePageVisible(type: WorkspaceType, page: WorkspacePage): boolean {
  if (type !== "business") return true;
  return !BUSINESS_HIDDEN_PAGE_SET.has(page);
}

/**
 * Filter a workspace nav page list down to what this workspace type shows.
 *
 * Order-preserving and non-mutating: "talent" gets `allPages` back verbatim.
 * `allPages` is passed in (rather than imported) so this module stays free of
 * the `"use client"` shell graph — see the module header.
 */
export function visibleWorkspacePages(
  type: WorkspaceType,
  allPages: readonly WorkspacePage[],
): WorkspacePage[] {
  if (type !== "business") return [...allPages];
  return allPages.filter((page) => workspacePageVisible(type, page));
}

/**
 * Direct-URL clamp. A page this workspace type does not have falls back to
 * "overview" — the one page every workspace type always has.
 *
 * PURE AND DETERMINISTIC ON PURPOSE. The admin shell's state init is
 * hydration-sensitive; the server layout and the client provider both run this
 * on the same inputs and must agree, so it may never read a clock, a cookie,
 * `window`, or module-level mutable state.
 */
export function clampWorkspacePage(
  page: WorkspacePage,
  type: WorkspaceType,
): WorkspacePage {
  return workspacePageVisible(type, page) ? page : "overview";
}
