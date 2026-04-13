import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RelationshipStripItem = {
  key: string;
  /** Short label shown on the badge, e.g. "Client" */
  label: string;
  /** Visible value */
  text: string;
  href?: string | null;
  empty?: boolean;
};

function RelationshipStripNode({ item }: { item: RelationshipStripItem }) {
  const display = item.empty ? "—" : item.text;
  const body = (
    <span className="inline-flex max-w-[min(220px,72vw)] flex-col gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</span>
      <span className="truncate text-sm font-medium leading-tight text-foreground">{display}</span>
    </span>
  );
  if (item.href && !item.empty) {
    return (
      <Link href={item.href} scroll={false} className="min-w-0">
        <Badge
          variant="secondary"
          className="h-auto min-h-7 max-w-full cursor-pointer border border-border/45 px-2.5 py-1 font-normal shadow-sm hover:border-[var(--impronta-gold)]/45"
        >
          {body}
        </Badge>
      </Link>
    );
  }
  return (
    <Badge
      variant="outline"
      className="h-auto min-h-7 max-w-full border-dashed px-2.5 py-1 font-normal text-muted-foreground"
    >
      {body}
    </Badge>
  );
}

/**
 * Compact CRM chain: Client → Account → Contact → … with flow separators.
 * Vertical on narrow viewports, horizontal with chevrons from `sm`.
 */
export function AdminRelationshipContextStrip({
  items,
  footnote,
}: {
  items: RelationshipStripItem[];
  footnote?: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className="rounded-lg border border-border/40 bg-muted/15 px-3 py-2.5"
      aria-label="Record relationships"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Commercial chain</span>
        <span className="hidden text-[10px] text-muted-foreground/80 sm:inline">Upstream → downstream</span>
      </div>
      <div className="flex flex-col items-stretch gap-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1 sm:gap-y-2">
        {items.map((item, i) => (
          <Fragment key={item.key}>
            {i > 0 ? (
              <div
                className="flex justify-center py-1 text-muted-foreground/55 sm:hidden"
                aria-hidden
              >
                <ChevronDown className="size-3.5" strokeWidth={2.25} />
              </div>
            ) : null}
            {i > 0 ? (
              <ChevronRight
                className="mx-0.5 hidden size-3.5 shrink-0 text-muted-foreground/45 sm:inline"
                strokeWidth={2}
                aria-hidden
              />
            ) : null}
            <div className="flex justify-center sm:inline-flex sm:max-w-[min(100%,280px)]">
              <RelationshipStripNode item={item} />
            </div>
          </Fragment>
        ))}
      </div>
      {footnote ? (
        <p className="mt-2 border-t border-border/35 pt-2 text-[11px] text-muted-foreground">{footnote}</p>
      ) : null}
    </div>
  );
}

export type EntityLinkBadge = { key: string; label: string; href: string };

/** Small navigation chips for cross-entity jumps (inquiry ↔ booking, account lists, etc.). */
export function AdminEntityLinkBadges({ badges }: { badges: EntityLinkBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Related records">
      {badges.map((b) => (
        <Link key={b.key} href={b.href} scroll={false}>
          <Badge
            variant="outline"
            className="h-6 cursor-pointer border-[var(--impronta-gold)]/35 px-2 text-[11px] font-medium text-[var(--impronta-gold)] hover:bg-muted/40"
          >
            {b.label}
          </Badge>
        </Link>
      ))}
    </div>
  );
}

export type TrailItem = { label: string; href?: string };

/** Compact parent trail: logical hierarchy without replacing the main sidebar. */
export function AdminParentTrail({ items }: { items: TrailItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Parent context" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <ChevronRight className="size-3 shrink-0 opacity-50" aria-hidden /> : null}
          {item.href ? (
            <Link href={item.href} scroll={false} className="hover:text-[var(--impronta-gold)] hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground/80">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export type RibbonNode = {
  key: string;
  title: string;
  subtitle?: string | null;
  href?: string | null;
  empty?: boolean;
};

/**
 * Visual CRM chain for detail pages — shows how this record sits between login user,
 * billing account, contact, request, and job.
 */
export function AdminEntityRibbon({ nodes, variant = "default" }: { nodes: RibbonNode[]; variant?: "default" | "compact" }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5",
        variant === "compact" && "py-2",
      )}
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Relationships</p>
      <div className="flex flex-wrap items-stretch gap-1 sm:gap-0">
        {nodes.map((node, i) => (
          <div key={node.key} className="flex min-w-0 items-center">
            {i > 0 ? (
              <ChevronRight className="mx-1 hidden size-4 shrink-0 text-muted-foreground/50 sm:inline" aria-hidden />
            ) : null}
            <div
              className={cn(
                "min-w-0 rounded-lg border border-border/40 bg-background/80 px-2.5 py-1.5 sm:px-3",
                node.empty && "border-dashed bg-muted/30",
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{node.title}</p>
              {node.href && !node.empty ? (
                <Link
                  href={node.href}
                  scroll={false}
                  className="mt-0.5 block truncate text-sm font-medium text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                >
                  {node.subtitle ?? "Open"}
                </Link>
              ) : (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{node.empty ? "— Not linked" : (node.subtitle ?? "—")}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** “What this is / what you can do” strip under the page title. */
export function AdminContextHeader({
  entityLabel,
  summary,
  primaryHint,
  actions,
}: {
  entityLabel: string;
  summary: string;
  primaryHint?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/45 bg-card/60 px-4 py-3 text-sm shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{entityLabel}</p>
          <p className="mt-1 text-foreground/90">{summary}</p>
          {primaryHint ? <p className="mt-2 text-xs text-muted-foreground">{primaryHint}</p> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 lg:justify-end">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Reserved area — calendar, payments, invoices, and reporting can anchor here later (Phase 18). */
export function AdminFutureWorkspaceSlot({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border/40 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground",
        className,
      )}
    >
      Space reserved for upcoming operational tools (calendar, availability, payments, contracts, reporting).
    </div>
  );
}
