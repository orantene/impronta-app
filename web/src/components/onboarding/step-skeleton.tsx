/**
 * TUL-760: first-paint skeleton for the onboarding flow (/start, /onboarding/role)
 * and the setup step's prefill wait. Mirrors the step-1 layout (progress bar,
 * heading, three option cards, primary button) at 390px and desktop so the page
 * never shows a bare "…" while data loads. Server-safe: no hooks.
 */
export function OnboardingStepSkeleton({ label = "Loading" }: { label?: string }) {
  const bar = { background: "var(--tl-stone-soft)" } as const;
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      data-testid="onb-step-skeleton"
      className="mx-auto w-full max-w-[560px] animate-pulse px-4 py-6 sm:px-6"
    >
      <span className="sr-only">{label}</span>
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1.5 flex-1 rounded-full" style={bar} />
        ))}
      </div>
      <div className="mt-8 h-7 w-3/4 rounded-lg" style={bar} aria-hidden />
      <div className="mt-3 h-4 w-1/2 rounded-md" style={bar} aria-hidden />
      <div className="mt-8 space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[76px] w-full rounded-[20px]" style={bar} />
        ))}
      </div>
      <div className="mt-8 h-12 w-full rounded-full sm:w-48" style={bar} aria-hidden />
    </div>
  );
}
