/**
 * Where the login/register card toggle navigates after writing the locale
 * cookie. An explicit `/es` prefix or `?lang=` on the URL outranks the cookie
 * on the server, so both are rewritten here; everything else (`?next=`) stays.
 */
export function authLocaleSwitchHref(pathname: string, search: string, code: string): string {
  const path = pathname.replace(/^\/es(?=\/|$)/, "") || "/";
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  if (params.has("lang")) params.set("lang", code);
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}
