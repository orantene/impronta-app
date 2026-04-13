import { endImpersonationToAdmin } from "@/app/(dashboard)/admin/impersonation/actions";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner({
  effectiveName,
  roleLabel,
  readOnlyLine,
  v1ReadOnlyQaLine,
  returnCta,
}: {
  effectiveName: string;
  roleLabel: string;
  readOnlyLine: string;
  v1ReadOnlyQaLine: string;
  returnCta: string;
}) {
  return (
    <div
      role="region"
      aria-label="Impersonation notice"
      className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-50"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:max-w-none">
        <div className="min-w-0 space-y-1 text-sm leading-snug">
          <p className="font-medium text-amber-950/95 dark:text-amber-50">{v1ReadOnlyQaLine}</p>
          <p>
            <span className="font-semibold">{readOnlyLine}</span>{" "}
            <span className="opacity-90">{effectiveName}</span>{" "}
            <span className="opacity-75">({roleLabel})</span>
          </p>
        </div>
        <form action={endImpersonationToAdmin} className="shrink-0">
          <Button
            type="submit"
            size="sm"
            className="h-9 rounded-lg bg-amber-900 text-amber-50 hover:bg-amber-950 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
          >
            {returnCta}
          </Button>
        </form>
      </div>
    </div>
  );
}
