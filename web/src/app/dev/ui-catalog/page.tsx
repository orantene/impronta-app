/**
 * /dev/ui-catalog — the component catalog gallery.
 *
 * Sits under `app/dev/*` with `section-sandbox`, `template-preview` and
 * `noir-qa`, and is production-gated the same way. It is deliberately NOT a
 * workspace route: a catalog is a development surface, and putting it behind
 * the tenant shell would mean a host lookup, a role check and a nav entry —
 * three reasons for a designer to not open it.
 *
 * `force-dynamic` so the gate is evaluated per request rather than folded away
 * at build time.
 */

import { notFound } from "next/navigation";

import { UiCatalogGallery } from "@/components/ui/catalog/gallery";

export const dynamic = "force-dynamic";

export default function UiCatalogPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UiCatalogGallery />;
}
