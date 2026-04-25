import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page heading for admin pages — title, optional description, and a
 * right-aligned action cluster.
 *
 * The previous design had a 44px rounded icon-in-a-box next to the title;
 * removed in the audit refactor — a 22px serif title is its own visual
 * identity and the icon-box added decorative noise without information.
 *
 * The `icon` prop is accepted but ignored so existing call sites compile
 * unchanged. It will be removed once every page is migrated.
 *
 * Talent self-service continues to use {@link TalentPageHeader} from
 * talent-dashboard-primitives.
 */
export function AdminPageHeader({
  /** Deprecated — kept for compat. The icon used to render in a rounded box on the left. */
  icon: _icon,
  eyebrow,
  title,
  description,
  right,
  below,
  className,
}: {
  icon?: unknown;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions (stacks below title on very small screens). */
  right?: ReactNode;
  /** Optional strip under title (badges, meta). */
  below?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-[rgba(24,24,27,0.08)] pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="font-display text-[22px] font-semibold leading-[1.2] tracking-[-0.01em] text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="max-w-[640px] text-[13px] leading-[1.55] text-muted-foreground">
            {description}
          </p>
        ) : null}
        {below ? <div className="pt-1">{below}</div> : null}
      </div>
      {right ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {right}
        </div>
      ) : null}
    </header>
  );
}
