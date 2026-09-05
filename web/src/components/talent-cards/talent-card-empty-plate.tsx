import { TALENT_CARD_VARS } from "./talent-card-shape";

/**
 * The card with no photo — J9, built to the Creative Direction canvas of
 * 2026-09-03 ("The Card With No Photo", board:
 * docs/plans/creative-direction-board-2026-09-03.md).
 *
 * ─── WHAT WAS THERE BEFORE ──────────────────────────────────────────────────
 *
 * Two sibling cards had two DIFFERENT no-photo fallbacks, and one of them
 * carried a comment claiming they matched:
 *
 *   TalentCard          a line-art person silhouette on `--token-card-surface`
 *   FeaturedTalentCard  the talent's NAME set large — with the comment
 *                       "Matches the canonical <TalentCard> fallback"
 *
 * It did not match. And on Impronta's noir tenant `--token-card-surface`
 * resolves to near-black, so the silhouette sat on a black ground and the card
 * read as a failed image load rather than as a talent without a photograph.
 * That is the defect J9 was raised for.
 *
 * ─── THE FIVE RULES, AND WHERE EACH ONE LIVES BELOW ─────────────────────────
 *
 *  01  Never a flat fill and never black — a soft gradient off the tenant's own
 *      surface token. Black is indistinguishable from a broken image, which is
 *      the entire problem.                                    → `background`
 *  02  The discipline is the image — the tenant's display face, two lines
 *      maximum, optically centred ABOVE the middle so the caption below has
 *      room. It is the one fact we always have and the thing the visitor is
 *      actually shopping for.                                 → `.discipline`
 *  03  An inset hairline in the tenant's accent — one pixel, inset from the
 *      edge. It is what makes the card read as framed rather than unfilled.
 *                                                             → `.hairline`
 *  04  No monogram, no initials, no icon, no silhouette. All four read as
 *      placeholder, and a letter tells a visitor nothing the name beneath it
 *      has not already said.                    → enforced by absence; see the
 *                                                  static test beside this file
 *  05  Identical footprint to a photo card — same aspect ratio, same name and
 *      location positions, same action chips. The grid must not flinch where a
 *      photo is missing; that flinch is what makes absence visible.
 *
 * ─── WHY THE NAME IS NOT DRAWN IN HERE ──────────────────────────────────────
 *
 * The canvas mock draws name + location inside the plate because it renders the
 * whole card as one box. In the real components the media box and the caption
 * are separate elements, and the caption already renders name, discipline and
 * location directly beneath this plate. Repeating the name inside would print
 * it twice on every empty card. Rule 05 is satisfied by this plate being
 * `absolute inset-0` inside the SAME aspect-ratio wrapper a photo would fill —
 * the footprint is shared by construction, not by copying values.
 *
 * Every colour here is a tenant token with a literal fallback, so a tenant that
 * publishes a Card Design repaints this state along with everything else and no
 * new registry token is introduced.
 */
export function TalentCardEmptyPlate({
  /**
   * The discipline, e.g. "Actor" or "Event Content Creator". Optional on
   * purpose: a profile with no talent type still gets rules 01 and 03, so the
   * card is a composed empty state rather than a void even in the worst case.
   */
  discipline,
}: {
  discipline?: string | null;
}) {
  const line = discipline?.trim() || null;

  return (
    <div
      aria-hidden
      data-card-empty-plate
      className="absolute inset-0"
      style={{
        // Rule 01. Mixed off the tenant's own surface token in both directions
        // so the plate keeps the tenant's hue instead of imposing a grey, and
        // stays a gradient rather than a fill on light AND dark grounds.
        background: `linear-gradient(168deg,
          color-mix(in srgb, ${TALENT_CARD_VARS.surface} 88%, ${TALENT_CARD_VARS.name}) 0%,
          ${TALENT_CARD_VARS.surface} 58%,
          color-mix(in srgb, ${TALENT_CARD_VARS.surface} 92%, #000) 100%)`,
        // The plate is its own container so the discipline can size against the
        // CARD's width. Cards run from ~150px in a dense grid to ~400px in a
        // two-up, and a fixed size that reads on one is wrong on the other.
        containerType: "inline-size",
      }}
    >
      {/* Rule 03 — the inset hairline. */}
      <div
        className="pointer-events-none absolute inset-[6.5%] rounded-[4px]"
        style={{
          border:
            "1px solid color-mix(in srgb, var(--token-color-accent, var(--token-card-muted, #6b7280)) 26%, transparent)",
        }}
      />

      {line ? (
        <>
          {/* Rule 02 — the discipline as the image. Sits at 38% rather than
              50%: optically centred for a box whose caption sits below it. */}
          <div className="absolute inset-x-0 top-[38%] -translate-y-1/2 px-[8%] text-center">
            <span
              className="block"
              style={{
                fontFamily:
                  "var(--token-typography-heading-font-family, var(--site-heading-font, inherit))",
                // Two lines maximum. A third line on "Event Content Creator"
                // would crowd the rule beneath it and start to look like copy
                // rather than a title.
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                overflow: "hidden",
                fontSize: "clamp(0.82rem, 12cqw, 1.42rem)",
                lineHeight: 1.12,
                letterSpacing: "0.005em",
                textWrap: "balance",
                color: `color-mix(in srgb, ${TALENT_CARD_VARS.name} 82%, transparent)`,
              }}
            >
              {line}
            </span>
          </div>

          {/* The short rule under the discipline. Part of the composition, not
              decoration: it gives the type a baseline to sit on so the plate
              reads as set rather than as text floating in a box. */}
          <div
            className="pointer-events-none absolute top-[60%] h-px w-[26px] -translate-x-1/2"
            style={{
              left: "50%",
              background:
                "color-mix(in srgb, var(--token-color-accent, var(--token-card-muted, #6b7280)) 50%, transparent)",
            }}
          />
        </>
      ) : null}
    </div>
  );
}
