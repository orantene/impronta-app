/**
 * Clock-free Today placeholder: identical on the server, the dynamic() loading
 * fallback, and the first client render (React #418 / TUL-303).
 * Visible black/alpha pulses only — never theme CSS vars (TUL-536 phone Hoy).
 */
export function TodaySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" data-testid="today-skeleton">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-black/[0.06]" />
      <div className="h-4 w-40 animate-pulse rounded bg-black/[0.05]" />
      <div className="h-28 animate-pulse rounded-2xl bg-black/[0.05]" />
      <div className="h-44 animate-pulse rounded-2xl bg-black/[0.05]" />
      <div className="h-36 animate-pulse rounded-2xl bg-black/[0.05]" />
    </div>
  );
}
