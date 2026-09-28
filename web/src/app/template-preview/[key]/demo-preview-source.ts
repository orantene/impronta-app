/**
 * Demo preview allow-list (P4, 2026-09-28).
 *
 * `?demo=<designSlug>:<demoKey>` asks the theme preview to render a demo
 * talent's content instead of the viewer's own. The ONLY profiles that can
 * be rendered this way are the demo-talent sources listed in gallery-meta,
 * resolved by `profileCode` server-side. A raw profile id or any code not in
 * gallery-meta resolves to null, and the route falls back to the normal
 * owner-gated hydration. Planned demos never resolve.
 */
import { GALLERY_DESIGNS, getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";

export type DemoPreviewSource = {
  designSlug: string;
  demoKey: string;
  profileCode: string;
  siteSlug: string;
};

const PARAM_RE = /^([a-z0-9][a-z0-9-]{0,63}):([a-z0-9][a-z0-9-]{0,63})$/;

export function resolveDemoPreviewSource(
  routeDesignSlug: string,
  demoParam: string | null | undefined,
): DemoPreviewSource | null {
  const raw = demoParam?.trim().toLowerCase();
  if (!raw) return null;
  const m = PARAM_RE.exec(raw);
  if (!m) return null;
  const [, designSlug, demoKey] = m;
  // A demo renders only inside its own design.
  if (designSlug !== routeDesignSlug.trim().toLowerCase()) return null;
  const design = getGalleryDesign(designSlug!);
  const demo = design?.demos.find((d) => d.key === demoKey);
  if (!demo || demo.status !== "built" || demo.source.kind !== "demo-talent") return null;
  return {
    designSlug: design!.slug,
    demoKey: demo.key,
    profileCode: demo.source.profileCode,
    siteSlug: demo.source.siteSlug,
  };
}

/** Every profile code the preview may render as a demo (for audits/tests). */
export function allowedDemoProfileCodes(): Set<string> {
  const out = new Set<string>();
  for (const d of GALLERY_DESIGNS) {
    for (const demo of d.demos) {
      if (demo.status === "built" && demo.source.kind === "demo-talent") out.add(demo.source.profileCode);
    }
  }
  return out;
}
