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
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:gap-3.5">
        {Icon ? (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--impronta-gold)]/40 bg-[var(--impronta-gold)]/[0.12] text-[var(--impronta-gold)] shadow-[inset_0_0_0_1px_rgba(201,162,39,0.25)]">
            <Icon className="size-5" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? (
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="font-display text-[22px] font-semibold leading-[1.2] tracking-[-0.01em] text-foreground">
            {title}
          </h1>
          {description ? (
            <div className="max-w-[560px] text-[13.5px] leading-[1.55] text-muted-foreground">
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
