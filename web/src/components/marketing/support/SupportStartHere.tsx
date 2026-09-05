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
 * Both buttons work without JavaScript having hydrated the panel: the second is
 * a plain link to /contact, so the page is never a dead end.
 */
export function SupportStartHere({
  askLabel,
  writeLabel,
  writeHref,
  hint,
}: {
  askLabel: string;
  writeLabel: string;
  writeHref: string;
  hint: string;
}) {
  return (
    <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(TULALA_SUPPORT_OPEN_EVENT))}
        className="plt-body inline-flex min-h-[52px] items-center justify-center rounded-full px-6 text-center font-semibold"
        style={{
          background: "var(--plt-ink)",
          color: "var(--plt-bg)",
          fontSize: "1.0625rem",
        }}
      >
        {askLabel}
      </button>
      <a
        href={writeHref}
        className="plt-body inline-flex min-h-[52px] items-center justify-center rounded-full px-6 text-center"
        style={{
          border: "1px solid var(--plt-hairline-strong)",
          color: "var(--plt-ink)",
          fontSize: "1.0625rem",
        }}
      >
        {writeLabel}
      </a>
      <p
        className="plt-body mt-1 text-center sm:hidden"
        style={{ color: "var(--plt-muted)", fontSize: "0.9rem" }}
      >
        {hint}
      </p>
    </div>
  );
}
