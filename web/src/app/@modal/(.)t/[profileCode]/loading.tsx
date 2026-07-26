// Instant-open shell for the intercepted profile modal.
//
// The profile render is force-dynamic (a full server pass per open), so
// without this boundary the click did NOTHING for 1–3s and the overlay
// popped in late — reading as "slow site", not "app". This skeleton mounts
// the overlay + panel the moment the navigation starts; the streamed
// profile replaces it in place. Styling mirrors ProfileModalShell exactly
// (same inset, radius, shadow) so the swap is seamless.
export default function InterceptedProfileModalLoading() {
  return (
    <div className="fixed inset-0 z-[120]" aria-busy="true">
      {/* Scrim — same as Dialog.Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" />
      {/* Panel — same geometry as Dialog.Content */}
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-background motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.985] motion-safe:duration-300 sm:inset-x-1/2 sm:inset-y-4 sm:w-[min(1200px,calc(100vw-3rem))] sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-[0_40px_120px_-24px_rgba(0,0,0,0.7)]">
        <div className="grid flex-1 gap-8 p-6 sm:grid-cols-[minmax(0,420px)_1fr] sm:p-12">
          {/* Portrait shimmer */}
          <div className="aspect-[4/5] w-full animate-pulse rounded-xl bg-foreground/[0.07]" />
          {/* Text shimmer column */}
          <div className="flex flex-col gap-4 pt-2 sm:pt-10">
            <div className="h-3 w-40 animate-pulse rounded bg-foreground/[0.07]" />
            <div className="h-12 w-64 animate-pulse rounded bg-foreground/[0.09]" />
            <div className="mt-2 flex gap-2">
              <div className="h-7 w-28 animate-pulse rounded-full bg-foreground/[0.07]" />
              <div className="h-7 w-24 animate-pulse rounded-full bg-foreground/[0.07]" />
            </div>
            <div className="mt-4 flex gap-3">
              <div className="h-10 w-40 animate-pulse rounded-full bg-foreground/[0.09]" />
              <div className="h-10 w-36 animate-pulse rounded-full bg-foreground/[0.07]" />
            </div>
            <div className="mt-6 h-3 w-full max-w-md animate-pulse rounded bg-foreground/[0.06]" />
            <div className="h-3 w-4/5 max-w-md animate-pulse rounded bg-foreground/[0.06]" />
          </div>
        </div>
      </div>
    </div>
  );
}
