/**
 * Access rule for the dev sign-in shortcut (TUL-1269).
 *
 * The route mints a session for any seeded `@impronta.test` address with no
 * password, so on a deployed preview it must not be reachable by anyone who
 * merely knows the URL. Rule:
 *   - not development / preview  -> never
 *   - Vercel preview             -> only with the `x-dev-signin-token` header equal to
 *                                   `DEV_SIGNIN_TOKEN` (unset token = closed)
 *   - local development          -> open, UNLESS `DEV_SIGNIN_TOKEN` is set (CI sets it),
 *                                   then the header is required exactly as on preview
 * Pure so it is unit-tested without a request.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const DEV_SIGNIN_TOKEN_HEADER = "x-dev-signin-token";

export type DevSigninGateInput = {
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  configuredToken: string | undefined;
  presentedToken: string | null;
};

function sameToken(a: string, b: string): boolean {
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}

export function isDevSigninAllowed(input: DevSigninGateInput): boolean {
  const isDev = input.nodeEnv === "development";
  const isPreview = input.vercelEnv === "preview";
  if (!isDev && !isPreview) return false;
  const configured = input.configuredToken?.trim() ?? "";
  const tokenRequired = isPreview || configured.length > 0;
  if (!tokenRequired) return true;
  if (!configured || !input.presentedToken) return false;
  return sameToken(configured, input.presentedToken);
}
