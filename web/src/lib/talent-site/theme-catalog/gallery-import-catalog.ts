/**
 * Wave 3: import catalogs for every finished design.
 * Maison seed → existing starter pack. Demo-talent → content fixture groups
 * (services, faqs, section texts). Groups with zero items are omitted.
 */
import { DEMO_REGISTRY } from "@/lib/talent-site/demos/registry";
import { loadDemoContentFixture } from "@/lib/talent-site/demos/content-fixture";
import {
  loadMaisonStarterCatalog,
  type MaisonStarterCatalog,
  type MaisonStarterFaq,
  type MaisonStarterSectionText,
  type MaisonStarterService,
} from "@/lib/talent-site/theme-catalog/maison/maison-starter-catalog";
import { getGalleryDesign, type GalleryDemo } from "@/lib/talent-site/theme-catalog/gallery-meta";

export type GalleryImportCatalog = MaisonStarterCatalog & {
  source: "maison-seed" | "demo-fixture";
  thumbAccent?: string;
};

function slugKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Prefix keys with fixture id so idempotency/undo cannot collide across demos. */
function namespacedKey(fixtureKey: string, kind: "svc" | "faq" | "sec", rest: string): string {
  return `${fixtureKey}:${kind}:${rest}`;
}

function fromFixture(fixtureKey: string, demoSlug: string): GalleryImportCatalog | null {
  try {
    const fx = loadDemoContentFixture(fixtureKey);
    const services: MaisonStarterService[] = (fx.services ?? []).map((s) => ({
      key: namespacedKey(fixtureKey, "svc", s.id || slugKey(s.name)),
      name: s.name,
      category: s.category || "General",
      priceMxn: s.priceAmount ?? 0,
      durationMin: s.durationMinutes ?? 0,
      imageReuse: "preview_only" as const,
    }));
    const faqs: MaisonStarterFaq[] = (fx.faq?.items ?? []).map((q, i) => ({
      key: namespacedKey(fixtureKey, "faq", `${i}:${slugKey(q.q.slice(0, 40))}`),
      question: q.q,
    }));
    // Biography/About copy is not written by commitStarterImportWithCatalog yet —
    // hide until that path persists section text (otherwise "content added" is a no-op).
    const sectionText: MaisonStarterSectionText[] = [];
    const total = services.length + faqs.length + sectionText.length;
    if (total === 0) return null;
    return {
      demoSlug,
      services,
      faqs,
      sectionText,
      imagesLicensedForReuse: false,
      counts: {
        services: services.length,
        faq_prompts: faqs.length,
        section_text: sectionText.length,
        total,
      },
      source: "demo-fixture",
    };
  } catch {
    return null;
  }
}

/** Resolve an import catalog for the active design/demo. */
export function galleryImportCatalogFor(
  designSlug: string,
  demo: GalleryDemo | null,
): GalleryImportCatalog | null {
  if (!demo || demo.status !== "built") return null;
  if (demo.source.kind === "maison-seed") {
    return { ...loadMaisonStarterCatalog(), source: "maison-seed" };
  }
  if (demo.source.kind === "demo-talent") {
    const profileCode = demo.source.profileCode;
    const entry = DEMO_REGISTRY.find((d) => d.profileCode === profileCode);
    const fixtureKey =
      entry?.contentFixture ??
      (designSlug === "maison-v2" || designSlug === "folio" || designSlug === "gridline"
        ? designSlug
        : null);
    if (!fixtureKey) return null;
    return fromFixture(fixtureKey, `${designSlug}:${demo.key}`);
  }
  return null;
}

/**
 * Recover the catalog used by an import batch (`source_demo_slug`).
 * Maison seed batches store `maison-nails`; fixture batches store `designSlug:demoKey`.
 */
export function galleryImportCatalogForBatchSlug(
  sourceDemoSlug: string,
): GalleryImportCatalog | null {
  if (!sourceDemoSlug) return null;
  if (sourceDemoSlug === "maison-nails") {
    return { ...loadMaisonStarterCatalog(), source: "maison-seed" };
  }
  const sep = sourceDemoSlug.indexOf(":");
  if (sep <= 0) return null;
  const designSlug = sourceDemoSlug.slice(0, sep);
  const demoKey = sourceDemoSlug.slice(sep + 1);
  const design = getGalleryDesign(designSlug);
  if (!design) return null;
  const demo = design.demos.find((d) => d.key === demoKey) ?? null;
  return galleryImportCatalogFor(designSlug, demo);
}

/** True when the demo can show a non-empty import chooser. */
export function demoHasImportCatalog(designSlug: string, demo: GalleryDemo | null): boolean {
  return galleryImportCatalogFor(designSlug, demo) != null;
}
