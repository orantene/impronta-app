/**
 * Phase 15 / Admin shell v2 — metric card primitive.
 *
 * Numeric-forward tile used on the Home metric strip and anywhere else
 * we need to present a single business number with context (pipeline
 * value, inquiries this week, drafts pending, etc.).
 *
 * Layout
 *   - tiny uppercase label (11px)
 *   - large tabular number (32px)
 *   - optional trend arrow + delta vs. previous period
 *   - optional hint line
 *   - optional href — entire card becomes a link
 *
 * Keeps its own surface rather than wrapping AdminSurfaceCard to avoid
 * double-border stacking on metric grids.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Trend {
  /** Positive number = up, negative = down, 0 = flat. */
  delta: number;
  /** Display label, e.g. "vs last week" or "+$12k". */
  label?: string;
  /** Forces colour interpretation when "up" is bad (e.g. response time). */
  invert?: boolean;
}

interface BaseProps {
  label: string;
  /** Pre-formatted primary number/string. The component does no i18n. */
  value: ReactNode;
  hint?: ReactNode;
  trend?: Trend;
  icon?: ReactNode;
  className?: string;
}

interface StaticProps extends BaseProps {
  href?: undefined;
}

interface LinkProps extends BaseProps {
  href: string;
  external?: boolean;
}

const SHELL =
  "flex min-h-[112px] flex-col justify-between rounded-2xl border border-border/60 bg-card/50 px-4 py-4 shadow-sm transition-[border-color,box-shadow,background-color] duration-200";

const INTERACTIVE =
  "hover:border-[var(--impronta-gold-border)]/55 hover:bg-[var(--impronta-gold)]/[0.03] hover:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2";

export function AdminMetricCard(props: StaticProps | LinkProps) {
  const { label, value, hint, trend, icon, className } = props;
  const isClickable = "href" in props && !!props.href;
  const cardClass = cn(SHELL, isClickable && INTERACTIVE, className);

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        {icon ? (
          <span className="text-muted-foreground/80">{icon}</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[32px] font-semibold tabular-nums leading-none tracking-tight text-foreground">
          {value}
        </p>
        {trend ? <TrendRow trend={trend} /> : null}
        {hint ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </>
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
          {body}
        </a>
      );
    }
    return (
      <Link href={href} className={cardClass}>
        {body}
      </Link>
    );
  }

  return <div className={cardClass}>{body}</div>;
}

function TrendRow({ trend }: { trend: Trend }) {
  const { delta, label, invert } = trend;
  const up = delta > 0;
  const down = delta < 0;
  // "good" = green. If invert, "up" is bad (e.g. response time trending up).
  const good = invert ? down : up;
  const bad = invert ? up : down;
  const colorClass = good
    ? "text-emerald-400"
    : bad
      ? "text-rose-400"
      : "text-muted-foreground";
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const displayDelta =
    label ??
    (delta === 0
      ? "flat"
      : `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}`);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", colorClass)}>
      <Icon className="size-3.5" aria-hidden />
      {displayDelta}
    </span>
  );
}
