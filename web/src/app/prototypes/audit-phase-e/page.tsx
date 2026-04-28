/**
 * Phase E Final Batch 3 — full audit composition page.
 *
 * Renders 1 Batch-1 section + 1 Batch-2 section + the 7 Batch-3 halfway
 * migrations + all 9 Final Batch 3 sections + the Batch-2 cta_banner so
 * the visual audit can compare shared rhythm and section-specific
 * signatures side-by-side on a real tenant.
 *
 * THIS ROUTE IS TEMPORARY. Delete after Phase E closes and the device
 * pass is done. Not linked from nav. `robots: noindex` to keep crawlers
 * out.
 *
 * Why a static route and not a cms_pages snapshot: the snapshot path on
 * /p/[slug] hit an opaque "Cannot read properties of undefined (reading
 * 'map')" error at SSR that we couldn't isolate in time. Bypassing the
 * snapshot/migration machinery lets us render the same Components with
 * known-good props and get straight to the visual audit.
 */
import type { Metadata } from "next";

// NOTE: intentionally NO PublicHeader / PublicCmsFooterNav imports — those
// hit shared tenant-resolution code that was failing at SSR on this prototype
// route. Bare-bones audit page renders the sections only.

import { ValuesTrioComponent } from "@/lib/site-admin/sections/values_trio/Component";
import { CategoryGridComponent } from "@/lib/site-admin/sections/category_grid/Component";
import { TestimonialsTrioComponent } from "@/lib/site-admin/sections/testimonials_trio/Component";
import { MagazineLayoutComponent } from "@/lib/site-admin/sections/magazine_layout/Component";
import { MasonryComponent } from "@/lib/site-admin/sections/masonry/Component";
import { DestinationsMosaicComponent } from "@/lib/site-admin/sections/destinations_mosaic/Component";
import { VideoReelComponent } from "@/lib/site-admin/sections/video_reel/Component";
import { BeforeAfterComponent } from "@/lib/site-admin/sections/before_after/Component";
import { ScrollCarouselComponent } from "@/lib/site-admin/sections/scroll_carousel/Component";
import { CtaBannerComponent } from "@/lib/site-admin/sections/cta_banner/Component";
// Final Batch 3
import { HeroComponent } from "@/lib/site-admin/sections/hero/Component";
import { HeroSplitComponent } from "@/lib/site-admin/sections/hero_split/Component";
import { LookbookComponent } from "@/lib/site-admin/sections/lookbook/Component";
import { ImageOrbitComponent } from "@/lib/site-admin/sections/image_orbit/Component";
import { LottieComponent } from "@/lib/site-admin/sections/lottie/Component";
import { MapOverlayComponent } from "@/lib/site-admin/sections/map_overlay/Component";
import { StickyScrollComponent } from "@/lib/site-admin/sections/sticky_scroll/Component";
import { CodeSnippetComponent } from "@/lib/site-admin/sections/code_snippet/Component";
import { BookingWidgetComponent } from "@/lib/site-admin/sections/booking_widget/Component";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Phase E Audit",
  robots: { index: false, follow: false },
};

const IMG = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;

// impronta tenant_id (only needed for sections that hit the DB, e.g.
// featured_talent — none of which are in this composition, but the type
// is required).
const IMPRONTA_TENANT = "00000000-0000-0000-0000-000000000001";
const baseProps = { tenantId: IMPRONTA_TENANT, locale: "en", preview: false, sectionId: "" };

