/**
 * Light loading skeleton for `/t/<code>`.
 *
 * The talent profile was rebuilt on the light tulala.digital design system
 * (LightProfileLayout, `--plt-*` tokens). The previous skeleton used the
 * retired dark Impronta palette (`--impronta-black`), which flashed solid
 * black for a beat before the light page rendered. This mirrors the light
 * surface so the transition is seamless.
 *
 * `data-platform-surface="marketing"` brings the `--plt-*` alias layer into
 * scope (defined under that selector in globals.css). Neutral blocks only —
 * no brand marks — so it stays safe on white-label agency hosts too.
 */
function Block({ className, bordered }: { className?: string; bordered?: boolean }) {
  return (
    <div
      className={`animate-pulse ${bordered ? "border" : ""} ${className ?? ""}`}
      style={{ background: "var(--plt-bg-deep)", borderColor: "var(--plt-hairline)" }}
    />
  );
}

export default function PublicProfileLoading() {
  return (
    <div
      data-platform-surface="marketing"
      className="flex min-h-screen flex-col"
      style={{ background: "var(--plt-bg)", color: "var(--plt-ink)" }}
    >
      {/* Header bar placeholder — matches the sticky marketing chrome height. */}
      <div
        className="sticky top-0 z-50 h-16 w-full border-b sm:h-[72px]"
        style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg)" }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Block className="h-5 w-28 rounded" />
          <div className="hidden items-center gap-6 md:flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Block key={i} className="h-3 w-16 rounded" />
            ))}
          </div>
          <Block className="h-8 w-24 rounded-full" />
        </div>
      </div>

      <main className="flex-1">
        {/* Cover */}
        <Block className="h-[38vh] min-h-[260px] w-full" />

        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          {/* Identity header — overlaps the cover, mirrors ProfileHeader. */}
          <div className="-mt-16 flex flex-col gap-6 sm:flex-row sm:items-end">
            <Block
              bordered
              className="h-40 w-28 shrink-0 rounded-[var(--plt-radius-lg,12px)]"
            />
            <div className="flex-1 space-y-3 pt-2">
              <Block className="h-3 w-24 rounded" />
              <Block className="h-12 w-3/4 max-w-md rounded" />
              <Block className="h-4 w-full max-w-lg rounded" />
            </div>
          </div>

          {/* Divider */}
          <div className="mt-10 border-t" style={{ borderColor: "var(--plt-hairline)" }} />

          {/* Portfolio grid */}
          <div className="mt-10 grid grid-cols-2 gap-3 pb-16 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Block key={i} className="aspect-[3/4] rounded-[var(--plt-radius-lg,12px)]" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
