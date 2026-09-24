/**
 * /dev/jor-beauty — the Jorg Beauty profile mockup.
 *
 * Production-gated dev harness (same pattern as /dev/noir-qa and
 * /dev/template-preview): a top-level `app/dev/*` route, OUTSIDE the `(public)`
 * group, so it renders without tenant/host context or a Supabase round trip.
 *
 * It renders the REAL template — `MaisonProfileLayout`, the fifth profile
 * template registered in profile-view.tsx — against the seeded Jorg Beauty data
 * in `./seed.ts`. The live page at /t/<code>?template=maison renders the same
 * component from Supabase rows; this route only substitutes the data source and
 * the booking mounts (see DemoBookingSheet).
 *
 * States, for QA:
 *   /dev/jor-beauty              full profile
 *   /dev/jor-beauty?state=empty  a profile that has filled NOTHING optional —
 *                                no catalogue, no portfolio, no portrait, no
 *                                editorial copy. Proves the graceful-degradation
 *                                claim rather than asserting it.
 *   /dev/jor-beauty?state=edge   one service switched to "on request" and one
 *                                unpublished, to show the non-bookable states.
 *   /dev/jor-beauty?state=request a surface that cannot confirm on the spot
 *   /dev/jor-beauty?lang=en      the template's English chrome.
 */

import { notFound } from "next/navigation";

import { createTranslator } from "@/i18n/messages";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import {
  MaisonProfileLayout,
  type MaisonProfileLayoutProps,
} from "@/app/t/[profileCode]/_maison/MaisonProfileLayout";

import { DemoAskPanel } from "./DemoAskPanel";
import { DemoBookingSheet } from "./DemoBookingSheet";
import { DEMO_SHEET_CSS } from "./demo-sheet-styles";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import { loadTalentManagingTenantId } from "@/lib/talent-site/server/load-max-site";

import {
  JOR_BEAUTY_PROFILE_CODE,
  JOR_BIO,
  jorContent,
  jorOfferings,
  JOR_MEDIA,
  JOR_PORTRAIT_URL,
  JOR_SKILLS,
} from "./seed";

const JOR_PROFILE_ID = "f048e578-cbae-45db-9a3b-34239abea136";

export const dynamic = "force-dynamic";

type SP = { state?: string; lang?: string; book?: string };

/** ES / EN switch. Same page, `?lang=` swapped — the template chrome follows. */
function LocaleSwitch({ locale, state }: { locale: string; state: string }) {
  const qs = (l: string) =>
    `/dev/jor-beauty?${new URLSearchParams({ ...(state !== "full" ? { state } : {}), ...(l === "en" ? { lang: "en" } : {}) }).toString()}`;
  return (
    <>
      <a href={qs("es")} aria-current={locale === "es" ? "true" : undefined}>
        ES
      </a>
      <span aria-hidden="true">/</span>
      <a href={qs("en")} aria-current={locale === "en" ? "true" : undefined}>
        EN
      </a>
    </>
  );
}

/** The dev CTA: step 1 of her real booking flow is "choose your service". */
function BookCta({ label }: { label: string }) {
  return (
    <a className="mn-btn mn-btn-primary" href="#servicios" data-demo-cta="book">
      {label}
    </a>
  );
}

