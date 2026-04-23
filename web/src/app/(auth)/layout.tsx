import Link from "next/link";
import type { Metadata } from "next";

import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getPublicHostContext } from "@/lib/saas";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";

/** Auth screens should not be indexed; page titles use the root template. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Resolve the brand label to render above the auth card.
 *
 * - On an agency/hub host, show the tenant's `public_name`. If the tenant
 *   hasn't set one yet, fall through to the platform brand so the wordmark
 *   is never a stale constant from another tenant.
 * - On app / marketing / unknown hosts, show the platform brand.
 *
 * This fixes the earlier behaviour where the layout hard-coded "IMPRONTA"
 * across every host, creating a brand conflict on the platform workspace.
 */
async function resolveAuthBrand(): Promise<string> {
  const ctx = await getPublicHostContext();
  if (ctx.kind === "agency" || ctx.kind === "hub") {
    const identity = await loadPublicIdentity(ctx.tenantId).catch(() => null);
    return identity?.public_name?.trim() || PLATFORM_BRAND.name;
  }
  return PLATFORM_BRAND.name;
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brandLabel = await resolveAuthBrand();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link
          href="/"
          className="mb-10 font-display text-lg tracking-[0.22em] text-foreground transition-colors hover:text-primary"
        >
          {brandLabel.toUpperCase()}
        </Link>
        <div className="w-full max-w-sm rounded-lg border border-border/50 bg-card/80 p-8 shadow-none backdrop-blur-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
