/**
 * The ONE place that decides which origin "the marketing host" is for
 * redirects and email links that send a visitor there (`/start`, pitch links,
 * the lost-host page, the abandoned-draft email).
 *
 * Production is `https://tulala.digital`. A Preview deployment of the isolated
 * journeys stack sets `TULALA_MARKETING_ORIGIN` to its own marketing host so a
 * sign-up begun there never lands on the production site (a real production
 * account). Safety rails:
 *  - the override is IGNORED when `VERCEL_ENV` is `production`, so a stray
 *    variable can never move production traffic;
 *  - it must parse as an http(s) URL; only its origin is used (path, query and
 *    credentials are dropped); plain `http:` is accepted only for localhost;
 *  - anything else falls back to the production default.
 *
 * Server-side only: the variable is not `NEXT_PUBLIC_`, so client bundles always
 * resolve the default. Do NOT call this from a client component's render path
 * (it would differ between server HTML and the browser); canonical, SEO, legal
 * and Stripe URLs deliberately keep the production origin.
 */

import { TULALA_APEX_HOST } from "./tulala";

export const DEFAULT_MARKETING_ORIGIN = `https://${TULALA_APEX_HOST}`;

type MarketingOriginEnv = Readonly<Record<string, string | undefined>>;

export function resolveMarketingOrigin(env: MarketingOriginEnv = process.env): string {
  if (env.VERCEL_ENV === "production") return DEFAULT_MARKETING_ORIGIN;
  const raw = env.TULALA_MARKETING_ORIGIN?.trim();
  if (!raw) return DEFAULT_MARKETING_ORIGIN;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return DEFAULT_MARKETING_ORIGIN;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.origin;
  return DEFAULT_MARKETING_ORIGIN;
}
