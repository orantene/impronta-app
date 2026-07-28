import Link from "next/link";

/**
 * notFound() inside the INTERCEPTED profile modal.
 *
 * TalentProfileView calls notFound() on several live paths (hidden profile,
 * over the free-plan display cap, deleted). Without this boundary the throw
 * escalated to the ROOT not-found page — destroying the directory the
 * visitor was browsing because one stale card 404'd. Render the message
 * inside the overlay geometry instead; the directory stays alive underneath.
 */
export default function InterceptedProfileModalNotFound() {
  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background p-8 text-center sm:inset-x-1/2 sm:inset-y-4 sm:w-[min(560px,calc(100vw-3rem))] sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-[0_40px_120px_-24px_rgba(0,0,0,0.7)]">
        <p className="font-display text-2xl">This profile isn&apos;t available</p>
        <p className="max-w-sm text-sm text-foreground/60">
          It may have been removed or made private. The rest of the roster is
          still right behind this window.
        </p>
        {/* Full-page Link (not router.back()) — a server component can't call
            the router, and a hard nav to the listing always recovers. */}
        <Link
          href="/directory"
          className="mt-2 inline-flex h-10 items-center rounded-full border border-border px-5 text-[12px] font-semibold uppercase tracking-[0.16em] transition-colors hover:border-foreground/40"
        >
          Back to directory
        </Link>
      </div>
    </div>
  );
}