export default function AuditPhaseEPage() {
  return (
    <>
      <main className="w-full flex-1">
        {/* ── 1. values_trio (Batch 1) ────────────────────────────────── */}
        <ValuesTrioComponent
          {...baseProps}
          sectionId="audit-vt"
          props={{
            eyebrow: "What we believe",
            headline: "Three principles, one voice.",
            items: [
              { title: "Editorial first", detail: "Every booking earns a story-quality frame." },
              { title: "Trust is the budget", detail: "Calls answered, briefs honored, deadlines kept." },
              { title: "Considered tempo", detail: "We move fast where it matters; slow where the work needs care." },
            ],
            variant: "numbered-cards",
            numberStyle: "serif-italic",
            presentation: {},
          }}
        />

        {/* ── 2. category_grid (Batch 2) ──────────────────────────────── */}
        <CategoryGridComponent
          {...baseProps}
          sectionId="audit-cg"
          props={{
            eyebrow: "Services",
            headline: "A house of beauty, image, and live experience.",
            items: [
              { label: "Editorial", tagline: "Cover stories, lookbooks, magazine work.", iconKey: "camera", href: "#editorial" },
              { label: "Commercial", tagline: "Brand campaigns, product, lifestyle.", iconKey: "film", href: "#commercial" },
              { label: "Live", tagline: "Hostesses, brand ambassadors, event activation.", iconKey: "sparkle", href: "#live" },
            ],
            variant: "small-icon-list",
            columnsDesktop: 3,
            presentation: {},
          }}
        />

        {/* ── 3. testimonials_trio (Batch 3 halfway) ──────────────────── */}
        <TestimonialsTrioComponent
          {...baseProps}
          sectionId="audit-tt"
          props={{
            eyebrow: "What clients say",
            headline: "Calm rigor, on the record.",
            items: [
              { quote: "They handled the campaign like it was their own brand. Nothing slipped.", author: "Liana V.", context: "Brand director", location: "Madrid" },
              { quote: "The casting was right. The shoot was right. The timeline was right.", author: "Marco P.", context: "Creative director", location: "Milan" },
              { quote: "Our hardest week of the year, and we never had to chase them.", author: "Sara D.", context: "Agency producer", location: "London" },
            ],
            variant: "trio-card",
            defaultAccent: "auto",
            presentation: {},
          }}
        />

        {/* ── 4. magazine_layout (Batch 3 halfway) ────────────────────── */}
        <MagazineLayoutComponent
          {...baseProps}
          sectionId="audit-mag"
          props={{
            eyebrow: "From the journal",
            headline: "Stories from inside the studio.",
            hero: {
              title: "The casting note we keep returning to.",
              excerpt: "What a five-line brief teaches us, and why we still re-read it before every shoot.",
              category: "Practice",
              imageUrl: IMG("1604537466158-719b1972feb8"),
              imageAlt: "Studio frame",
              href: "#",
            },
            secondary: [
              { title: "On punctuality", excerpt: "Why on-time is the cheapest gift you can give a creative team.", category: "Operations", imageUrl: IMG("1496359561663-f04c33d3f7df"), imageAlt: "Set", href: "#" },
              { title: "What 'editorial' means here", excerpt: "Three small habits that separate brand work from editorial.", category: "Voice", imageUrl: IMG("1521405617584-1d9ca2c01206"), imageAlt: "Frame", href: "#" },
              { title: "Hiring the second model first", excerpt: "Why secondary casting determines the shoot more than the lead.", category: "Casting", imageUrl: IMG("1503342217505-b0a15ec3261c"), imageAlt: "Casting", href: "#" },
            ],
            presentation: {},
          }}
        />

        {/* ── 5. masonry (Batch 3 halfway) ────────────────────────────── */}
        <MasonryComponent
          {...baseProps}
          sectionId="audit-mason"
          props={{
            eyebrow: "Selected frames",
            headline: "From recent campaigns.",
            items: [
              { src: IMG("1469334031218-e382a71b716b"), alt: "", caption: "Editorial · Tulum" },
              { src: IMG("1494790108377-be9c29b29330"), alt: "", caption: "Commercial · Mexico City" },
              { src: IMG("1517841905240-472988babdf9"), alt: "" },
              { src: IMG("1488426862026-3ee34a7d66df"), alt: "", caption: "Lookbook · Ibiza" },
              { src: IMG("1502685104226-ee32379fefbe"), alt: "" },
              { src: IMG("1539571696357-5a69c17a67c6"), alt: "", caption: "Editorial · Playa del Carmen" },
            ],
            columnsDesktop: 3,
            gap: "standard",
            presentation: {},
          }}
        />

        {/* ── 6. destinations_mosaic (Batch 3 halfway) ────────────────── */}
        <DestinationsMosaicComponent
          {...baseProps}
          sectionId="audit-dm"
          props={{
            eyebrow: "Where we work",
            headline: "Five destinations on a first-name basis.",
            copy: "Local fixers, the right hours of light, and which permits actually require an interview.",
            items: [
              { label: "Tulum", region: "Mexico", tagline: "Beach editorial, jungle interiors.", imageUrl: IMG("1568659585776-cd1a2abf1e62"), href: "#" },
              { label: "Mexico City", region: "Mexico", tagline: "Urban frames, brutalist architecture.", imageUrl: IMG("1518105779142-d975f22f1b0a"), href: "#" },
              { label: "Cancún", region: "Mexico", tagline: "Resorts, swim, accessory work.", imageUrl: IMG("1552733407-5d5c46c3bb3b"), href: "#" },
              { label: "Ibiza", region: "Spain", tagline: "Summer drops, sun-drenched campaigns.", imageUrl: IMG("1507525428034-b723cf961d3e"), href: "#" },
              { label: "Playa del Carmen", region: "Mexico", tagline: "Lookbook quiet, white-sand frames.", imageUrl: IMG("1506929562872-bb421503ef21"), href: "#" },
            ],
            footnote: "Day rates and call sheets vary by destination.",
            variant: "portrait-mosaic",
            presentation: {},
          }}
        />

        {/* ── 7. video_reel (Batch 3 halfway) ─────────────────────────── */}
        <VideoReelComponent
          {...baseProps}
          sectionId="audit-vr"
          props={{
            eyebrow: "Reel",
            headline: "A minute, edited.",
            videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
            posterUrl: IMG("1535016120720-40c646be5580"),
            chapters: [
              { time: 0, label: "Opening" },
              { time: 18, label: "Tulum editorial" },
              { time: 36, label: "Mexico City brand" },
              { time: 52, label: "Closing frame" },
            ],
            ratio: "16/9",
            controls: true,
            loop: false,
            muted: true,
            autoplay: false,
            presentation: {},
          }}
        />

        {/* ── 8. before_after (Batch 3 halfway) ───────────────────────── */}
        <BeforeAfterComponent
          {...baseProps}
          sectionId="audit-ba"
          props={{
            eyebrow: "Process",
            headline: "Before / after.",
            beforeUrl: IMG("1521572163474-6864f9cf17ab"),
            afterUrl: IMG("1492707892479-7bc8d5a4ee93"),
            beforeAlt: "Raw frame",
            afterAlt: "Final frame",
            beforeLabel: "Raw",
            afterLabel: "Final",
            initialPosition: 50,
            ratio: "4/3",
            presentation: {},
          }}
        />

        {/* ── 9. scroll_carousel (Batch 3 halfway) ────────────────────── */}
        <ScrollCarouselComponent
          {...baseProps}
          sectionId="audit-sc"
          props={{
            eyebrow: "Currently shooting",
            headline: "This week, on set.",
            slides: [
              { title: "Loulou Studios SS26", caption: "Tulum · Editorial", imageUrl: IMG("1483985988355-763728e1935b"), href: "#" },
              { title: "Belmond Maroma", caption: "Cancún · Brand", imageUrl: IMG("1444723121867-7a241cacace9"), href: "#" },
              { title: "Studio Six.", caption: "Mexico City · Lookbook", imageUrl: IMG("1556909114-f6e7ad7d3136"), href: "#" },
              { title: "Cala Blanca", caption: "Ibiza · Resort", imageUrl: IMG("1519741347686-c1e0aadf4611"), href: "#" },
              { title: "Casa Aurelia", caption: "Playa del Carmen · Editorial", imageUrl: IMG("1490481651871-ab68de25d43d"), href: "#" },
              { title: "Brand X Hostessing", caption: "Mexico City · Live", imageUrl: IMG("1491349174775-aaafddd81942"), href: "#" },
            ],
            cardWidthVw: 32,
            showProgress: true,
            presentation: {},
          }}
        />

        {/* ══════════════════════════════════════════════════════════════
             FINAL BATCH 3 — 9 sections. Audit: head rhythm unified via
             SectionHead. Hero sections: Phase E comment-only (h1 + no
             eyebrow or split layout exempts them from SectionHead swap).
            ══════════════════════════════════════════════════════════════ */}

        {/* ── 10. hero (Final Batch 3 — exempt, no eyebrow, h1) ───────── */}
        <HeroComponent
          {...baseProps}
          sectionId="audit-hero"
          props={{
            headline: "We exist to make the frame matter.",
            subheadline: "An agency for editorial, commercial, and live talent — working where the light is right.",
            primaryCta: { href: "#", label: "Start a project" },
            secondaryCta: { href: "#", label: "See the roster" },
            overlay: "aurora",
            mood: "editorial",
            presentation: {},
          }}
        />

        {/* ── 11. hero_split (Final Batch 3 — partial, eyebrow aligned, h1) */}
        <HeroSplitComponent
          {...baseProps}
          sectionId="audit-hs"
          props={{
            eyebrow: "The agency",
            headline: "Editorial direction as a service.",
            subheadline: "When the image matters as much as the product.",
            primaryCta: { href: "#", label: "See the roster" },
            imageUrl: IMG("1516726415686-3f4e4b37e93f"),
            imageAlt: "Model in editorial setting",
            side: "media-right",
            variant: "asymmetric",
            presentation: {},
          }}
        />

        {/* ── 12. lookbook (Final Batch 3) ────────────────────────────── */}
        <LookbookComponent
          {...baseProps}
          sectionId="audit-lb"
          props={{
            eyebrow: "Current work",
            headline: "Recent pages.",
            pages: [
              { imageUrl: IMG("1509631179647-0848817b3705"), alt: "Lookbook page 1" },
              { imageUrl: IMG("1469334031218-e382a71b716b"), alt: "Lookbook page 2" },
              { imageUrl: IMG("1494790108377-be9c29b29330"), alt: "Lookbook page 3" },
              { imageUrl: IMG("1517841905240-472988babdf9"), alt: "Lookbook page 4" },
            ],
            variant: "spread",
            ratio: "3/4",
            presentation: {},
          }}
        />

        {/* ── 13. image_orbit (Final Batch 3) ─────────────────────────── */}
        <ImageOrbitComponent
          {...baseProps}
          sectionId="audit-io"
          props={{
            eyebrow: "Signature talent",
            headline: "One frame, many stories.",
            imageUrl: IMG("1524504388-59ecd8b04dc9"),
            imageAlt: "Talent editorial frame",
            tags: [
              { x: 22, y: 18, label: "Valentina M.", detail: "Editorial · Mexico City" },
              { x: 68, y: 42, label: "Luna R.", detail: "Commercial · Tulum" },
              { x: 40, y: 75, label: "Sofia A.", detail: "Live · Ibiza" },
            ],
            ratio: "4/3",
            presentation: {},
          }}
        />

        {/* ── 14. lottie (Final Batch 3) ──────────────────────────────── */}
        <LottieComponent
          {...baseProps}
          sectionId="audit-lt"
          props={{
            eyebrow: "Process",
            headline: "From brief to booking.",
            caption: "A five-step flow, animated.",
            src: "https://assets3.lottiefiles.com/packages/lf20_UJNc2t.json",
            trigger: "autoplay",
            loop: true,
            speed: 1,
            ratio: "1/1",
            maxWidth: 480,
            presentation: {},
          }}
        />

        {/* ── 15. map_overlay (Final Batch 3) ─────────────────────────── */}
        <MapOverlayComponent
          {...baseProps}
          sectionId="audit-mo"
          props={{
            eyebrow: "Basecamp",
            headline: "Find us in Mexico City.",
            mapEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3763.261673009805!2d-99.16584492378258!3d19.419443840765694!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x85d1ff3e5f6c9bfb%3A0x2af67c0b5e9e6b0!2sRoma%20Norte%2C%20Miguel%20Hidalgo%2C%20Ciudad%20de%20M%C3%A9xico%2C%20CDMX!5e0!3m2!1sen!2smx!4v1714000000000!5m2!1sen!2smx",
            card: {
              title: "Impronta Studio",
              address: "Colonia Roma Norte, CDMX 06700",
              hours: "Mon–Fri · 10:00 – 18:00",
              body: "Walk-ins welcome on request.\n\nParking available on Orizaba.",
            },
            side: "card-right",
            ratio: "16/9",
            presentation: {},
          }}
        />

        {/* ── 16. sticky_scroll (Final Batch 3) ───────────────────────── */}
        <StickyScrollComponent
          {...baseProps}
          sectionId="audit-ss"
          props={{
            eyebrow: "How it works",
            headline: "Three calls, one campaign.",
            imageUrl: IMG("1554048612-994c4efbe79a"),
            imageAlt: "On-set production moment",
            blocks: [
              { title: "The brief call", body: "Thirty minutes. We ask about the product, the budget, the deadline, and what 'right' looks like to you." },
              { title: "The casting note", body: "Within 24 hours we return a short brief: who we have in mind, why, and a fee range.\n\nNo commitment at this stage." },
              { title: "The shoot", body: "We handle the call sheet, the fixers, the permits, and the edit schedule so you can focus on the creative." },
            ],
            side: "media-left",
            variant: "minimal",
            presentation: {},
          }}
        />

        {/* ── 17. code_snippet (Final Batch 3) ────────────────────────── */}
        <CodeSnippetComponent
          {...baseProps}
          sectionId="audit-cs"
          props={{
            eyebrow: "Developer",
            headline: "Integrate the roster API.",
            filename: "roster.ts",
            language: "typescript",
            code: `import { createClient } from "@tulala/sdk";

const client = createClient({ apiKey: process.env.TULALA_API_KEY });

// Fetch all active talent for a tenant
const roster = await client.talent.list({
  tenantId: "00000000-0000-0000-0000-000000000001",
  filters: { status: "active", category: "editorial" },
});

roster.items.forEach((talent) => {
  console.log(talent.name, talent.rateRange);
});`,
            showLineNumbers: true,
            showCopyButton: true,
            variant: "dark",
            presentation: {},
          }}
        />

        {/* ── 18. booking_widget (Final Batch 3) ──────────────────────── */}
        <BookingWidgetComponent
          {...baseProps}
          sectionId="audit-bw"
          props={{
            eyebrow: "Inquire",
            headline: "Ready when you are.",
            intro: "Use the calendar below or write to us directly — we reply within 24 hours.",
            url: "https://calendly.com/impronta-models/consultation",
            variant: "button",
            buttonLabel: "Open booking calendar",
            ratio: "4/3",
            presentation: {},
          }}
        />

        {/* ── 19. cta_banner (Batch 2) ────────────────────────────────── */}
        <CtaBannerComponent
          {...baseProps}
          sectionId="audit-cb"
          props={{
            eyebrow: "Start a project",
            headline: "Tell us what you're building.",
            copy: "We'll come back the same day with a casting note, a fee range, and a date that works.",
            reassurance: "We answer within 24 hours, calendar-aware.",
            primaryCta: { href: "/contact", label: "Start a request" },
            overlayOpacity: 45,
            variant: "centered-overlay",
            imageSide: "right",
            bandTone: "ivory",
            insetCard: true,
            presentation: {},
          }}
        />
      </main>
    </>
  );
}
