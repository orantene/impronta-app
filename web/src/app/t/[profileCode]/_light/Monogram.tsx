/**
 * Monogram — the cover-less empty state.
 *
 * Renders a tasteful, letter-free tonal cover band (NOT initials, NOT a
 * placeholder box, NO emoji). A soft diagonal gradient drawn from the profile
 * theme tokens with a quiet radial highlight and a faint editorial grain rule,
 * so a profile without a hero image still reads as intentional and premium.
 * --plt tokens only.
 */

type MonogramProps = {
  name: string;
  /** Optional extra CSS class on the outer wrapper. */
  className?: string;
};

export function Monogram({ name, className = "" }: MonogramProps) {
  return (
    <div
      className={[
        "relative w-full overflow-hidden h-[32vh] min-h-[200px]",
        className,
      ].join(" ")}
      style={{
        background:
          "linear-gradient(135deg, var(--plt-bg-raised) 0%, var(--plt-bg-deep) 55%, var(--plt-bg-elevated) 100%)",
      }}
      role="img"
      aria-label={`${name} profile cover`}
    >
      {/* Soft radial highlight — gives the flat band depth without imagery. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_35%,rgba(255,255,255,0.45),transparent)]" />
      {/* A single quiet forest hairline near the base — one deliberate accent
          moment, echoing the profile theme, no letters. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{
          background:
            "linear-gradient(to top, color-mix(in srgb, var(--plt-forest) 12%, transparent) 0%, transparent 100%)",
        }}
      />
    </div>
  );
}
