"use client";

import { TULALA_SUPPORT_OPEN_EVENT } from "@/lib/marketing/support-copy";

/**
 * The way in, at the top, before the argument for it.
 *
 * /support opened with an eyebrow, a display headline and two paragraphs of
 * manifesto before it named a single way to reach us. On a 375 px screen that
 * is a full scroll of essay, and the only affordance in reach is a "?" circle
 * in the bottom-right corner. The owner's words after trying it on his phone
 * were "slow, terrible, I could not get that support helping me with anything".
 *
 * Somebody who opens a support page has already decided they need help. Making
 * them read why our support is good first is the exact behaviour the page's own
 * copy criticises two paragraphs later. The essay is worth keeping, and it
 * keeps its place directly underneath.
 *
 * The second button is a plain link to /contact, so the page is never a dead
 * end. The first only renders when the guest support panel is mounted
 * (`askAvailable`): with the marketing launcher off nothing listens for the
 * open event and the button would do nothing.
 */
export function SupportStartHere({
  askAvailable,
  askLabel,
  writeLabel,
  writeHref,
  hint,
}: {
  askAvailable: boolean;
  askLabel: string;
  writeLabel: string;
  writeHref: string;
  hint: string;
}) {
  const primary =
    "plt-body inline-flex min-h-[52px] items-center justify-center rounded-full bg-[var(--plt-ink)] px-6 text-center text-[1.0625rem] font-semibold text-[var(--plt-bg)]";
  const secondary =
    "plt-body inline-flex min-h-[52px] items-center justify-center rounded-full border border-[var(--plt-hairline-strong)] px-6 text-center text-[1.0625rem] text-[var(--plt-ink)]";
  return (
    <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
      {/* Colours come from classes, not inline styles: this tree has a guard
          against inline color/background so the panel and the page cannot drift
          apart on theme tokens. */}
      {askAvailable ? (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(TULALA_SUPPORT_OPEN_EVENT))}
          className={primary}
        >
          {askLabel}
        </button>
      ) : null}
      <a href={writeHref} className={askAvailable ? secondary : primary}>
        {writeLabel}
      </a>
      {askAvailable ? (
        <p className="plt-body mt-1 text-center text-[0.9rem] text-[var(--plt-muted)] sm:hidden">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
