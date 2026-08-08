// Instant-open shell for the intercepted profile modal.
//
// The profile render is force-dynamic (a full server pass per open), so
// without this boundary the click did NOTHING for 1–3s and the overlay
// popped in late — reading as "slow site", not "app". This skeleton mounts
// the overlay + panel the moment the navigation starts; the streamed
// profile replaces it in place. Styling mirrors ProfileModalShell exactly
// (same inset, radius, shadow) so the swap is seamless.
//
// LIGHT surface: the panel uses the `--plt-*` marketing tokens (via
// `data-platform-surface="marketing"`), NOT `bg-background` — the body class
// `site-theme-dark` is the failsafe default on platform hosts, which painted
// the old skeleton solid black with barely-visible shimmer blocks.
function Block({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse ${className ?? ""}`}
      style={{ background: "var(--plt-bg-deep)" }}
    />
  );
}

export default function InterceptedProfileModalLoading() {
  return (
    <div className="fixed inset-0 z-[120]" aria-busy="true">
      {/* Scrim — same as Dialog.Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" />
      {/* Panel — same geometry as Dialog.Content */}
      <div
        data-platform-surface="marketing"
        className="fixed inset-0 flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.985] motion-safe:duration-300 sm:inset-x-1/2 sm:inset-y-4 sm:w-[min(1200px,calc(100vw-3rem))] sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:shadow-[0_40px_120px_-24px_rgba(0,0,0,0.45)]"
        style={{
          background: "var(--plt-bg)",
          borderColor: "var(--plt-hairline)",
          color: "var(--plt-ink)",
        }}
      >
        <div className="grid flex-1 gap-8 p-6 sm:grid-cols-[minmax(0,420px)_1fr] sm:p-12">
          {/* Portrait shimmer */}
          <Block className="aspect-[4/5] w-full rounded-xl" />
          {/* Text shimmer column */}
          <div className="flex flex-col gap-4 pt-2 sm:pt-10">
            <Block className="h-3 w-40 rounded" />
            <Block className="h-12 w-64 rounded" />
            <div className="mt-2 flex gap-2">
              <Block className="h-7 w-28 rounded-full" />
              <Block className="h-7 w-24 rounded-full" />
            </div>
            <div className="mt-4 flex gap-3">
              <Block className="h-10 w-40 rounded-full" />
              <Block className="h-10 w-36 rounded-full" />
            </div>
            <Block className="mt-6 h-3 w-full max-w-md rounded" />
            <Block className="h-3 w-4/5 max-w-md rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
