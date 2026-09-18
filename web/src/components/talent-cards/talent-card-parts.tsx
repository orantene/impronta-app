import { StaticStars } from "@/components/reviews/star-rating";
import {
  computeStandingTier,
  meetsCredibilityFloor,
  standingTierLabel,
} from "@/lib/reviews/craft-standing";

import { TALENT_CARD_VARS, type CanonicalTalentCardData } from "./talent-card-shape";

/** Shared caption / media primitives used by every <TalentCard> style branch. */
export function OwnershipBadge({ data }: { data: CanonicalTalentCardData }) {
  // A tenant storefront directory shows ONE agency's roster, so stamping the
  // agency's own name on every card is pure repetition (it's already the site
  // brand in the header). Render only a DIFFERENTIATING signal: an exclusive
  // mark (gold, on-brand) or an independent tag. A bare own-agency name → no
  // badge at all. Cross-agency surfaces still surface "Exclusive"/"Independent".
  if (data.isExclusive) {
    return (
      <span
        data-card-ownership
        data-card-chip
        className="pointer-events-none inline-flex max-w-full items-center truncate rounded-full border border-[var(--dir-accent)] bg-background/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--impronta-gold-bright)] backdrop-blur-sm"
      >
        Exclusive
      </span>
    );
  }
  if (data.agencyName) return null;
  return (
    <span
      data-card-ownership
      data-card-chip
      className="pointer-events-none inline-flex max-w-full items-center truncate rounded-full border border-border bg-background/85 px-2 py-0.5 text-[10px] font-medium tracking-wide text-foreground backdrop-blur-sm"
    >
      Independent
    </span>
  );
}

/**
 * Craft standing chip — the same credibility-gated signal the directory
 * list-row renders (`talent-directory-list-row.tsx`), reused here so the
 * grid card carries it too. Rendered only past `meetsCredibilityFloor`; the
 * `directory.card.show-standing` / `directory.card.standing-style` tokens
 * gate visibility via the `data-card-standing*` hooks (token-presets.css),
 * so absence-by-token-off stays a pure CSS toggle, not a JS branch here.
 *
 * `onScrim` swaps the tone for the portrait style's white-over-photo caption
 * (matches the name/type/availability lines already on that scrim); the
 * editorial style renders on the card's plain surface, so it uses the
 * muted-foreground token like its other caption lines.
 */
/**
 * "Verified" mark — a green checkmark pill distinct from `OwnershipBadge`'s
 * Exclusive/Independent tag (both can render together: verification is a
 * trust signal, exclusivity is a relationship signal). Gated on
 * `data.verified`, the same field `editorial`'s inline `<VerifiedMark>`
 * reads, so no new data plumbing.
 */
export function VerifiedBadge({ tone = "scrim" }: { tone?: "scrim" | "light" }) {
  const light = tone === "light";
  return (
    <span
      data-card-verified
      data-card-chip
      className={
        light
          ? "pointer-events-none inline-flex items-center gap-1.5 rounded-full bg-white/[0.92] px-2.5 py-1 text-[11px] font-semibold text-[#17160f] shadow-[0_2px_8px_rgba(0,0,0,0.14)]"
          : "pointer-events-none inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold text-[#1F7A4C] backdrop-blur-sm"
      }
    >
      <span
        className={
          light
            ? "inline-flex size-3.5 items-center justify-center rounded-full bg-[var(--token-card-cta,#1f4d3a)] text-white"
            : "inline-flex"
        }
      >
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      Verified
    </span>
  );
}

/**
 * "via {agency}" — the small attribution line under the price on the
 * portrait caption. Independent of whether a price is present: the
 * marketing directory (the only surface that sets `showAgencyLine`) does
 * not resolve per-talent pricing at all, and the attribution is still
 * meaningful on its own ("this face belongs to that agency").
 */
export function AgencyLine({
  data,
  onScrim = true,
}: {
  data: CanonicalTalentCardData;
  onScrim?: boolean;
}) {
  if (!data.agencyName) return null;
  return (
    <p
      data-card-agency
      className={`mt-0.5 text-[10px] ${
        onScrim
          ? "text-[var(--token-card-muted,rgba(255,255,255,0.6))]"
          : "text-[var(--token-card-muted,#6a665c)]"
      }`}
    >
      via {data.agencyName}
    </p>
  );
}

export function StandingChip({
  data,
  onScrim,
  showStanding = "auto",
}: {
  data: CanonicalTalentCardData;
  onScrim: boolean;
  showStanding?: "auto" | "always";
}) {
  if (data.ratingAvg == null || !meetsCredibilityFloor(data.ratingCount)) {
    return null;
  }
  const ratingCount = data.ratingCount ?? 0;
  const tier = computeStandingTier({
    ratingCount,
    ratingAvg: data.ratingAvg,
    wouldBookAgainPct: data.wouldBookAgainPct ?? null,
  });
  const textClass = onScrim ? "text-white/80" : "";
  const textStyle = onScrim ? undefined : { color: TALENT_CARD_VARS.muted };
  // `gated` (default) keeps the `data-card-standing` hook the CSS token gate
  // matches against; `showStanding="always"` swaps to a different attribute
  // so `html:not([data-token-card-standing]) [data-card-standing]{display:none}`
  // in token-presets.css doesn't hide it on surfaces (like Discover) that
  // resolve the reviews entitlement themselves and have no tenant token on
  // `<html>` to opt into.
  const gated = showStanding !== "always";
  const wrapperAttrs = gated
    ? { "data-card-standing": true }
    : { "data-card-standing-shown": true };
  return (
    <div
      {...wrapperAttrs}
      className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1"
    >
      <span
        data-card-standing-tier
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] ${
          onScrim
            ? "border border-white/[0.25] bg-white/[0.08] text-white/90"
            : "border border-border bg-background/60 text-foreground/90"
        }`}
      >
        {standingTierLabel(tier)}
      </span>
      <span
        data-card-standing-signal
        className={`inline-flex items-center gap-1.5 text-[11px] ${textClass}`}
        style={textStyle}
      >
        <StaticStars rating={data.ratingAvg} size={11} />
        <span className="tabular-nums">{data.ratingAvg.toFixed(1)}</span>
        <span aria-hidden className="text-[var(--dir-accent)]">
          ·
        </span>
        <span className="tabular-nums">{ratingCount}</span>
      </span>
    </div>
  );
}

export function AvailabilityLine({ data }: { data: CanonicalTalentCardData }) {
  return (
    <span
      data-card-availability
      className="inline-flex items-center gap-1.5 text-[11px]"
      style={{ color: TALENT_CARD_VARS.muted }}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          data.availabilityKnown ? "bg-foreground/60" : "bg-foreground/25"
        }`}
      />
      {data.availabilityLabel}
    </span>
  );
}