export default async function JorBeautyMockupPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const sp = await searchParams;
  const locale = sp.lang === "en" ? "en" : "es";
  const state =
    sp.state === "empty"
      ? "empty"
      : sp.state === "edge"
        ? "edge"
        : sp.state === "request"
          ? "request"
          : "full";

  const t = createTranslator(locale);
  const ui = buildDirectoryUiCopy(t, "Jorg Beauty");

  const liveBook = sp.book === "live";
  let liveTenantId: string | null = null;
  let offerings: TalentOffering[] = jorOfferings(locale);
  if (liveBook) {
    liveTenantId = await loadTalentManagingTenantId(JOR_PROFILE_ID);
    const real = await loadPublicOfferingsForProfile(JOR_PROFILE_ID, locale);
    if (real.length) offerings = real;
  }
  if (state === "empty") offerings = [];
  if (state === "edge") {
    offerings = jorOfferings(locale).map((o) =>
      o.id === "henna-brows"
        ? { ...o, visibility: "on_request", bookingMode: "request", priceDisplay: "quote" }
        : o.id === "gel-pies"
          ? { ...o, status: "draft" }
          : o,
    );
  }

  const empty = state === "empty";

  const props: MaisonProfileLayoutProps = {
    // ── Profile ──────────────────────────────────────────────────────────
    name: "Jorg Beauty",
    firstName: "Jorgelina",
    profileCode: JOR_BEAUTY_PROFILE_CODE,
    profileImageUrl: empty ? null : JOR_PORTRAIT_URL,
    bannerUrl: null,
    isFeatured: false,
    aboutText: empty ? "" : JOR_BIO,
    allTalentTypes: ["Profesional de belleza"],
    livesIn: "Playa del Carmen, Quintana Roo",
    primaryType: locale === "en" ? "Beauty professional" : "Profesional de belleza",
    originallyFrom: null,
    languages: locale === "en" ? ["Spanish", "Basic English"] : ["Español", "Inglés básico"],
    locale,
    talentPlanKey: "talent_pro",
    whitelabel: false,
    maxSiteUrl: null,

    // ── Media ────────────────────────────────────────────────────────────
    galleryItems: empty ? [] : JOR_MEDIA,
    watermarkPreset: null,
    watermarkLogoUrl: null,
    featuredMediaItems: [],
    talentEmbeds: [],
    talentPressItems: [],

    // ── Skills + availability ────────────────────────────────────────────
    resolvedSkills: empty ? [] : JOR_SKILLS,
    availableDaysInNext30: null,
    availabilityDots14d: null,
    nextAvailableDate: null,

    // ── Services ─────────────────────────────────────────────────────────
    packageTeasers: [],
    serviceAreas: [],
    startingFrom: null,
    bookingNote: null,
    serviceMenuItems: [],
    storefrontOfferings: offerings,
    disciplineLabels: {},

    // ── Taxonomy ─────────────────────────────────────────────────────────
    fitLabels: [],
    skills: [],
    industries: [],
    eventTypes: [],
    tags: [],
    fieldVisibility: {
      showFitLabels: false,
      showSkills: false,
      showLanguages: true,
      showIndustries: false,
      showEventTypes: false,
      showTags: false,
    },

    basicInfoDetailRows: [],
    otherDetailRows: [],

    // ── Reviews — NONE seeded. Jorgelina has not supplied any. ───────────
    ratingSummary: { average: 0, count: 0 },
    talentReviews: [],
    testimonials: [],

    // ── Agency overlay (independent professional — no agency) ────────────
    agencyName: null,
    agencyDisplayName: null,
    similarTalent: [],

    // ── Chrome ───────────────────────────────────────────────────────────
    ui,
    t,
    detailsLabels: {
      measurements: "Medidas",
      logistics: "Logística",
      experience: "Experiencia",
      details: "Detalles",
    },
    canonicalShareUrl: "tulala.digital/t/TA-JORGBEAUTY",
    profileSourcePage: "/dev/jor-beauty",
    portalInquiryHref: null,
    resolvedPreview: true,
    hostCtxKind: "platform",
    tenantId: "seed-jor-beauty-tenant",
    tenantSlug: "jor-beauty",
    showFooter: true,

    // ── Maison editorial block (empty state proves the fallbacks) ────────
    maison: empty ? undefined : jorContent(locale),

    // ── Slots ────────────────────────────────────────────────────────────
    localeSwitch: <LocaleSwitch locale={locale} state={state} />,
    // ?state=request stands in for a free-tier / non-agency surface, where
    // appointments-plan-policy caps booking at "request": the page must ask,
    // not promise.
    surfaceBooking: state === "request" ? "request" : "instant",
    slotPicker: null,
    inquireButtonHeader: <BookCta label={locale === "en" ? "Book" : "Reservar"} />,
    inquireButtonSidebar: (
      <BookCta label={locale === "en" ? "Book an appointment" : "Reservar una cita"} />
    ),
    inquireButtonFooter: (
      <BookCta label={locale === "en" ? "Book with Jorg Beauty" : "Reservar con Jorg Beauty"} />
    ),
    shareMenuHeader: null,
    shareMenuSidebar: null,
    hubsIndicator: null,
    discoveryCta: null,
    discoveryCta2: null,
    discoveryCta3: null,
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DEMO_SHEET_CSS }} />
      <MaisonProfileLayout {...props} />
      <DemoBookingSheet locale={locale} mode={liveBook ? "live" : "demo"} tenantId={liveTenantId} />
      <DemoAskPanel />
    </>
  );
}
