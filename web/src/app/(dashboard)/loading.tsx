export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-40 animate-pulse rounded bg-muted/50" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-32 animate-pulse rounded-lg border border-border/50 bg-card/60" />
        <div className="h-32 animate-pulse rounded-lg border border-border/50 bg-card/60" />
        <div className="h-32 animate-pulse rounded-lg border border-border/50 bg-card/60" />
      </div>
      <div className="h-56 animate-pulse rounded-lg border border-border/50 bg-card/60" />
      <div className="h-56 animate-pulse rounded-lg border border-border/50 bg-card/60" />
    </div>
  );
}
