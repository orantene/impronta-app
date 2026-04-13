import {
  startImpersonationAsQaClient,
  startImpersonationAsQaTalent,
} from "@/app/(dashboard)/admin/impersonation/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Briefcase, FlaskConical, UserRound } from "lucide-react";

export function WorkspaceSwitcher({
  label,
  hint,
  talentLabel,
  clientLabel,
  hasTalent,
  hasClient,
  variant = "header",
}: {
  label: string;
  hint: string;
  talentLabel: string;
  clientLabel: string;
  hasTalent: boolean;
  hasClient: boolean;
  /** `header` = compact top bar; `drawer` = full-width mobile sheet */
  variant?: "header" | "drawer";
}) {
  if (!hasTalent && !hasClient) return null;

  const isDrawer = variant === "drawer";

  const buttonClass = cn(
    "gap-2 font-medium transition-all duration-200",
    isDrawer
      ? "h-11 w-full justify-start rounded-2xl border-[var(--impronta-gold-border)]/45 bg-background/70 px-4 text-sm shadow-sm hover:border-[var(--impronta-gold)]/55 hover:bg-[var(--impronta-gold)]/10 hover:shadow-md"
      : "h-9 rounded-full border-0 bg-background/80 px-3.5 text-xs shadow-sm ring-1 ring-[var(--impronta-gold-border)]/35 backdrop-blur-sm hover:bg-[var(--impronta-gold)]/14 hover:ring-[var(--impronta-gold)]/55",
  );

  const iconClass = cn(
    "shrink-0 text-[var(--impronta-gold)]",
    isDrawer ? "size-4" : "size-3.5",
  );

  return (
    <div
      className={cn(
        "border border-[var(--impronta-gold-border)]/40",
        "bg-gradient-to-r from-[var(--impronta-gold)]/[0.09] via-[var(--impronta-surface)] to-[var(--impronta-gold)]/[0.06]",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_2px_14px_-6px_rgba(0,0,0,0.12)]",
        isDrawer
          ? "flex flex-col gap-3 rounded-2xl p-3"
          : "flex flex-row flex-wrap items-center justify-center gap-0 overflow-hidden rounded-full py-1 pl-2.5 pr-1.5 sm:flex-nowrap",
      )}
      role="group"
      aria-label={label}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 text-[var(--impronta-muted)]",
          isDrawer
            ? "border-b border-[var(--impronta-gold-border)]/25 pb-2"
            : "shrink-0 py-0.5 pl-1 pr-2.5",
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-[var(--impronta-gold)]/18 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold-border)]/25",
            isDrawer ? "size-9" : "size-8",
          )}
          aria-hidden
        >
          <FlaskConical className={isDrawer ? "size-4" : "size-3.5"} strokeWidth={2} />
        </span>
        <div className="min-w-0 text-left">
          <p
            className={cn(
              "font-semibold uppercase tracking-[0.14em] text-[var(--impronta-foreground)]",
              isDrawer ? "text-[11px]" : "text-[10px] leading-tight",
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "text-[var(--impronta-muted)]",
              isDrawer ? "mt-0.5 text-xs" : "max-w-[11rem] truncate text-[10px] leading-snug sm:max-w-[14rem]",
            )}
          >
            {hint}
          </p>
        </div>
      </div>

      {!isDrawer ? (
        <span
          className="mx-1 hidden h-7 w-px shrink-0 bg-[var(--impronta-gold-border)]/35 sm:block"
          aria-hidden
        />
      ) : null}

      <div
        className={cn(
          "flex min-w-0",
          isDrawer ? "flex-col gap-2" : "flex flex-1 flex-wrap items-center justify-center gap-1.5 py-0.5 sm:flex-nowrap",
        )}
      >
        {hasTalent ? (
          <form action={startImpersonationAsQaTalent} className={cn(isDrawer ? "w-full" : "min-w-0")}>
            <Button type="submit" variant="outline" size="sm" className={buttonClass}>
              <UserRound className={iconClass} aria-hidden />
              {talentLabel}
            </Button>
          </form>
        ) : null}
        {hasClient ? (
          <form action={startImpersonationAsQaClient} className={cn(isDrawer ? "w-full" : "min-w-0")}>
            <Button type="submit" variant="outline" size="sm" className={buttonClass}>
              <Briefcase className={iconClass} aria-hidden />
              {clientLabel}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
