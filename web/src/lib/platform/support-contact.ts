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

/**
 * TEMPORARY, 2026-09-03. The domain has NO MX RECORD, verified with
 * `dig MX tulala.digital` (empty) independently by Support, the CEO session
 * and this one. Mail sent to the address above cannot be delivered: anyone who
 * writes in gets a bounce.
 *
 * Outbound is unaffected. Resend sends fine; it is INBOUND that does not
 * exist, so every reply-to on every transactional mail we send is also dead.
 *
 * While this is true, the marketing pages must not tell people to email us.
 * `/support` argues that a promise which gets missed is worse than no promise,
 * and pointing a reader at a mailbox that bounces is exactly that failure,
 * committed by the page making the argument.
 *
 * TO RESTORE: once `dig MX tulala.digital` returns a record AND a test message
 * is confirmed delivered, flip this to true. That re-enables the email channel
 * on /support and /help. Nothing else needs editing.
 */
export const SUPPORT_EMAIL_CAN_RECEIVE = false;
