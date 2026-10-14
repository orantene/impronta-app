import { accountReturnPath } from "./return-to";

/**
 * Client sign-in and sign-up for path-addressed workspace sites
 * (`tulala.digital/w/<slug>`), TUL-709 + TUL-713. Pure.
 *
 * Those pages are served on the marketing host, which has no client account
 * surface, so both doors go to the app host's client flow (`/login?as=client`,
 * `/register?as=client`: email code first, ES/EN) and come BACK to the site
 * through the allow-listed `/account/return?to=<site path>` (#3744). Null for
 * every request that is not a `/w/<slug>` site: those keep their normal page.
 */

const PATH_PREFIX_RE = /^\/w\/[^/]+$/;

/** True when the proxy's public path prefix names a `/w/<slug>` site. */
export function isPathWorkspacePrefix(prefix: string | null | undefined): prefix is string {
  return PATH_PREFIX_RE.test(prefix ?? "");
}

function isSafeRelative(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(value);
}

function isUnderPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}#`);
}

/**
 * The app-host-relative `next` for a `/w/<slug>` client door:
 *   - a `next` on the site itself (`/w/<slug>/...`) returns there;
 *   - any other safe relative `next` is an app-host path and is kept;
 *   - otherwise the site page the visitor came from (`returnPath`, when it is on
 *     the site), else the site's home.
 */
export function pathWorkspaceClientNext(input: {
  publicPathPrefix: string;
  next?: unknown;
  returnPath?: string | null;
}): string {
  const { publicPathPrefix: prefix, next, returnPath } = input;
  if (isSafeRelative(next)) {
    return isUnderPrefix(next, prefix) ? accountReturnPath(next) : next;
  }
  if (isSafeRelative(returnPath) && isUnderPrefix(returnPath, prefix)) return accountReturnPath(returnPath);
  return accountReturnPath(prefix);
}

export function pathWorkspaceClientAuthHref(input: {
  /** The proxy's `x-impronta-public-path-prefix`, e.g. `/w/acme`. */
  publicPathPrefix: string | null | undefined;
  appUrl: string;
  mode: "login" | "register";
  params?: Readonly<Record<string, string | string[] | undefined>>;
  /** The site page to come back to when there is no `next`. */
  returnPath?: string | null;
  /** Request locale; Spanish keeps the `/es` prefix so the app page speaks it. */
  locale?: string | null;
}): string | null {
  if (!isPathWorkspacePrefix(input.publicPathPrefix)) return null;
  const params = input.params ?? {};
  const query = new URLSearchParams();
  query.set("as", "client");
  const intent = params.intent;
  if (typeof intent === "string" && intent) query.set("intent", intent);
  query.set(
    "next",
    pathWorkspaceClientNext({ publicPathPrefix: input.publicPathPrefix, next: params.next, returnPath: input.returnPath }),
  );
  const base = input.appUrl.trim().replace(/\/$/, "");
  const lang = input.locale === "es" ? "/es" : "";
  return `${base}${lang}/${input.mode}?${query.toString()}`;
}

/**
 * TUL-713: client sign-up for path-addressed workspace sites
 * (`tulala.digital/w/<slug>`). Those pages are served on the marketing host,
 * which has no client account surface, so sign-up goes to the app host's
 * client register (the same place the signed-out header icon sends sign-in,
 * TUL-709) and lands on /account. A relative `next` is kept; anything that
 * could leave the app host is replaced with /account. Null for every request
 * that is not a `/w/<slug>` site: those keep the normal `/register` redirect.
 * Pure.
 */
export function pathWorkspaceClientSignUpHref(input: {
  /** The proxy's `x-impronta-public-path-prefix`, e.g. `/w/acme`. */
  publicPathPrefix: string | null | undefined;
  appUrl: string;
  params: Readonly<Record<string, string | string[] | undefined>>;
}): string | null {
  if (!/^\/w\/[^/]+$/.test(input.publicPathPrefix ?? "")) return null;
  const query = new URLSearchParams();
  query.set("as", "client");
  const intent = input.params.intent;
  if (typeof intent === "string" && intent) query.set("intent", intent);
  const next = input.params.next;
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
  query.set("next", safeNext);
  return `${input.appUrl.trim().replace(/\/$/, "")}/register?${query.toString()}`;
}
