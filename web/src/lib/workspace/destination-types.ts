/**
 * destination-types.ts — the TYPE vocabulary of the destination registry.
 *
 * Split out of `destinations.ts` (2026-09-11) when the registry crossed the
 * 800-line budget with the approved navigation's role clauses and children.
 * Types only: every import of this module erases at compile time, so the
 * registry keeps its zero-runtime-import guarantee and so does this file. The
 * two consts a type depends on (`DestinationId`, `DestinationGroup`) are
 * imported back as types, which is a compile-time cycle and nothing more.
 */

import type { AdminShellIconName } from "@/components/admin/shell/internal/primitives/icons";
import type { Plan } from "@/components/admin/shell/internal/state/types";
import type { WorkspaceType } from "@/lib/saas/workspace-type";
import type { DestinationGroup, DestinationId } from "./destinations";

/** How the destination renders: a PageRouter case, or a real Next.js route. */
export type DestinationRender = "spa" | "canonical";

/** A destination that replaces the admin chrome entirely rather than sitting in it. */
export type DestinationChrome = "pos";

/**
 * The shape of a workspace, derived in `nav-context.ts` from the tenant's
 * industry preset and team size. Not a stored column.
 */
export type WorkspacePreset = "cafe" | "solo" | "hybrid";

/**
 * The hat the signed-in person wears. Three rungs off the membership role
 * ladder; `professional` is a fourth, orthogonal hat carried separately on the
 * context because a person can be an owner AND bookable.
 */
export type WorkRole = "owner" | "manager" | "assistant";

/** Booleans that already ride the tenant identity bridge. Never a fresh fetch. */
export type TenantFlag = "takesReservations" | "runsEvents";

/**
 * Everything that can hide a destination. Every clause is AND-ed; an absent
 * clause is not a constraint. Visibility is a NAV decision only — hiding a link
 * and refusing a route are different things, and this registry does the first.
 */
export type DestinationRequires = {
  /** Only this workspace type sees it (`talent` gates the roster-shaped surfaces). */
  readonly workspaceType?: WorkspaceType;
  /** Every flag listed must be true on the context. */
  readonly tenantFlags?: readonly TenantFlag[];
  /** Minimum plan on the `free < website < studio < agency < network` ladder. */
  readonly minPlan?: Plan;
  /** Any-of against the work role. */
  readonly roles?: readonly WorkRole[];
  /** The person must be bookable on this roster (the professional hat). */
  readonly professional?: boolean;
  /** The person must be able to manage billing. */
  readonly billing?: boolean;
  /** The workspace must have the point of sale switched on. */
  readonly posEnabled?: boolean;
};

/**
 * A child link under a destination's rail row.
 *
 * EVERY SUB-VIEW NAMES A ROUTE THAT EXISTS TODAY. `rail-visible-pages.static
 * .test.ts` walks the app directory, through `subViewHref` itself, and fails on
 * one that points at nothing: a child drawn under the row an operator just
 * opened must not be a 404.
 */
export type DestinationSubView = {
  readonly id: string;
  readonly label: string;
  /** Segment under the owner's live route. `""` is the owner's landing view. */
  readonly segment: string;
  /**
   * The child hangs off ANOTHER destination's live route. Events → Orders is
   * the case: the door and the ticket orders it checks in are one job.
   */
  readonly under?: DestinationId;
  /** The child's own path under the admin base, for a child that lives under
   *  no destination's route. Wins over `under`. People needs it: the surface
   *  moved to /admin/people, its three queues stayed under /admin/roster. */
  readonly adminPath?: string;
  /** Query appended to the href, without the "?" (e.g. `compose=new`). */
  readonly query?: string;
  readonly requires?: DestinationRequires;
};

export type Destination = {
  readonly id: DestinationId;
  readonly group: DestinationGroup;
  /** Canonical URL segment. `""` is the admin root (Overview). */
  readonly segment: string;
  /** Legacy segments that still resolve here. Every live URL keeps working. */
  readonly aliases: readonly string[];
  readonly render: DestinationRender;
  /** Set when the destination takes over the screen instead of sitting in the shell. */
  readonly chrome?: DestinationChrome;
  readonly icon: AdminShellIconName;
  /** English label. The preset overrides below win when one applies. */
  readonly label: string;
  readonly presetLabels?: Partial<Record<WorkspacePreset, string>>;
  /** Shorter label for a mobile tab, where the rail label does not fit. */
  readonly shortLabel?: string;
  /** Does the surface exist at all today. */
  readonly built: boolean;
  /** The route that actually renders. See the SEGMENT vs LIVE ROUTE note above. */
  readonly fallbackSegment?: string;
  readonly requires?: DestinationRequires;
  /** Lower sorts earlier in the mobile tab bar. Absent = never a mobile tab. */
  readonly mobilePriority?: number;
  readonly subViews?: readonly DestinationSubView[];
  /** Pinned to the foot of the rail rather than flowing with its group. */
  readonly pinned?: boolean;
  /**
   * Drawn as a CHILD of another destination's row, never as a row of its own.
   * Preparation is a view of Orders and Discounts a view of Catalog on the
   * approved navigation (W36): both keep their route, their page id and their
   * place in the phone's More sheet; only the rail folds them under the row
   * they belong to, and that row lights up while they are open.
   */
  readonly parent?: DestinationId;
};

/**
 * Everything visibility needs, all of it already on the client: the tenant
 * identity bridge carries the workspace type and the two flags, the shell state
 * carries the plan, and `nav-context.ts` derives the preset and the hats.
 */
export type WorkspaceNavContext = {
  readonly workspaceType: WorkspaceType;
  readonly plan: Plan;
  readonly preset: WorkspacePreset;
  readonly role: WorkRole;
  /** The person is bookable on this roster (has a talent profile here). */
  readonly professional: boolean;
  readonly takesReservations: boolean;
  readonly runsEvents: boolean;
  readonly posEnabled: boolean;
  readonly canManageBilling: boolean;
};
