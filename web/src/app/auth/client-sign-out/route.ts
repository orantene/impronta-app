/**
 * GET /auth/client-sign-out: final hop of the client-account popover Log out
 * (TUL-708). On talent-site hosts the proxy answers this path itself
 * (`talentHostSignOutResponse`, talent-host-session.ts) because `/auth/*`
 * routes are 404 there; on every other host it lands here and behaves like
 * GET /auth/sign-out: expire every auth cookie scope + chunk, cookie-only,
 * cross-site refused.
 */
export { GET, POST } from "../sign-out/route";
