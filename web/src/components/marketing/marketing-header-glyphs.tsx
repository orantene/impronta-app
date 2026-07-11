/** Small presentational SVG glyphs for the marketing header. Extracted from
 *  header.tsx to keep that file under the module line budget. */

export function MenuGlyph() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="none" aria-hidden>
      <path d="M1 1H17M1 11H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CloseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronGlyph() {
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" fill="none" aria-hidden>
      <path
        d="M1 1L7 6L1 11"
        stroke="var(--plt-muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronDownGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="7"
      viewBox="0 0 10 7"
      fill="none"
      aria-hidden
      className="transition-transform duration-200"
      style={{ transform: open ? "rotate(180deg)" : "none", opacity: 0.7 }}
    >
      <path
        d="M1 1.5L5 5.5L9 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowTiny() {
  return (
    <svg
      aria-hidden
      width="11"
      height="8"
      viewBox="0 0 14 10"
      fill="none"
      className="-translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
      style={{ color: "var(--plt-forest)" }}
    >
      <path
        d="M1 5H13M13 5L9 1M13 5L9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
