/**
 * Clock-free Today placeholder: identical on the server, the dynamic() loading
 * fallback, and the first client render (React #418 / TUL-303).
 *
 * TUL-525: fill the phone viewport so a barber never stares at a blank
 * light-blue screen while Today hydrates.
 */
export function TodaySkeleton() {
  return (
    <div
      className="min-h-[70vh] space-y-4 bg-admin-surface p-1"
      aria-busy="true"
      data-testid="today-skeleton"
    >
      <div className="h-8 w-56 max-w-[70%] animate-pulse rounded-lg bg-black/[0.08]" />
      <div className="h-4 w-40 max-w-[50%] animate-pulse rounded bg-black/[0.06]" />
      <div className="h-28 animate-pulse rounded-2xl bg-black/[0.06]" />
      <div className="h-44 animate-pulse rounded-2xl bg-black/[0.06]" />
      <div className="h-36 animate-pulse rounded-2xl bg-black/[0.05]" />
      <div className="h-24 animate-pulse rounded-2xl bg-black/[0.05]" />
    </div>
  );
}
