import { formatVerifiedLine, type VerifiedLine } from "@/lib/trust/verified-mark";

/**
 * The single public "Verified" mark.
 *
 * ONE WORD, NO TIER NAMES. The spec is explicit: a visitor sees "Verified" or
 * nothing. `basic`, `silver` and `gold` are internal ranking vocabulary and
 * saying them out loud invites a talent to read a photo-provenance badge as a
 * status rung, which is exactly the confusion this work exists to remove.
 *
 * The hover lists what was verified and when, because a mark that will not say
 * what it means is a marketing claim rather than a verification.
 *
 * `title` is deliberate rather than a custom tooltip: it works on the server
 * with no JavaScript, it is what a screen reader announces, and on touch it is
 * reachable through long-press. A richer popover can replace it later without
 * changing this contract.
 */
export function VerifiedMark({
  lines,
  locale = "en",
  compact = false,
}: {
  lines: readonly VerifiedLine[];
  locale?: string;
  compact?: boolean;
}) {
  if (lines.length === 0) return null;
  const detail = lines.map((l) => formatVerifiedLine(l, locale)).join("\n");
  const label = locale === "es" ? "Verificado" : "Verified";

  return (
    <span
      title={detail}
      aria-label={`${label}: ${lines.map((l) => formatVerifiedLine(l, locale)).join(", ")}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 ${
        compact ? "py-0 text-[9px]" : "py-[1px] text-[10px]"
      } font-medium uppercase tracking-[0.08em]`}
      style={{
        // Tokens, not literals: the card renders inside every tenant's palette
        // and a hard-coded green would fight a noir storefront.
        borderColor: "var(--tc-verified-border, currentColor)",
        color: "var(--tc-verified-ink, currentColor)",
        opacity: 0.85,
      }}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden focusable="false">
        <path
          d="M2.5 6.2l2.3 2.3L9.6 3.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </span>
  );
}
