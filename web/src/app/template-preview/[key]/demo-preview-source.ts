/**
 * Demo preview allow-list (P4, 2026-09-28; Track G Wave 1 maison-seed).
 *
 * `?demo=<designSlug>:<demoKey>` asks the theme preview to render demo content
 * instead of the viewer's own. Allowed sources are gallery-meta demos that are
 * either a seeded demo talent (resolved by profileCode) or a Maison starter
 * seed pack (no profile code). Planned demos and unknown keys resolve to null.
 */
import { GALLERY_DESIGNS, getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";

export type DemoTalentPreviewSource = {
  kind: "demo-talent";
  designSlug: string;
  demoKey: string;
  profileCode: string;
  siteSlug: string;
  /** The demo's gallery palette key (the look a gallery card passes by default). */
  defaultPalette: string;
};

export type MaisonSeedPreviewSource = {
  kind: "maison-seed";
  designSlug: string;
  demoKey: string;
  seedKey: string;
  defaultPalette: string;
};

export type DemoPreviewSource = DemoTalentPreviewSource | MaisonSeedPreviewSource;

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
  if (!demo || demo.status !== "built") return null;
  if (demo.source.kind === "demo-talent") {
    return {
      kind: "demo-talent",
      designSlug: design!.slug,
      demoKey: demo.key,
      profileCode: demo.source.profileCode,
      siteSlug: demo.source.siteSlug,
      defaultPalette: demo.defaultPalette,
    };
  }
  if (demo.source.kind === "maison-seed") {
    return {
      kind: "maison-seed",
      designSlug: design!.slug,
      demoKey: demo.key,
      seedKey: demo.source.key,
      defaultPalette: demo.defaultPalette,
    };
  }
  return null;
}

/** Every profile code the preview may render as a demo talent (for audits/tests). */
export function allowedDemoProfileCodes(): Set<string> {
  const out = new Set<string>();
  for (const d of GALLERY_DESIGNS) {
    for (const demo of d.demos) {
      if (demo.status === "built" && demo.source.kind === "demo-talent") out.add(demo.source.profileCode);
    }
  }
  return out;
}

/** Maison seed keys the preview may hydrate (for audits/tests). */
export function allowedMaisonSeedKeys(): Set<string> {
  const out = new Set<string>();
  for (const d of GALLERY_DESIGNS) {
    for (const demo of d.demos) {
      if (demo.status === "built" && demo.source.kind === "maison-seed") out.add(demo.source.key);
    }
  }
  return out;
}
