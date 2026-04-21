/**
 * Phase 5/6 M6 — hub directory discovery-state inventory.
 *
 * Dead code until wired in a follow-up slice. Catalogs the five render
 * paths the hub directory will need when the page ships:
 *
 *   - loading           — first paint / SSR while the hub page loads
 *   - empty_no_approved — hub has no approved roster rows yet
 *   - locked_signin     — hub is gated behind auth (future product choice)
 *   - success           — hand off to the grid (renders nothing here)
 *   - error             — hub load failed; offer retry via {children}
 *
 * Each named component is a pure server component that takes plain
 * strings as props so callers provide translations from their own
 * `createTranslator`. The dispatcher `DirectoryDiscoveryStatePanel`
 * is a thin switch; callers can also render the individual components
 * directly.
 *
 * See docs/saas/phase-5-6/m6-scope-pre-m0.md §2C.
 */

import { LockKeyhole, Search, TriangleAlert, Users } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export type DirectoryDiscoveryStatus =
  | "loading"
  | "empty_no_approved"
  | "locked_signin"
  | "success"
  | "error";

const PLACEHOLDER_COUNT = 6;

export function DirectoryDiscoveryLoading({
  "aria-label": ariaLabel,
}: {
  "aria-label"?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
    >
      {Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]"
        >
          <Skeleton className="aspect-[3/4] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DirectoryDiscoveryEmptyNoApproved({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <EmptyState
      icon={Users}
      title={title}
      description={description}
      className="border-[var(--impronta-gold-border)] bg-black/20 py-14"
    >
      {children}
    </EmptyState>
  );
}

export function DirectoryDiscoveryLockedSignin({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <EmptyState
      icon={LockKeyhole}
      title={title}
      description={description}
      className="border-[var(--impronta-gold-border)] bg-black/20 py-14"
    >
      {children}
    </EmptyState>
  );
}

export function DirectoryDiscoveryError({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title={title}
      description={description}
      className="border-destructive/40 bg-destructive/5 py-14"
    >
      {children}
    </EmptyState>
  );
}

export type DirectoryDiscoveryStatePanelProps =
  | { status: "success" }
  | {
      status: "loading";
      loading?: { "aria-label"?: string };
    }
  | {
      status: "empty_no_approved";
      emptyNoApproved: {
        title: string;
        description?: string;
        children?: React.ReactNode;
      };
    }
  | {
      status: "locked_signin";
      lockedSignin: {
        title: string;
        description?: string;
        children?: React.ReactNode;
      };
    }
  | {
      status: "error";
      error: {
        title: string;
        description?: string;
        children?: React.ReactNode;
      };
    };

/**
 * Dispatcher. Returns `null` on the success branch so callers can mount
 * their grid next to this component without a wrapper/branch. Callers
 * that need the "nothing matched current filters" empty state should
 * keep using `<EmptyState icon={Search} …/>` in the grid — that's a
 * distinct post-query state from "hub has no approved talent at all".
 */
export function DirectoryDiscoveryStatePanel(
  props: DirectoryDiscoveryStatePanelProps,
) {
  if (props.status === "success") return null;
  if (props.status === "loading") {
    return (
      <DirectoryDiscoveryLoading aria-label={props.loading?.["aria-label"]} />
    );
  }
  if (props.status === "empty_no_approved") {
    return <DirectoryDiscoveryEmptyNoApproved {...props.emptyNoApproved} />;
  }
  if (props.status === "locked_signin") {
    return <DirectoryDiscoveryLockedSignin {...props.lockedSignin} />;
  }
  return <DirectoryDiscoveryError {...props.error} />;
}

/**
 * Re-exported for call sites that still want the "no results for the
 * current filters" look (post-query empty) alongside this module.
 * Intentionally NOT one of the five hub-discovery states — kept here so
 * a single import covers both shapes.
 */
export const DirectoryDiscoverySearchIcon = Search;
