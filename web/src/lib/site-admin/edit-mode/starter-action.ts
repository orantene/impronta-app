"use server";

/**
 * Guided starter composition — one-click "go from empty to beautiful".
 *
 * Fresh tenants land on /admin/site-settings/structure with no sections.
 * The empty-state card gives them a preset tile + button; clicking it
 * runs this action which:
 *
 *   1. Applies the chosen theme preset (agency_branding draft tokens).
 *   2. Creates one draft section per recipe entry with library defaults
 *      (same payloads library-gallery quick-create would produce).
 *   3. Saves the homepage draft composition pointing at those new
 *      sections.
 *
 * The admin lands back on the composer with a working, editable draft.
 * Publishing is still a separate explicit step so they can review
 * before committing to the live site.
 *
 * Failure behaviour
 * Best-effort: if a section fails to create we skip it in the
 * composition. A second run would re-create (and unique-name-collision
 * retry). Preset application or composition save failures abort the
 * action with a descriptive error.
 */

import { sectionUpsertSchema } from "@/lib/site-admin/forms/sections";
import {
  getSectionType,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import { getLibraryDefault } from "@/lib/site-admin/sections/shared/default-content";
import { upsertSection } from "@/lib/site-admin/server/sections";
import {
  ensureHomepageRow,
  saveHomepageDraftComposition,
  loadHomepageForStaff,
} from "@/lib/site-admin/server/homepage";
import { applyThemePreset } from "@/lib/site-admin/server/design";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { randomBytes } from "node:crypto";

export type StarterActionState =
  | { ok: true; createdSections: number; skipped: number; presetSlug: string }
  | { ok: false; error: string; code?: string }
  | undefined;

// ── Recipes ───────────────────────────────────────────────────────────────

interface RecipeEntry {
  slotKey: string;
  sectionTypeKey: SectionTypeKey;
  /** Content overrides on top of getLibraryDefault. */
  propsOverride?: Record<string, unknown>;
}

interface Recipe {
  slug: string;
  label: string;
  presetSlug: string;
  entries: RecipeEntry[];
}

const RECIPES: Record<string, Recipe> = {
  "editorial-bridal": {
    slug: "editorial-bridal",
    label: "Editorial Bridal starter",
    presetSlug: "editorial-bridal",
    entries: [
      { slotKey: "hero", sectionTypeKey: "hero" },
      { slotKey: "trust_band", sectionTypeKey: "trust_strip" },
      { slotKey: "services", sectionTypeKey: "category_grid" },
      { slotKey: "featured", sectionTypeKey: "featured_talent" },
      { slotKey: "process", sectionTypeKey: "process_steps" },
      { slotKey: "destinations", sectionTypeKey: "destinations_mosaic" },
      { slotKey: "gallery", sectionTypeKey: "gallery_strip" },
      { slotKey: "testimonials", sectionTypeKey: "testimonials_trio" },
      { slotKey: "final_cta", sectionTypeKey: "cta_banner" },
    ],
  },
  classic: {
    slug: "classic",
    label: "Classic starter",
    presetSlug: "classic",
    entries: [
      { slotKey: "hero", sectionTypeKey: "hero" },
      { slotKey: "services", sectionTypeKey: "category_grid" },
      { slotKey: "featured", sectionTypeKey: "featured_talent" },
      { slotKey: "final_cta", sectionTypeKey: "cta_banner" },
    ],
  },
  "studio-minimal": {
    slug: "studio-minimal",
    label: "Studio Minimal starter",
    presetSlug: "studio-minimal",
    entries: [
      { slotKey: "hero", sectionTypeKey: "hero" },
      { slotKey: "services", sectionTypeKey: "category_grid" },
      { slotKey: "gallery", sectionTypeKey: "gallery_strip" },
      { slotKey: "final_cta", sectionTypeKey: "cta_banner" },
    ],
  },
  // ── Phase 11 (M11) starter kits — vertical-specific compositions that
  // showcase the M9/M10 section types with rich, real-feeling copy
  // overrides. The result should read as a near-publishable site even
  // before the operator changes anything. ──────────────────────────────
  "wedding-photographer": {
    slug: "wedding-photographer",
    label: "Wedding Photographer",
    presetSlug: "editorial-bridal",
    entries: [
      {
        slotKey: "hero",
        sectionTypeKey: "hero",
        propsOverride: {
          headline: "Quiet, unhurried, in {accent}the same key{/accent}.",
          subheadline:
            "Editorial wedding photography for couples who value presence over performance.",
          primaryCta: { label: "Inquire", href: "/contact" },
          secondaryCta: { label: "See recent work", href: "#work" },
          mood: "editorial",
          overlay: "soft-vignette",
        },
      },
      {
        slotKey: "trust_band",
        sectionTypeKey: "stats",
        propsOverride: {
          eyebrow: "By the numbers",
          headline: "A decade of considered work.",
          items: [
            { value: "12", label: "Years shooting" },
            { value: "180+", label: "Cities" },
            { value: "72", label: "NPS score" },
            { value: "100%", label: "On-time delivery" },
          ],
          variant: "row",
          align: "center",
        },
      },
      {
        slotKey: "services",
        sectionTypeKey: "image_copy_alternating",
        propsOverride: {
          eyebrow: "Signature services",
          headline: "What a booking includes.",
          items: [
            {
              title: "Full-day coverage",
              italicTagline: "From first look to last dance.",
              body: "8 hours of photography, scouting included, delivered as a private gallery within four weeks.",
              side: "image-right",
            },
            {
              title: "Pre-day session",
              italicTagline: "Get used to the camera.",
              body: "60-minute session before the wedding. Often the moment couples relax into being photographed.",
              side: "image-left",
            },
          ],
          variant: "editorial-alternating",
        },
      },
      {
        slotKey: "gallery",
        sectionTypeKey: "gallery_strip",
        propsOverride: {
          eyebrow: "Recent",
          headline: "From the last six months.",
          variant: "mosaic",
        },
      },
      {
        slotKey: "process",
        sectionTypeKey: "process_steps",
        propsOverride: {
          eyebrow: "How it works",
          headline: "Three quiet steps to your gallery.",
          steps: [
            { label: "Inquire", detail: "Tell us your date, location, and mood." },
            { label: "Pre-day session", detail: "Meet, scout, and rehearse the camera." },
            { label: "The day", detail: "We arrive an hour early. You barely notice us." },
          ],
        },
      },
      {
        slotKey: "testimonials",
        sectionTypeKey: "testimonials_trio",
        propsOverride: {
          eyebrow: "Couples + planners",
          headline: "Words from people we worked for.",
        },
      },
      {
        slotKey: "primary",
        sectionTypeKey: "pricing_grid",
        propsOverride: {
          eyebrow: "Investment",
          headline: "Three ways to book.",
          plans: [
            {
              name: "Half-day",
              price: "$2,400",
              cadence: "starting at",
              description: "4 hours of coverage.",
              features: ["Online gallery", "70+ edited images", "Single revision round"],
              ctaLabel: "Inquire",
              ctaHref: "/contact",
              highlighted: false,
            },
            {
              name: "Full-day",
              price: "$4,800",
              cadence: "starting at",
              description: "Most-booked. 8 hours, second photographer optional.",
              features: ["Pre-day session", "8 hours coverage", "200+ edited images", "Two revision rounds"],
              ctaLabel: "Inquire",
              ctaHref: "/contact",
              highlighted: true,
              badge: "Most popular",
            },
            {
              name: "Destination",
              price: "Custom",
              cadence: "scoped per trip",
              description: "Multi-day with travel built in.",
              features: ["Pre-day call", "Full multi-day coverage", "Travel + lodging included", "Three revisions"],
              ctaLabel: "Talk to us",
              ctaHref: "/contact",
              highlighted: false,
            },
          ],
          variant: "cards",
        },
      },
      {
        slotKey: "secondary",
        sectionTypeKey: "faq_accordion",
        propsOverride: {
          eyebrow: "Common questions",
          headline: "Things people ask before they book.",
          items: [
            { question: "How quickly do you respond?", answer: "Within 24 business hours, always." },
            { question: "Do you travel?", answer: "Yes — domestic and international. Travel is billed at cost." },
            { question: "When do we get the photos?", answer: "Private online gallery within four weeks. Sneak-peek within 72 hours." },
            { question: "Can we get the RAW files?", answer: "We don't release RAWs — they're working files, not the finished work. The edit IS the product." },
          ],
          variant: "bordered",
        },
      },
      {
        slotKey: "final_cta",
        sectionTypeKey: "cta_banner",
        propsOverride: {
          eyebrow: "Ready when you are",
          headline: "Tell us about your wedding.",
          copy: "Date, location, and a sentence about you. We'll come back with availability and a starting quote.",
          primaryCta: { label: "Start an inquiry", href: "/contact" },
          variant: "centered-overlay",
        },
      },
    ],
  },
  "talent-agency": {
    slug: "talent-agency",
    label: "Talent Agency",
    presetSlug: "editorial-bridal",
    entries: [
      {
        slotKey: "hero",
        sectionTypeKey: "hero",
        propsOverride: {
          headline: "A {accent}quiet{/accent} bench of working talent.",
          subheadline:
            "Boutique representation for makeup, hair, and styling. Editorial + commercial.",
          primaryCta: { label: "Browse the roster", href: "/directory" },
          secondaryCta: { label: "Submit a request", href: "/contact" },
          mood: "editorial",
        },
      },
      {
        slotKey: "trust_band",
        sectionTypeKey: "marquee",
        propsOverride: {
          items: [
            { text: "Vogue" },
            { text: "Net-a-Porter" },
            { text: "Brides" },
            { text: "WSJ Magazine" },
            { text: "Harper's Bazaar" },
            { text: "Condé Nast Traveler" },
          ],
          speed: "slow",
          direction: "left",
          separator: "diamond",
          variant: "text",
        },
      },
      {
        slotKey: "featured",
        sectionTypeKey: "featured_talent",
        propsOverride: {
          eyebrow: "On the roster",
          headline: "A short list, always on call.",
          sourceMode: "auto_featured_flag",
          limit: 6,
          columnsDesktop: 3,
          variant: "grid",
        },
      },
      {
        slotKey: "services",
        sectionTypeKey: "category_grid",
        propsOverride: {
          eyebrow: "Disciplines",
          headline: "What the bench covers.",
          items: [
            { label: "Makeup", tagline: "Editorial · bridal · commercial" },
            { label: "Hair", tagline: "Cut · color · session styling" },
            { label: "Styling", tagline: "Wardrobe · prop · set" },
            { label: "Photography", tagline: "Portrait · documentary" },
          ],
          variant: "portrait-masonry",
          columnsDesktop: 4,
        },
      },
      {
        slotKey: "process",
        sectionTypeKey: "process_steps",
        propsOverride: {
          eyebrow: "Booking",
          headline: "Three steps from request to crew.",
          steps: [
            { label: "Send a brief", detail: "Date, location, references." },
            { label: "Get a curated short list", detail: "Two to four artists who fit." },
            { label: "Lock the booking", detail: "One contract, one invoice." },
          ],
        },
      },
      {
        slotKey: "secondary",
        sectionTypeKey: "stats",
        propsOverride: {
          eyebrow: "The bench",
          headline: "Numbers that matter.",
          items: [
            { value: "32", label: "Artists on the roster" },
            { value: "12", label: "Cities" },
            { value: "180+", label: "Bookings last year" },
          ],
          variant: "row",
          align: "center",
        },
      },
      {
        slotKey: "final_cta",
        sectionTypeKey: "cta_banner",
        propsOverride: {
          eyebrow: "Open for new clients",
          headline: "Tell us about the brief.",
          copy: "Date, location, mood, budget. We come back with a curated short list.",
          primaryCta: { label: "Send a brief", href: "/contact" },
          variant: "centered-overlay",
        },
      },
    ],
  },
  "wellness-spa": {
    slug: "wellness-spa",
    label: "Wellness / Spa",
    presetSlug: "studio-minimal",
    entries: [
      {
        slotKey: "hero",
        sectionTypeKey: "hero",
        propsOverride: {
          headline: "Slow down. {accent}Stay a while{/accent}.",
          subheadline:
            "A small wellness studio — facials, lymphatic drainage, infrared sauna, massage. By appointment.",
          primaryCta: { label: "Book a session", href: "/contact" },
          mood: "clean",
          overlay: "soft-vignette",
        },
      },
      {
        slotKey: "trust_band",
        sectionTypeKey: "stats",
        propsOverride: {
          eyebrow: "Open since 2019",
          items: [
            { value: "8", label: "Treatment rooms" },
            { value: "4.9", label: "Avg rating" },
            { value: "60min", label: "Default session" },
          ],
          variant: "row",
          align: "center",
        },
      },
      {
        slotKey: "services",
        sectionTypeKey: "image_copy_alternating",
        propsOverride: {
          eyebrow: "Treatments",
          headline: "What we offer.",
          items: [
            { title: "Signature facial", italicTagline: "60-90 min.", body: "Cleanse, exfoliate, mask, massage. Plant-based products throughout.", side: "image-right" },
            { title: "Lymphatic drainage", italicTagline: "Whole-body or targeted.", body: "Manual technique to reduce puffiness and improve circulation. Often booked before events.", side: "image-left" },
            { title: "Infrared sauna", italicTagline: "Solo or paired.", body: "30-45 minute private sessions. Towels and water provided.", side: "image-right" },
          ],
          variant: "editorial-alternating",
        },
      },
      {
        slotKey: "primary",
        sectionTypeKey: "pricing_grid",
        propsOverride: {
          eyebrow: "Pricing",
          headline: "What sessions cost.",
          plans: [
            { name: "Sauna", price: "$45", cadence: "30 min", features: ["Solo or shared", "Towels + water", "Same-day booking"], ctaLabel: "Book", ctaHref: "/contact", highlighted: false },
            { name: "Facial", price: "$160", cadence: "starting at", description: "Most-booked.", features: ["Cleanse + exfoliate", "Mask + massage", "60 min"], ctaLabel: "Book", ctaHref: "/contact", highlighted: true, badge: "Most popular" },
            { name: "Lymphatic drainage", price: "$220", cadence: "60 min", features: ["Whole-body technique", "Pre-event prep", "Optional sauna add-on"], ctaLabel: "Book", ctaHref: "/contact", highlighted: false },
          ],
          variant: "minimal",
        },
      },
      {
        slotKey: "secondary",
        sectionTypeKey: "faq_accordion",
        propsOverride: {
          eyebrow: "Common questions",
          headline: "Things people ask before they book.",
          items: [
            { question: "Do you take walk-ins?", answer: "Sauna walk-ins yes. Facials and treatments require a booking." },
            { question: "Are your products clean / sustainable?", answer: "Yes — plant-based, fragrance-free options available, no parabens or sulfates." },
            { question: "Cancellation policy?", answer: "24-hour notice. Same-day cancellations are charged 50%." },
          ],
          variant: "minimal",
        },
      },
      {
        slotKey: "final_cta",
        sectionTypeKey: "cta_banner",
        propsOverride: {
          eyebrow: "We answer same-day",
          headline: "Send a request.",
          copy: "Tell us what you'd like and your timing. We'll fit you in.",
          primaryCta: { label: "Request a session", href: "/contact" },
          variant: "minimal-band",
          bandTone: "blush",
        },
      },
    ],
  },
  restaurant: {
    slug: "restaurant",
    label: "Restaurant / Cafe",
    presetSlug: "studio-minimal",
    entries: [
      {
        slotKey: "hero",
        sectionTypeKey: "hero",
        propsOverride: {
          headline: "Pasta, wine, and {accent}a long table{/accent}.",
          subheadline: "Open for dinner Wed-Sun. Walk-ins until 9pm.",
          primaryCta: { label: "See the menu", href: "#menu" },
          secondaryCta: { label: "Reserve", href: "/contact" },
          mood: "editorial",
        },
      },
      {
        slotKey: "trust_band",
        sectionTypeKey: "anchor_nav",
        propsOverride: {
          links: [
            { label: "Menu", href: "#menu" },
            { label: "Wine list", href: "#wine" },
            { label: "Hours", href: "#hours" },
            { label: "Reservations", href: "#reserve" },
          ],
          variant: "underline",
          sticky: true,
          align: "center",
        },
      },
      {
        slotKey: "services",
        sectionTypeKey: "image_copy_alternating",
        propsOverride: {
          eyebrow: "On the menu",
          headline: "Three plates we're known for.",
          items: [
            { title: "Cacio e pepe", italicTagline: "Hand-cut tonnarelli.", body: "Pecorino, black pepper, pasta water. Nothing else.", side: "image-right" },
            { title: "Salt-baked branzino", italicTagline: "For two.", body: "Crust broken at the table, fileted, dressed in lemon and olive oil.", side: "image-left" },
            { title: "Tiramisu", italicTagline: "House recipe.", body: "Mascarpone, espresso, no liqueur. Made daily.", side: "image-right" },
          ],
          variant: "editorial-alternating",
        },
      },
      {
        slotKey: "secondary",
        sectionTypeKey: "stats",
        propsOverride: {
          eyebrow: "Hours",
          items: [
            { value: "Wed-Sat", label: "5pm - 10pm" },
            { value: "Sun", label: "5pm - 9pm" },
            { value: "Mon-Tue", label: "Closed" },
          ],
          variant: "row",
          align: "center",
        },
      },
      {
        slotKey: "testimonials",
        sectionTypeKey: "testimonials_trio",
        propsOverride: {
          eyebrow: "Press + guests",
        },
      },
      {
        slotKey: "final_cta",
        sectionTypeKey: "cta_banner",
        propsOverride: {
          eyebrow: "Reservations",
          headline: "Book a table.",
          copy: "Six guests or fewer — book online. Larger parties, ring us.",
          primaryCta: { label: "Reserve", href: "/contact" },
          variant: "minimal-band",
          bandTone: "ivory",
        },
      },
    ],
  },
  "hair-salon": {
    slug: "hair-salon",
    label: "Hair Salon / Studio",
    presetSlug: "classic",
    entries: [
      {
        slotKey: "hero",
        sectionTypeKey: "hero",
        propsOverride: {
          headline: "Color, cut, {accent}cared for{/accent}.",
          subheadline:
            "A small team of senior stylists. By appointment only.",
          primaryCta: { label: "Book a chair", href: "/contact" },
          mood: "clean",
        },
      },
      {
        slotKey: "trust_band",
        sectionTypeKey: "marquee",
        propsOverride: {
          items: [
            { text: "Featured in Allure" },
            { text: "Davines Sustainable Salon" },
            { text: "Wella Master Stylist" },
            { text: "Olaplex Certified" },
            { text: "Open since 2014" },
          ],
          speed: "medium",
          direction: "left",
          separator: "diamond",
          variant: "text",
        },
      },
      {
        slotKey: "services",
        sectionTypeKey: "category_grid",
        propsOverride: {
          eyebrow: "Services",
          headline: "What we do at the chair.",
          items: [
            { label: "Color", tagline: "Balayage, single-process, gloss" },
            { label: "Cut", tagline: "Long, lob, pixie, layered" },
            { label: "Treatment", tagline: "Olaplex, K18, gloss refresh" },
            { label: "Bridal", tagline: "Trial + day-of" },
          ],
          variant: "portrait-masonry",
          columnsDesktop: 4,
        },
      },
      {
        slotKey: "featured",
        sectionTypeKey: "team_grid",
        propsOverride: {
          eyebrow: "The team",
          headline: "Stylists you'll meet.",
          members: [
            { name: "Rae Park", role: "Founder + master colorist" },
            { name: "Cleo Marin", role: "Senior stylist · cut specialist" },
            { name: "Alex Joon", role: "Color + treatment" },
          ],
          variant: "portrait",
          columnsDesktop: 3,
        },
      },
      {
        slotKey: "primary",
        sectionTypeKey: "before_after",
        propsOverride: {
          eyebrow: "Recent transformation",
          headline: "Six hours, one balayage.",
          beforeUrl: "https://images.unsplash.com/photo-1519740019937-d4d18d2ad8e9",
          afterUrl: "https://images.unsplash.com/photo-1521577352947-9bb58764b69a",
          beforeAlt: "Hair before color treatment",
          afterAlt: "Hair after balayage",
          beforeLabel: "Before",
          afterLabel: "After",
          initialPosition: 50,
          ratio: "16/9",
        },
      },
      {
        slotKey: "testimonials",
        sectionTypeKey: "testimonials_trio",
        propsOverride: {
          eyebrow: "Clients",
          headline: "What people leave with.",
        },
      },
      {
        slotKey: "secondary",
        sectionTypeKey: "pricing_grid",
        propsOverride: {
          eyebrow: "Pricing",
          headline: "Honest starting prices.",
          plans: [
            { name: "Cut", price: "$95", cadence: "starting at", features: ["Consult", "Wash + style", "Senior stylist"], ctaLabel: "Book", ctaHref: "/contact", highlighted: false },
            { name: "Color", price: "$220", cadence: "starting at", description: "Most-booked.", features: ["Consult + bowl", "Single-process or balayage", "Gloss + style"], ctaLabel: "Book", ctaHref: "/contact", highlighted: true, badge: "Most popular" },
            { name: "Bridal trial", price: "$180", cadence: "per session", features: ["60-minute trial", "Photo reference review", "Day-of plan"], ctaLabel: "Book", ctaHref: "/contact", highlighted: false },
          ],
          variant: "minimal",
        },
      },
      {
        slotKey: "final_cta",
        sectionTypeKey: "cta_banner",
        propsOverride: {
          eyebrow: "Booking now",
          headline: "Find a chair.",
          copy: "We book by phone or through the form. Same-day requests handled if a stylist has space.",
          primaryCta: { label: "Request a slot", href: "/contact" },
          variant: "minimal-band",
          bandTone: "blush",
        },
      },
    ],
  },
};

function shortToken(): string {
  return randomBytes(3).toString("hex");
}

// ── Action ────────────────────────────────────────────────────────────────

export async function applyStarterComposition(
  _prev: StarterActionState,
  formData: FormData,
): Promise<StarterActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Select an agency workspace first." };
  }

  const slugRaw = formData.get("recipeSlug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  const recipe = RECIPES[slug];
  if (!recipe) {
    return { ok: false, error: `Unknown starter "${slug}".` };
  }

  // Service-role for branding + section inserts; the request itself is
  // requireStaff + tenant-scope guarded.
  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  // 1. Apply preset. Load current branding version first for CAS.
  const { data: branding, error: brandingErr } = await admin
    .from("agency_branding")
    .select("version")
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  if (brandingErr || !branding) {
    return {
      ok: false,
      error:
        "Branding row missing for this workspace. Open Design once to initialise.",
    };
  }
  const presetResult = await applyThemePreset(admin, {
    tenantId: scope.tenantId,
    presetSlug: recipe.presetSlug,
    expectedVersion: (branding as { version: number }).version,
    actorProfileId: auth.user.id,
  });
  if (!presetResult.ok) {
    return {
      ok: false,
      error: presetResult.message ?? "Could not apply the preset.",
      code: presetResult.code,
    };
  }

  // 2. Ensure homepage row exists; we need its id for the composition.
  const ensure = await ensureHomepageRow(admin, {
    tenantId: scope.tenantId,
    locale: DEFAULT_PLATFORM_LOCALE,
    actorProfileId: auth.user.id,
  });
  if (!ensure.ok) {
    return {
      ok: false,
      error: ensure.message ?? "Could not initialise the homepage.",
      code: ensure.code,
    };
  }

  // 3. Create a section per recipe entry.
  const created: Array<{ slotKey: string; sectionId: string; sortOrder: number }> = [];
  let skipped = 0;
  for (const [idx, entry] of recipe.entries.entries()) {
    const registryEntry = getSectionType(entry.sectionTypeKey);
    if (!registryEntry) {
      skipped += 1;
      continue;
    }
    const defaults = getLibraryDefault(entry.sectionTypeKey);
    const name = `${defaults.name} (${recipe.label}) ${shortToken()}`;
    const values = {
      tenantId: scope.tenantId,
      sectionTypeKey: entry.sectionTypeKey,
      schemaVersion: registryEntry.currentVersion,
      props: { ...defaults.props, ...(entry.propsOverride ?? {}) },
      expectedVersion: 0 as const,
      name,
    };
    const parsed = sectionUpsertSchema.safeParse(values);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const result = await upsertSection(admin, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    created.push({
      slotKey: entry.slotKey,
      sectionId: result.data.id,
      sortOrder: idx,
    });
  }

  if (created.length === 0) {
    return {
      ok: false,
      error:
        "Could not create any starter sections — check that every section type is registered on this platform build.",
    };
  }

  // 4. Load homepage row + save composition with the freshly-created sections.
  const state = await loadHomepageForStaff(
    admin,
    scope.tenantId,
    DEFAULT_PLATFORM_LOCALE,
  );
  if (!state) {
    return {
      ok: false,
      error:
        "Homepage row missing after ensureHomepageRow — unexpected. Try again.",
    };
  }
  const slotsMap: Record<string, Array<{ sectionId: string; sortOrder: number }>> = {};
  for (const c of created) {
    (slotsMap[c.slotKey] ?? (slotsMap[c.slotKey] = [])).push({
      sectionId: c.sectionId,
      sortOrder: c.sortOrder,
    });
  }

  const composition = await saveHomepageDraftComposition(admin, {
    tenantId: scope.tenantId,
    values: {
      tenantId: scope.tenantId,
      locale: DEFAULT_PLATFORM_LOCALE,
      expectedVersion: state.page.version,
      metadata: {
        title: state.page.title ?? "Homepage",
        metaDescription: state.page.meta_description ?? undefined,
        introTagline: undefined,
      },
      slots: slotsMap,
    },
    actorProfileId: auth.user.id,
  });
  if (!composition.ok) {
    return {
      ok: false,
      error:
        composition.message ??
        "Starter sections were created but the homepage composition save failed. Reload the composer; the sections are visible in the Sections list.",
      code: composition.code,
    };
  }

  return {
    ok: true,
    createdSections: created.length,
    skipped,
    presetSlug: recipe.presetSlug,
  };
}
