/**
 * The published support address.
 *
 * This lives in a PLAIN module, not in a `"use client"` component file, and
 * that placement is load bearing.
 *
 * It previously lived in `components/marketing/marketing-support-menu.tsx`,
 * which carries `"use client"`. Importing a constant from a client module into
 * a SERVER component does not hand you the string: Next replaces it with a
 * client reference proxy. So `/support` and `/help` shipped, in both
 * languages, with every "Email us" link rendered as
 *
 *   mailto:function(){throw Error("Attempted to call SUPPORT_EMAIL ...
 *
 * tsc, lint, 290 tests and CI were all green, because nothing in that chain
 * renders the page and reads the href. It reached production.
 *
 * Import it from HERE in server components. Client components may import it
 * from here too; the reverse direction is the one that breaks.
 */
export const SUPPORT_EMAIL = "hello@tulala.digital";
