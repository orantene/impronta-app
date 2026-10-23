/**
 * Phone share path (TUL-938). The native share sheet is opened straight from the tap that
 * asked for it, so the browser keeps the user gesture. Wide screens and browsers without
 * `navigator.share` return "unavailable" and the caller opens the in-page sheet, whose
 * copy-link button is the visible fallback.
 */
export type NativeShareResult = "shared" | "cancelled" | "unavailable" | "failed";

export type NativeShareInput = { title: string; text: string; url: string };

const PHONE_QUERY = "(max-width: 767px)";

export function canUseNativeShare(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(PHONE_QUERY).matches;
}

/** Call synchronously inside the click handler: no await before it. */
export async function shareNative(input: NativeShareInput): Promise<NativeShareResult> {
  if (!canUseNativeShare()) return "unavailable";
  try {
    await navigator.share(input);
    return "shared";
  } catch (e) {
    return e instanceof Error && e.name === "AbortError" ? "cancelled" : "failed";
  }
}
