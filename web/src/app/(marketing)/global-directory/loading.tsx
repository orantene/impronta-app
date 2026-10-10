/**
 * Soft-nav skeleton for /directory (rewritten to /global-directory).
 * Keeps the marketing surface occupied while the heavy directory RSC loads.
 */

function Block({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md ${className ?? ""}`}
      style={{ background: "var(--plt-bg-deep, #ece8e1)" }}
    />
  );
}

export default function GlobalDirectoryLoading() {
  return (
    <div
      data-testid="global-directory-loading"
      data-platform-surface="marketing"
      aria-busy="true"
      className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8"
      style={{ background: "var(--plt-bg, #f7f4ee)", color: "var(--plt-ink, #171411)" }}
    >
      <Block className="h-3 w-24" />
      <Block className="mt-4 h-9 w-72 max-w-full" />
      <Block className="mt-3 h-4 w-full max-w-xl" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Block key={i} className="aspect-[4/5] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
