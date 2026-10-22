/**
 * TUL-1927: the screen-reader sentence when a talent joins or leaves the
 * inquiry. Fully translated and plural-aware ("1 talento seleccionado" /
 * "3 talentos seleccionados"), and a talent with no resolved name reads as the
 * translated fallback ("Talento"), never the English placeholder the cart hook
 * carries internally.
 */
import { withPluralization, type Translator } from "@/i18n/interpolate";

/** What `useCartTalents` stores when a card has not registered a name yet. */
export const CART_TALENT_PLACEHOLDER_NAME = "Talent";

export function cartAnnounce(
  t: Translator,
  kind: "added" | "removed",
  displayName: string | null | undefined,
  count: number,
): string {
  const raw = (displayName ?? "").trim();
  const name = !raw || raw === CART_TALENT_PLACEHOLDER_NAME ? t("public.guestChat.avatarNameFallback") : raw;
  const key = kind === "added" ? "public.guestChat.avatarAddedAnnounce" : "public.guestChat.avatarRemovedAnnounce";
  return withPluralization(t)(key, count, { name });
}
