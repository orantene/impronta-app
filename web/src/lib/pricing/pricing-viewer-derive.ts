/**
 * pricing-viewer-derive.ts: pure mapping from a signed-in identity to the
 * minimal `PricingViewer` the /pricing CTA decision needs (TUL-828).
 */
import type { PricingViewer } from "./pricing-cta-href";

export function derivePricingViewer(input: {
  appUrl: string;
  isTalent: boolean;
  workspaces: { slug: string; role: string }[];
}): PricingViewer {
  const admin = input.workspaces.find(
    (w) => w.slug && (w.role === "owner" || w.role === "admin"),
  );
  if (input.isTalent) {
    return {
      kind: "talent",
      appUrl: input.appUrl,
      adminWorkspaceSlug: admin?.slug ?? null,
    };
  }
  if (admin) {
    return { kind: "workspace", appUrl: input.appUrl, adminWorkspaceSlug: admin.slug };
  }
  return { kind: "anon" };
}
