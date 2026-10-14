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
