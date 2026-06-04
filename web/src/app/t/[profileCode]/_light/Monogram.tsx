/**
 * Monogram — renders the talent's initials in an elegant cover band.
 * Used as the cover-less empty-state: a soft forest-tinted gradient band with
 * a large monogram centered. NO emoji, NO placeholder box. --plt tokens only.
 */

type MonogramProps = {
  name: string;
  /** Optional extra CSS class on the outer wrapper. */
  className?: string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]![0] ?? "?").toUpperCase();
  return (
    (parts[0]![0] ?? "").toUpperCase() +
    (parts[parts.length - 1]![0] ?? "").toUpperCase()
  );
}

export function Monogram({ name, className = "" }: MonogramProps) {
  const initials = getInitials(name);
  return (
    <div
      className={[
        "relative flex h-[32vh] min-h-[200px] w-full items-center justify-center",
        className,
      ].join(" ")}
      style={{
        background:
          "linear-gradient(135deg, var(--plt-bg-raised) 0%, var(--plt-bg-deep) 55%, var(--plt-bg-elevated) 100%)",
      }}
      aria-hidden="true"
    >
      {/* Subtle radial highlight */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_40%,rgba(255,255,255,0.5),transparent)]" />
      <span
        className="plt-display relative select-none text-[min(18vw,9rem)] font-semibold leading-none tracking-[-0.04em]"
        style={{ color: "color-mix(in srgb, var(--plt-forest) 30%, var(--plt-muted-soft))" }}
        aria-label={`${name} initials`}
      >
        {initials}
      </span>
    </div>
  );
}
