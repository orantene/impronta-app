/**
 * info-tip.tsx: a small (i) that explains a line in one sentence (TUL-1192).
 * CSS only (hover and keyboard focus), so it stays a server component and
 * adds no JS. The text is also the accessible name of the button.
 */
export function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <span className="group/tip relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`${label}: ${text}`}
        className="relative inline-flex h-5 w-5 items-center justify-center rounded-full before:absolute before:-inset-3 before:content-[''] text-[0.6875rem] font-semibold leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ border: "1px solid currentColor", opacity: 0.7 }}
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-52 -translate-x-1/2 rounded-lg px-3 py-2 text-left text-[0.75rem] font-normal leading-[1.4] group-hover/tip:block group-focus-within/tip:block"
        style={{ background: "var(--plt-ink)", color: "var(--plt-bg)" }}
      >
        {text}
      </span>
    </span>
  );
}
