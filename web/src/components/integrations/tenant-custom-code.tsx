import { resolveTenantCustomCode } from "@/lib/integrations/resolve";

/**
 * Injects a tenant's own custom HTML into their storefront.
 *
 * - Head markup is rendered into the document <head> (App Router hoists a bare
 *   element-returning component's head-only tags is NOT guaranteed, so we render
 *   the head blob via a positioned container the browser still parses; for
 *   broad-snippet support we emit it with dangerouslySetInnerHTML so <script>,
 *   <meta>, <link> all land as authored).
 * - Body markup is rendered at the end of <body>.
 *
 * SECURITY / SCOPE: this component is mounted ONLY from the root layout when a
 * tenant storefront scope is resolved AND the tenant holds the
 * custom_css_allowed entitlement (the resolver double-gates on row status +
 * entitlement). It is never mounted on admin/auth/platform routes, and the
 * resolver is per-tenant so one tenant's code can never reach another's page.
 * The HTML is the tenant's own authored markup for their own site — equivalent
 * to a self-hosted <head>/<body> snippet — so raw injection is intentional.
 *
 * Two sibling server components keep head vs body placement explicit at the
 * layout call-sites.
 */

export async function TenantCustomCodeHead({ tenantId }: { tenantId: string }) {
  const { headHtml } = await resolveTenantCustomCode(tenantId);
  if (!headHtml) return null;
  // Rendered inside the layout tree near the top of <body>; the browser still
  // executes <script>/applies <meta> here. (Next App Router has no portable
  // server <head> injection slot for arbitrary markup, so we mount it high in
  // the body — functionally equivalent for analytics loaders, fonts, widgets.)
  return (
    <div
      data-tenant-custom-head
      style={{ display: "contents" }}
      // eslint-disable-next-line react/no-danger -- tenant's own storefront markup, entitlement + scope gated
      dangerouslySetInnerHTML={{ __html: headHtml }}
    />
  );
}

export async function TenantCustomCodeBody({ tenantId }: { tenantId: string }) {
  const { bodyHtml } = await resolveTenantCustomCode(tenantId);
  if (!bodyHtml) return null;
  return (
    <div
      data-tenant-custom-body
      style={{ display: "contents" }}
      // eslint-disable-next-line react/no-danger -- tenant's own storefront markup, entitlement + scope gated
      dangerouslySetInnerHTML={{ __html: bodyHtml }}
    />
  );
}
