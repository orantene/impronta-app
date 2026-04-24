/**
 * Phase 15 / Admin shell v2 — surface card primitive.
 *
 * One container per card. No nested-card wrapping. Replaces the
 * DashboardSectionCard-wraps-inner-container pattern on new admin
 * surfaces. Existing DashboardSectionCard usages stay intact for
 * legacy pages; new Home + future admin pages use this.
 *
 * Three variants
 *   info   — data, no action. Metric tiles, status blocks.
 *   action — contains a primary CTA. Attention banners, guided flows.
 *   object — represents a domain object (talent, inquiry, section).
 *            Whole card is clickable when `href` is set.
 *
 * Accent
 *   `tone` colours the left-border + subtle background wash. Used by
 *   the Home attention strip (tone="attention") and Your site card
 *   when a draft is pending (tone="draft").
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AdminSurfaceCardVariant = "info" | "action" | "object";
export type AdminSurfaceCardTone =
  | "neutral"
  | "draft"
  | "live"
  | "attention"
  | "pending";

const BASE_CLASSES =
  "rounded-2xl border border-border/60 bg-card/50 shadow-sm transition-[border-color,box-shadow,background-color] duration-200";

const INTERACTIVE_CLASSES =
  "hover:border-[var(--impronta-gold-border)]/55 hover:bg-[var(--impronta-gold)]/[0.03] hover:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const TONE_CLASSES: Record<AdminSurfaceCardTone, string> = {
  neutral: "",
  draft: "border-l-[3px] border-l-foreground/40",
  live: "border-l-[3px] border-l-foreground/60",
  attention: "border-l-[3px] border-l-foreground bg-foreground/[0.02]",
  pending: "border-l-[3px] border-l-foreground/30",
};

interface BaseProps {
  variant?: AdminSurfaceCardVariant;
  tone?: AdminSurfaceCardTone;
  className?: string;
  children: ReactNode;
}

interface StaticProps extends BaseProps {
  href?: undefined;
}

interface LinkProps extends BaseProps {
  /** When set on variant="object", the whole card becomes a link. */
  href: string;
  /** If the href is external or should open a new tab. */
  external?: boolean;
}

export function AdminSurfaceCard(props: StaticProps | LinkProps) {
  const {
    variant = "info",
    tone = "neutral",
    className,
    children,
  } = props;
  const isClickable = "href" in props && !!props.href && variant === "object";
  const cardClass = cn(
    BASE_CLASSES,
    TONE_CLASSES[tone],
    isClickable && INTERACTIVE_CLASSES,
    isClickable && "block cursor-pointer",
    className,
  );

  if (isClickable) {
    const { href, external } = props;
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className={cardClass}
        >
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={cardClass}>
        {children}
      </Link>
    );
  }

  return <div className={cardClass}>{children}</div>;
}

export function AdminSurfaceCardHeader({
  title,
  description,
  right,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  if (!title && !description && !right) return null;
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border/50 px-5 py-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {title ? (
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h3>
        ) : null}
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function AdminSurfaceCardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
