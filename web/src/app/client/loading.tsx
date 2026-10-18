import ClientLoading from "@/app/(workspace)/[tenantSlug]/client/loading";

/**
 * TUL-1250: /client is a server-side resolver (session, identity, tenant lookup)
 * that redirects on. Without a loading boundary a signed-in client saw a blank
 * white page until the redirect landed (the same trap TUL-946 closed for /admin).
 * Paint the client shell skeleton right away.
 */
export default function ClientRootLoading() {
  return <ClientLoading />;
}
