import {
  selectTrackingForRender,
  trackingSelectionDroppedAnything,
  type TrackingTag,
} from "@/lib/site-admin/tracking";
import { loadTenantTracking } from "@/lib/site-admin/server/tracking-settings";
import { improntaLog } from "@/lib/server/structured-log";

/**
 * Storefront injector for the analytics / advertising accounts a tenant
 * connected in Website → Setup → Tracking.
 *
 * WHERE THIS MAY RUN
 * ──────────────────
 * Mounted from the ROOT layout behind `publicScope`, which is non-null only when
 * middleware resolved the request host to a tenant storefront. That single
 * condition is what keeps a tenant's trackers off the admin app, off `/auth`,
 * off onboarding and off the platform marketing surface. It is the same gate
 * `TenantCustomCodeHead` and `TenantCodeSnippetsHead` sit behind, reused rather
 * than reinvented, so there is one seam to audit and not three.
 *
 * WHAT MAY BE RENDERED
 * ────────────────────
 * Whatever `selectTrackingForRender` returns, and nothing else. That function
 * re-checks the owning tenant and re-validates every stored ID against its
 * anchored pattern — see `lib/site-admin/tracking.ts`. Keeping the decision
 * there and the markup here means the rules are unit-tested without a DOM, and
 * this file has no branch of its own to get wrong.
 *
 * WHY `dangerouslySetInnerHTML`
 * ────────────────────────────
 * `<script>` is a raw-text element: its contents are JavaScript, not markup, and
 * React's text escaping would corrupt them (`a>b` becoming `a&gt;b` is a syntax
 * error, not a safety win). What makes it safe is that nothing tenant-authored
 * reaches the markup un-validated: every interpolated ID has passed an anchored
 * pattern whose character set contains no quote, backslash, angle bracket or
 * whitespace, at save time and again at render time. The one attribute that
 * carries an ID (`data-domain` for Plausible) is a React attribute, so React
 * escapes it normally.
 */

function TrackingScript({ tag }: { tag: TrackingTag }) {
  if (tag.src) {
    return (
      <script
        src={tag.src}
        async={tag.loading === "async"}
        defer={tag.loading === "defer"}
        data-tenant-tracking={tag.provider}
        {...(tag.attrs ?? {})}
      />
    );
  }
  return (
    <script
      data-tenant-tracking={tag.provider}
      // eslint-disable-next-line react/no-danger -- raw-text element: contents are JS built from a closed template plus an ID that passed an anchored pattern with no quote/backslash/angle-bracket in its character set
      dangerouslySetInnerHTML={{ __html: tag.code ?? "" }}
    />
  );
}

/**
 * The tenant's connected trackers, for the document head. Renders nothing when
 * the tenant has connected nothing, which is the overwhelmingly common case.
 */
export async function TenantTrackingHead({ tenantId }: { tenantId: string }) {
  const config = await loadTenantTracking(tenantId);
  const selection = selectTrackingForRender(config, { tenantId });

  // A tracker the operator believes is connected but that does not appear must
  // be explainable. Anything dropped is logged once with its reason.
  if (trackingSelectionDroppedAnything(selection)) {
    void improntaLog("tenant_tracking.dropped", {
      tenantId,
      ...selection.dropped,
    });
  }

  if (selection.tags.length === 0) return null;
  return (
    <>
      {selection.tags.map((tag) => (
        <TrackingScript key={tag.key} tag={tag} />
      ))}
    </>
  );
}
