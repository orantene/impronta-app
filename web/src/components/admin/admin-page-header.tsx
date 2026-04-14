import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Unified page header for admin list/hub pages. Keeps sidebar chrome separate from body typography.
 * (Talent self-service continues to use {@link TalentPageHeader} from talent-dashboard-primitives.)
 */
export function AdminPageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  right,
  below,
  className,
}: {
  icon?: LucideIcon;
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
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:gap-3 lg:gap-4">
        {Icon ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--impronta-gold)]/15 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/20 lg:h-14 lg:w-14 lg:rounded-3xl">
            <Icon className="size-5 lg:size-6" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="font-display text-base font-semibold tracking-tight text-foreground lg:text-xl">
            {title}
          </h1>
          {description ? (
            <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground lg:text-base lg:leading-relaxed">
              {description}
            </div>
          ) : null}
          {below ? <div className="pt-0.5">{below}</div> : null}
        </div>
      </div>
      {right ? (
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-full sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:pt-1">
          {right}
        </div>
      ) : null}
    </div>
  );
}
