/**
 * Tulala-branded appearance for Stripe Connect embedded components.
 *
 * Shared by the talent (`/talent/settings/payouts`) and workspace
 * (`/[tenant]/admin/payouts`) embedded onboarding surfaces so both
 * render in Tulala's palette instead of Stripe's default blue — the
 * talent/workspace never feels they left for stripe.com.
 *
 * Stripe's Appearance API only exposes design *variables* (colors,
 * radius, fonts) — element-level overrides aren't possible — so we map
 * the brand tokens that matter: the deep green primary, ink text, and
 * the Inter type stack the rest of the app uses. Fraunces (our display
 * face) isn't applied inside Stripe's iframe because per-element font
 * control isn't available there; the surrounding page chrome carries it.
 *
 * Client-importable (no server-only deps) — passed to
 * `loadConnectAndInitialize({ appearance })`.
 */

/** Tulala deep green — the brand primary the owner specified for payouts. */
export const TULALA_GREEN = "#1f4a3a";

const INK = "#0B0B0D";
const FONT_STACK = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';

/**
 * Appearance variables for `loadConnectAndInitialize`. Typed loosely as a
 * record of strings (every Connect appearance variable is a string) so we
 * don't couple to a specific @stripe/connect-js type export.
 */
export const TULALA_CONNECT_APPEARANCE: {
  variables: Record<string, string>;
} = {
  // Stripe's Connect Appearance API only accepts hex / rgb() / hsl() color
  // values — NOT rgba() with alpha — so every value here is opaque.
  variables: {
    colorPrimary: TULALA_GREEN,
    colorBackground: "#ffffff",
    colorText: INK,
    colorSecondaryText: "#6B6B6E",
    colorDanger: "#A33A3A",
    // Hairline borders instead of Stripe's heavier default — the embedded card
    // sits inside our own card, so loud borders read as boxes-in-boxes.
    colorBorder: "#E6E6E8",
    fontFamily: FONT_STACK,
    fontSizeBase: "15px",
    borderRadius: "12px",
    // Drives EVERY internal gap in the embedded component. Stripe's default (and
    // our old 9px) crowds the LatAm forms, which stack more fields (CUIL, CLABE,
    // CBU) than the US flow. 12px gives the form room to breathe.
    spacingUnit: "12px",
    // Inputs rendered with Stripe's pale-blue default fill against our warm
    // surface. Pin them to white with our hairline border + green focus.
    formBackgroundColor: "#ffffff",
    formHighlightColorBorder: TULALA_GREEN,
    formAccentColor: TULALA_GREEN,
    // The nested "test account" / step banners sit on this tone; our faint warm
    // grey keeps them from looking like a third stacked card.
    offsetBackgroundColor: "#F7F7F5",
    buttonPrimaryColorBackground: TULALA_GREEN,
    buttonPrimaryColorText: "#ffffff",
    buttonSecondaryColorText: TULALA_GREEN,
    actionPrimaryColorText: TULALA_GREEN,
    badgeSuccessColorText: "#1A7348",
    badgeSuccessColorBackground: "#E7F1EC",
    badgeNeutralColorText: "#6B6B6E",
    badgeNeutralColorBackground: "#F1F1EF",
  },
};
