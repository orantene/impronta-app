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
    fontFamily: FONT_STACK,
    borderRadius: "10px",
    spacingUnit: "9px",
    buttonPrimaryColorBackground: TULALA_GREEN,
    buttonPrimaryColorText: "#ffffff",
    buttonSecondaryColorText: TULALA_GREEN,
    actionPrimaryColorText: TULALA_GREEN,
    badgeSuccessColorText: "#1A7348",
    badgeSuccessColorBackground: "#E7F1EC",
  },
};
