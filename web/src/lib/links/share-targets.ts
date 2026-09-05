/**
 * Where the Share popover's buttons actually send people.
 *
 * Pure and separate from the component so the URL construction is testable.
 * Every one of these has a way to go subtly wrong that no one notices until a
 * customer receives a broken message: an unencoded ampersand truncating the
 * text, a `wa.me` number where there should be none, a mailto with a raw
 * newline in it.
 */

export type ShareContent = {
  /** The tracked short link. Always the last thing in the message. */
  url: string;
  /** One line of context, e.g. "Reserve a table at Casa Rizo". */
  message: string;
  /** Email only. */
  subject?: string;
};

/**
 * WhatsApp. `https://wa.me/?text=` with no number opens the contact picker,
 * which is what "share" means — a `wa.me/<number>` link would send the
 * operator's own code to the operator.
 *
 * The URL goes after the message and is separated by a newline so WhatsApp
 * renders a link preview; inline it sometimes swallows trailing punctuation
 * into the href.
 */
export function whatsAppHref(content: ShareContent): string {
  const text = `${content.message}\n${content.url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Email. `mailto:` with an empty recipient so the sender picks one.
 *
 * Body newlines must be percent-encoded; a literal newline terminates the
 * header in some clients and the rest of the body silently disappears.
 */
export function mailToHref(content: ShareContent): string {
  const subject = encodeURIComponent(content.subject ?? content.message);
  const body = encodeURIComponent(`${content.message}\n\n${content.url}`);
  return `mailto:?subject=${subject}&body=${body}`;
}

/**
 * Instagram has no share URL — it cannot be linked into with prefilled text,
 * and any `instagram.com/?text=` style URL is folklore. The honest options are
 * the OS share sheet, or copying the link for a Story sticker.
 *
 * Returning null rather than a plausible-looking URL is the point: a button
 * that opens Instagram to nothing is worse than a button that says "copy the
 * link and paste it into your Story".
 */
export function instagramHref(): null {
  return null;
}

/** Whether the browser can open a native share sheet with this content. */
export function canUseNativeShare(nav: { share?: unknown } | undefined): boolean {
  return typeof nav?.share === "function";
}

export type QrFormat = "svg" | "png" | "pdf";

/**
 * The download URL for a rendering of a link's code.
 *
 * Keyed by the link's CODE rather than its id: the code is what the operator
 * recognises, the URL is one they can paste to a designer, and the id leaks
 * nothing useful anyway. Tenant scope comes from the host, as everywhere else.
 */
export function qrAssetHref(code: string, format: QrFormat, opts: { widthMm?: number } = {}): string {
  const params = new URLSearchParams();
  if (opts.widthMm) params.set("mm", String(opts.widthMm));
  const query = params.toString();
  return `/api/links/${encodeURIComponent(code)}/qr.${format}${query ? `?${query}` : ""}`;
}

/**
 * The short link as a person reads it: no scheme, no trailing slash.
 *
 * This is what gets printed under a code for typing, so it has to be the
 * shortest thing that still works when typed into a phone browser.
 */
export function displayShortLink(fullUrl: string): string {
  return fullUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
