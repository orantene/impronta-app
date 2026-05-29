/**
 * Presentational atoms shared by the directory card + list row.
 * Pure (no hooks) — cool palette only, forest accent, never gold/rust.
 */
import { initialsOf, trustTierMeta, availabilityLine } from "./shared";

export function TalentAvatar({
  name,
  src,
  className,
  rounded = "rounded-[18px]",
}: {
  name: string;
  src: string | null;
  className?: string;
  rounded?: string;
}) {
  if (src) {
    return (
      // Plain <img> (not next/image) — Supabase storage host isn't in the
      // image optimizer allowlist and these are already-sized public URLs.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className={`h-full w-full object-cover ${rounded} ${className ?? ""}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex h-full w-full items-center justify-center ${rounded} ${className ?? ""}`}
      style={{
        background: "color-mix(in srgb, var(--plt-forest) 9%, var(--plt-bg-raised))",
        color: "var(--plt-forest)",
      }}
    >
      <span className="plt-display text-[1.25rem] font-semibold tracking-[-0.01em]">
        {initialsOf(name) || "—"}
      </span>
    </div>
  );
}

export function TrustBadge({ tier }: { tier: string | null }) {
  const meta = trustTierMeta(tier);
  if (!meta) return null;
  const strong = meta.weight === "strong";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[0.6875rem] font-semibold leading-none tracking-[0.01em]"
      style={{
        background: strong
          ? "color-mix(in srgb, var(--plt-forest) 14%, var(--plt-bg-raised))"
          : "color-mix(in srgb, var(--plt-forest) 7%, var(--plt-bg-raised))",
        color: strong ? "var(--plt-forest-deep)" : "var(--plt-forest)",
        border: `1px solid color-mix(in srgb, var(--plt-forest) ${strong ? 32 : 20}%, transparent)`,
      }}
    >
      <CheckGlyph />
      {meta.label}
    </span>
  );
}

export function AvailabilityLine({
  availableDaysInNext30,
}: {
  availableDaysInNext30: number | null;
}) {
  const { text, open } = availabilityLine(availableDaysInNext30);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[0.8125rem] leading-none"
      style={{ color: open ? "var(--plt-forest-bright)" : "var(--plt-muted)" }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          background: open ? "var(--plt-forest-bright)" : "var(--plt-muted-soft)",
        }}
      />
      {text}
    </span>
  );
}

function CheckGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 6.5L5 9L9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
