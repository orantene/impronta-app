import { cn } from "@/lib/utils";

export function DocsStepList({
  steps,
  className,
}: {
  steps: Array<{ title: string; detail?: string }>;
  className?: string;
}) {
  return (
    <ol className={cn("space-y-3", className)}>
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-3 rounded-lg border border-border/50 bg-background/30 px-3 py-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--impronta-gold)]/12 text-[11px] font-bold text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/20">
            {i + 1}
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">{step.title}</p>
            {step.detail ? <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
