/**
 * Monogram — renders the talent's initials in an elegant circular badge.
 * Used as the cover-less empty-state: a soft neutral gradient band with a
 * large monogram centered. NO emoji, NO placeholder box.
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
        "bg-gradient-to-br from-[#F5F3EF] via-[#EDEAE4] to-[#E4E0D8]",
        className,
      ].join(" ")}
      aria-hidden="true"
    >
      {/* Subtle radial highlight */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_40%,rgba(255,255,255,0.55),transparent)]" />
      <span
        className="relative select-none font-[family-name:var(--font-cinzel)] text-[min(18vw,9rem)] font-medium leading-none tracking-[0.08em] text-[#C2BAB0]/60"
        aria-label={`${name} initials`}
      >
        {initials}
      </span>
    </div>
  );
}
