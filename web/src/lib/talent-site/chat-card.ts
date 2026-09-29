/**
 * The guest chat's look on a talent's own site (`chat.variant` token).
 *
 * `standard` is the full messages dock. `card` is the calm one-to-one chat
 * card (avatar + name, a greeting bubble, a message pill) painted from the
 * site's OWN theme tokens and fonts. A Design sets the default; the site-wide
 * `chat.variant` token in the theme panel overrides it. Pure, client-safe.
 */

export type ChatVariant = "standard" | "card";

/** Designs whose proposal shows the chat card. A default only; the token wins. */
const DESIGN_CHAT_VARIANT_DEFAULTS: Readonly<Record<string, ChatVariant>> = {
  "maison-v2": "card",
};

export function resolveChatVariant(
  tokens: Readonly<Record<string, unknown>> | null | undefined,
  designSlug: string | null | undefined,
): ChatVariant {
  const raw = tokens?.["chat.variant"];
  if (raw === "standard" || raw === "card") return raw;
  return (designSlug && DESIGN_CHAT_VARIANT_DEFAULTS[designSlug]) || "standard";
}

/**
 * Everything the card needs that the shared chat contract does not carry.
 * Colours are theme token VALUES (or null → the card falls back to the page's
 * `--token-color-*` vars, then the chat palette). Never literals from here.
 */
export type ChatCardConfig = {
  /** Subline: honest reply time (null when there is no real data) and her city. */
  replyLabel: string | null;
  city: string | null;
  /** A greeting she wrote herself; null → the card's own "Hi, I'm {name}". */
  customGreeting: string | null;
  colors: {
    background: string | null;
    surface: string | null;
    ink: string | null;
    muted: string | null;
    line: string | null;
    accent: string | null;
    onAccent: string | null;
  };
  bodyFont: string | null;
};

function tokenString(tokens: Readonly<Record<string, unknown>>, key: string): string | null {
  const v = tokens[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function chatCardColorsFromTokens(
  tokens: Readonly<Record<string, unknown>> | null | undefined,
): Pick<ChatCardConfig, "colors" | "bodyFont"> {
  const t = tokens ?? {};
  return {
    colors: {
      background: tokenString(t, "color.background"),
      surface: tokenString(t, "color.surface-raised"),
      ink: tokenString(t, "color.ink"),
      muted: tokenString(t, "color.muted"),
      line: tokenString(t, "color.line"),
      accent: tokenString(t, "color.accent") ?? tokenString(t, "color.primary"),
      onAccent: tokenString(t, "color.primary-on"),
    },
    bodyFont: tokenString(t, "typography.body-font-family"),
  };
}

/** Reply-latency fragment (guest-reply-latency buckets) → a catalog key. */
export function chatCardReplyKey(
  fragment: string | null | undefined,
): { key: string; n?: number } | null {
  if (!fragment) return null;
  if (fragment === "in minutes") return { key: "public.guestChat.cardReplyMinutes" };
  if (fragment === "in ~1 hour") return { key: "public.guestChat.cardReplyHour" };
  const hours = /^in ~(\d+) hours$/.exec(fragment);
  if (hours) return { key: "public.guestChat.cardReplyHours", n: Number(hours[1]) };
  if (fragment === "within a few hours") return { key: "public.guestChat.cardReplyFewHours" };
  if (fragment === "the same day") return { key: "public.guestChat.cardReplySameDay" };
  if (fragment === "within a day") return { key: "public.guestChat.cardReplyDay" };
  if (fragment.startsWith("within 2")) return { key: "public.guestChat.cardReplyDays" };
  return null;
}
