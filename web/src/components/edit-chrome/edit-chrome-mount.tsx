/**
 * EditChromeMount — the ROOT-layout gate for the in-place editor.
 *
 * Rule 1 of the editor: storefront-only. Admin, auth, onboarding, talent
 * profile and every other platform path return null here, from the request
 * headers alone, before anything expensive is imported or read.
 *
 * WHY THE SPLIT. This component is mounted by `src/app/layout.tsx`, so its
 * static import graph is the root layout's graph, i.e. every route's. The
 * editor's server half (`edit-chrome-mount-storefront.tsx`) statically
 * reaches the builder adapters, the composition actions and, through them,
 * the sections registry with every section's Editor and Component plus the
 * builder-node islands: measured on this branch's build, 5.77 MB of client
 * chunks and 63 section modules on `/offline`, a page with one button. The
 * storefront half is reached only through the runtime `import()` below, on
 * the requests that are storefront paths, so a non-storefront route's module
 * graph never contains it.
 *
 * `non-storefront-path.ts` owns the prefix list and the normalisation, shared
 * with the quick-bar mount so the two gates cannot drift.
 */

import { headers } from "next/headers";
import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { HOST_TENANT_SLUG_HEADER, PUBLIC_PATH_PREFIX_HEADER } from "@/lib/saas/scope";
import { isNonStorefrontPath, normalizeStorefrontPath } from "./non-storefront-path";

export async function EditChromeMount() {
  const reqHeaders = await headers();
  const rawPathname = reqHeaders.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const publicPathPrefix = reqHeaders.get(PUBLIC_PATH_PREFIX_HEADER) ?? "";
  const tenantSlug = reqHeaders.get(HOST_TENANT_SLUG_HEADER) ?? "";
  const normalizedPath = normalizeStorefrontPath(rawPathname, publicPathPrefix, tenantSlug);
  if (isNonStorefrontPath(normalizedPath)) return null;

  const { EditChromeStorefrontMount } = await import("./edit-chrome-mount-storefront");
  return <EditChromeStorefrontMount />;
}
