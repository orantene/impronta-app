import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export default function AdminSegmentLoading() {
  return (
    <div className={cn(ADMIN_PAGE_STACK, "animate-in fade-in duration-200")}>
      <div className="space-y-2">
        <div className={cn("h-3 w-24 rounded-md bg-muted/50")} />
        <div className={cn("h-8 w-64 max-w-full rounded-lg bg-muted/40")} />
        <div className={cn("h-4 w-96 max-w-full rounded-md bg-muted/35")} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={cn("h-40 rounded-2xl border border-border/40 bg-muted/20")} />
        <div className={cn("h-40 rounded-2xl border border-border/40 bg-muted/20")} />
      </div>
      <div className={cn("h-56 rounded-2xl border border-border/40 bg-muted/15")} />
    </div>
  );
}
