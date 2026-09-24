/**
 * NoirProfileLayout — the "Noir & Or" editorial talent profile, rebuilt as a
 * client decision + booking experience (2026-09-18).
 *
 * Same props as LightProfileLayout (LightProfileLayoutProps), so page.tsx and
 * the directory modal swap templates with one dispatch variable. Every live
 * slot survives: inquire / instant-book, share, save / discovery, hubs,
 * slot picker, reviews + testimonials, services / storefront, the portfolio
 * lightbox (watermark-aware), featured media, similar-talent actions.
 *
 * Page story (visual → information → visual → action, twice):
 *   1. HERO          banner, name, one signal line, ONE primary CTA
 *   2. FIRST LOOK    four-image editorial strip (lightbox tiles)
 *   3. INTRO + RAIL  positioning line + 8 vitals, full comp card behind <details>
 *   4. CINEMATIC     first landscape image, full bleed
 *   5. REEL          featured media
 *   6. CAPABILITIES  disciplines · industries / events · languages & logistics
 *   7. AVAILABILITY  next date, 14-day strip, notice, travel, reply time
 *   8. SERVICES      reused blocks, plan-gated
 *   9. TRUST         reviews + testimonials
 *  10. PORTFOLIO     the rest of the gallery, masonry, same lightbox
 *  11. BOARD         similar talent
 *  12. CLOSE         "Work with {Name}." + slot picker
 * Sticky: top rail (desktop) / bottom bar (phone), stowed while the hero CTA
 * is on screen. variant="modal" tightens the hero and drops 4–6 and 11.
 *
 * Server component — no hooks. The portfolio strip and masonry are two runs
 * of ONE PortfolioGalleryLightbox, with the middle sections passed as its
 * `after` node, so arrow keys walk the whole portfolio.
 */

import Image from "next/image";
import Link from "next/link";
import { pickLocale } from "@/lib/i18n/pick-locale";

import { ServicesBlock } from "../_light/ServicesBlock";
import { ServiceMenuBlock } from "../_light/ServiceMenuBlock";
import { TalentStorefront } from "../_shared/TalentStorefront";
import { PortfolioGalleryLightbox } from "@/components/directory/portfolio-gallery-lightbox";
import { PublicFeaturedMedia } from "@/components/talent/connections/PublicFeaturedMedia";
import { TalentExtrasBands } from "../_shared/TalentExtrasBands";
import { TalentReviewsSection } from "@/components/reviews/TalentReviewsSection";
import { TestimonialsSection } from "@/components/reviews/TestimonialsSection";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { NoirBookbarAutoHide, NoirReveal } from "./NoirReveal";
import { NOIR_CSS } from "./noir-css";
import { NoirStatRail, type NoirDetailRow } from "./NoirStatRail";
import { planNoirPortfolio } from "./noir-portfolio";
import {
  heroRatingChipLabel,
  type LightProfileLayoutProps,
} from "../_light/LightProfileLayout";
import { ExclusiveRepresentationLine } from "../_shared/ExclusiveRepresentationLine";
import { meetsCredibilityFloor } from "@/lib/reviews/craft-standing";
import { ReviewsAnchorLink } from "../_shared/ReviewsAnchorLink";

/** Noir palette as `--plt-*` overrides so reused light-theme blocks go dark. */
const noirVars: Record<string, string> = {
  "--plt-bg": "#0b0a0d",
  "--plt-bg-raised": "#161320",
  "--plt-bg-elevated": "#1b1722",
  "--plt-bg-deep": "#100e13",
  "--plt-bg-inverse": "#ece4d3",
  "--plt-bg-inverse-soft": "rgba(236,228,211,0.12)",
  "--plt-ink": "#ece4d3",
  "--plt-ink-soft": "rgba(236,228,211,0.74)",
  "--plt-ink-strong": "#fbf5e8",
  "--plt-muted": "rgba(236,228,211,0.6)",
  // WCAG AA: 0.56 measures 5.30:1 on the ground for 10px text.
  "--plt-muted-soft": "rgba(236,228,211,0.56)",
  "--plt-on-inverse": "#161108",
  "--plt-on-inverse-muted": "rgba(22,17,8,0.66)",
  "--plt-on-inverse-soft": "rgba(22,17,8,0.82)",
  "--plt-hairline": "rgba(198,161,78,0.26)",
  "--plt-hairline-strong": "rgba(198,161,78,0.46)",
  "--plt-hairline-inverse": "rgba(236,228,211,0.16)",
  "--plt-hairline-inverse-strong": "rgba(236,228,211,0.3)",
  "--plt-forest": "#c6a14e",
  "--plt-forest-deep": "#9c7d35",
  "--plt-forest-bright": "#e0c074",
  "--plt-forest-soft": "rgba(198,161,78,0.14)",
  "--plt-forest-ring": "rgba(198,161,78,0.4)",
  "--plt-forest-glow": "rgba(198,161,78,0.28)",
  "--plt-forest-on": "#161108",
  "--plt-accent": "#e0c074",
  "--plt-accent-soft": "rgba(224,192,116,0.4)",
  "--plt-shadow-sm": "0 4px 14px -10px rgba(0,0,0,0.7)",
  "--plt-shadow-md": "0 12px 30px -18px rgba(0,0,0,0.75)",
  "--plt-shadow-lg": "0 26px 60px -34px rgba(0,0,0,0.85)",
  "--plt-shadow-forest": "0 14px 34px -18px rgba(198,161,78,0.55)",
  "--plt-font-display": "'Cormorant Garamond', Georgia, serif",
  "--plt-font-body": "'Jost', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  "--plt-font-sans": "'Jost', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  "--plt-font-mono": "'Jost', sans-serif",
  "--plt-radius-sm": "0px",
  "--plt-radius-md": "0px",
  "--plt-radius-lg": "0px",
  "--plt-radius-xl": "0px",
};

function Silhouette({ size = "46%" }: { size?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.6 19.4c0-3.7 3.2-6.2 7.4-6.2s7.4 2.5 7.4 6.2c0 .5-.4.8-.9.8H5.5c-.5 0-.9-.3-.9-.8Z" />
    </svg>
  );
}

const ShareGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v8h16v-8M12 3v13M8 7l4-4 4 4" /></svg>
);

/** Rows consumed by the intro / capabilities / availability modules, so the
 *  comp card never repeats them. Matched on the catalog key. */
const CONSUMED_KEYS = new Set([
  "availability.available_for",
  "availability.status",
  "availability.advance_notice_hours",
  "identity.response_time",
  "experience.notable_work",
  "experience.professional_highlights",
  "experience.level",
]);

function firstSentence(text: string): { lead: string; rest: string } {
  const t = text.trim();
  if (!t) return { lead: "", rest: "" };
  const m = t.match(/^(.{20,180}?[.!?])\s+([\s\S]*)$/);
  if (m) return { lead: m[1], rest: m[2] };
  return t.length <= 180 ? { lead: t, rest: "" } : { lead: "", rest: t };
}

function formatDay(iso: string, locale: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

const LEVEL: Record<string, { en: string; es: string }> = {
  beginner: { en: "Beginner", es: "Principiante" },
  intermediate: { en: "Intermediate", es: "Intermedio" },
  advanced: { en: "Advanced", es: "Avanzado" },
  expert: { en: "Expert", es: "Experto" },
};

export function NoirProfileLayout(props: LightProfileLayoutProps) {
  const {
    name, firstName, profileCode, profileImageUrl, bannerUrl, isFeatured, aboutText,
    allTalentTypes, primaryType, livesIn, languages, locale, maxSiteUrl,
    galleryItems, watermarkPreset, watermarkLogoUrl, featuredMediaItems, resolvedSkills,
    availableDaysInNext30, availabilityDots14d, nextAvailableDate, packageTeasers,
    serviceAreas, startingFrom, bookingNote, serviceMenuItems, storefrontOfferings,
    disciplineLabels, industries, eventTypes, tags, fieldVisibility, basicInfoDetailRows,
    otherDetailRows, ratingSummary, talentReviews, testimonials = [], heroRating,
    agencyName, agencyDisplayName, similarTalent, ui, t, profileSourcePage,
    resolvedPreview, showFooter, variant = "page", inquireButtonHeader,
    inquireButtonSidebar, inquireButtonFooter, shareMenuSidebar, discoveryCta2,
    discoveryCta3, hubsIndicator, slotPicker,
  } = props;

  const isModal = variant === "modal";
  const agency = agencyDisplayName ?? agencyName;
  const es = locale === "es";
  const L = (en: string, esText: string) => pickLocale(locale, { en, es: esText });

  // ── Identity ────────────────────────────────────────────────────────────
  const parentType = primaryType ?? allTalentTypes[0] ?? null;
  const childTypes = allTalentTypes.filter((tt) => tt !== parentType);
  const portraitImg = profileImageUrl ?? galleryItems[0]?.url ?? null;
  const langShort = languages.map((l) => l.split(" (")[0].trim()).filter(Boolean);
  const travels = serviceAreas.some((s) => s.service_kind === "travel_to");
  const remoteOnly = serviceAreas.length > 0 && serviceAreas.every((s) => s.service_kind === "remote_only");

  // ── Rows → modules ─────────────────────────────────────────────────────
  const allRows: NoirDetailRow[] = [...basicInfoDetailRows, ...otherDetailRows];
  const row = (key: string) => allRows.find((r) => r.key === key)?.value ?? null;
  const travelScopeRow = allRows.find((r) => /travel_scope/.test(r.key));
  const availableFor = row("availability.available_for");
  const notableWork = row("experience.notable_work");
  const highlights = row("experience.professional_highlights");
  const notice = row("availability.advance_notice_hours");
  const replyTime = row("identity.response_time");
  const bookingStatus = row("availability.status");
  const experienceLevel = row("experience.level");
  const compRows = allRows.filter(
    (r) => !CONSUMED_KEYS.has(r.key) && r.key !== travelScopeRow?.key,
  );

  const about = firstSentence(aboutText);
  const lead = about.lead || availableFor || notableWork || "";
  const body = about.lead ? about.rest : about.rest || highlights || (lead !== notableWork ? notableWork : null) || "";

  // ── Availability signal (one line in the hero, a band further down) ────
  const hasAvailData = availableDaysInNext30 != null || Boolean(nextAvailableDate) || Boolean(availabilityDots14d);
  const availableNow = Boolean(availabilityDots14d && availabilityDots14d[0] === "·") ||
    (availableDaysInNext30 != null && availableDaysInNext30 >= 25);
  const signal = nextAvailableDate && !availableNow
    ? L(`Available ${formatDay(nextAvailableDate, locale)}`, `Disponible ${formatDay(nextAvailableDate, locale)}`)
    : availableNow || (bookingStatus && /^(Available now|Disponible ahora)$/.test(bookingStatus))
      ? L("Available now", "Disponible ahora")
      : bookingStatus ?? (hasAvailData ? L("Limited availability", "Disponibilidad limitada") : L("By request", "Bajo pedido"));
  const signalSoft = !/^(Available|Disponible)/.test(signal);
  const dots = availabilityDots14d ? availabilityDots14d.slice(0, 14).split("") : null;

  // ── Commerce ───────────────────────────────────────────────────────────
  const hasServices = packageTeasers.length > 0 || serviceAreas.length > 0 || Boolean(startingFrom) || Boolean(bookingNote);
  const hasStorefront = storefrontOfferings.length > 0;
  const hasServiceMenu = hasStorefront || serviceMenuItems.length > 0;
  const hasCommerce = hasServices || hasServiceMenu;
  const bookable = Boolean(slotPicker) || hasStorefront;
  const primaryLabel = bookable ? L("Check availability", "Ver disponibilidad") : L(`Inquire about ${firstName}`, `Consultar por ${firstName}`);
  // When the storefront slot picker owns booking, inquireButtons() is null and
  // the primary CTA is an anchor to the closing moment where the picker lives.
  const primary = (slotNode: React.ReactNode, compact = false) =>
    slotNode ? (
      <div className={`nf-cta-slot${compact ? " nf-cta-slot--compact" : ""}`}>{slotNode}</div>
    ) : (
      <div className="nf-cta-slot"><a href="#nf-book" className="nf-btn nf-btn--primary">{primaryLabel}</a></div>
    );

  // ── Portfolio plan ─────────────────────────────────────────────────────
  const splitHero = !bannerUrl;
  const stripN = splitHero && galleryItems.length >= 6 ? 3 : 0;
  const plan = planNoirPortfolio(galleryItems, stripN);
  const lightboxItems = [...plan.look, ...plan.rest];

  // ── Capabilities ───────────────────────────────────────────────────────
  const disciplines = [...resolvedSkills]
    .sort((a, b) => (a.relationship_type === "primary_role" ? -1 : b.relationship_type === "primary_role" ? 1 : a.display_order - b.display_order))
    .map((s) => {
      const lvl = s.proficiency_level ? pickLocale(locale, LEVEL[s.proficiency_level] ?? { en: s.proficiency_level, es: s.proficiency_level }) : null;
      const yrs = s.years_experience ? L(`${s.years_experience} yrs`, `${s.years_experience} años`) : null;
      return {
        id: s.skill_term_id,
        name: es && s.skill_name_es ? s.skill_name_es : s.skill_name_en,
        prime: s.relationship_type === "primary_role",
        meta: [s.relationship_type === "primary_role" ? L("Primary", "Principal") : null, yrs, lvl].filter(Boolean).join(" · "),
      };
    });
  const disciplineList = disciplines.length > 0
    ? disciplines
    : [parentType, ...childTypes].filter((x): x is string => Boolean(x)).map((n, i) => ({ id: n, name: n, prime: i === 0, meta: i === 0 ? L("Primary", "Principal") : "" }));
  const showIndustries = fieldVisibility.showIndustries && industries.length > 0;
  const showEvents = (fieldVisibility.showEventTypes && eventTypes.length > 0) || (fieldVisibility.showTags && tags.length > 0);
  const eventList = [...(fieldVisibility.showEventTypes ? eventTypes : []), ...(fieldVisibility.showTags ? tags : [])];
  const travelLine = remoteOnly
    ? L("Remote only", "Solo remoto")
    : travelScopeRow?.value
      ? L(`Travels ${travelScopeRow.value.toLowerCase()}`, `Viaja: ${travelScopeRow.value.toLowerCase()}`)
      : travels ? L("Travels worldwide", "Viaja a todo el mundo") : null;
  const logistics: Array<[string, string]> = [
    langShort.length ? [L("Speaks", "Habla"), langShort.join(" · ")] : null,
    travelLine ? [L("Travel", "Viajes"), travelLine] : null,
    notice ? [L("Notice", "Antelación"), notice] : null,
    replyTime ? [L("Replies", "Responde"), replyTime] : null,
    experienceLevel ? [L("Level", "Nivel"), experienceLevel] : null,
  ].filter((x): x is [string, string] => Boolean(x));
  const hasCaps = !isModal && (disciplineList.length > 0 || showIndustries || showEvents || logistics.length > 0);
  const showAvailBand = hasAvailData || Boolean(bookingStatus) || Boolean(notice);

  const labels = {
    portfolio: L("Portfolio", "Portafolio"),
    images: (n: number) => L(`${n} images`, `${n} imágenes`),
    viewAll: L("View all", "Ver todo"),
    compCard: L("Comp card", "Ficha"),
    services: L("Services", "Servicios"),
    book: bookable ? L("Book", "Reservar") : L("Inquire", "Consultar"),
    represented: agency ? L(`Represented by ${agency}`, `Representada por ${agency}`) : null,
    featured: ui.card.featuredLabel,
    reel: L("Reel", "Reel"),
    reelTitle: L("On set, in motion.", "En set, en movimiento."),
    reelBody: L(`Featured media chosen by ${firstName}.`, `Medios destacados elegidos por ${firstName}.`),
    disciplines: L("Disciplines", "Disciplinas"),
    industries: L("Industries", "Industrias"),
    events: L("Events", "Eventos"),
    logistics: L("Languages & logistics", "Idiomas y logística"),
    notable: L("Notable work", "Trabajos destacados"),
    availability: L("Availability", "Disponibilidad"),
    nextAvailable: L("Next available", "Próxima fecha"),
    onRequest: L("On request", "Bajo pedido"),
    checkDates: bookable ? L("Check dates", "Ver fechas") : L("Send dates & brief", "Enviar fechas y brief"),
    servicesTitle: L("Services & packages.", "Servicios y paquetes."),
    servicesNote: L("Prices shown are starting points; describe the job for a quote.", "Los precios son orientativos; describe el trabajo para una cotización."),
    reviewsEyebrow: L("Client reviews", "Reseñas de clientes"),
    board: L("More from the board.", "Más del board."),
    browse: L("Browse all talent", "Ver todo el talento"),
    closeEyebrow: bookable ? L("Book", "Reservar") : L("Inquire", "Consultar"),
    closeBody: bookable
      ? L(`Pick a date and a service; a deposit holds it. Or send a brief and ${firstName} replies ${replyTime ? `within ${replyTime}` : "soon"}.`, `Elige fecha y servicio; un depósito la reserva. O envía un brief y ${firstName} responde ${replyTime ? `en ${replyTime}` : "pronto"}.`)
      : t("public.profile.footerCtaBody"),
    openFull: L("Open full profile", "Abrir perfil completo"),
    fullHint: L(`full profile, ${galleryItems.length} images, comp card`, `perfil completo, ${galleryItems.length} imágenes, ficha`),
    share: L("Share", "Compartir"),
    site: L("Visit my site", "Visita mi sitio"),
  };

  const tile = (key: string, url: string | null, alt: string) => (
    <div key={key}>
      {url ? <Image src={url} alt={alt} fill quality={85} sizes="(min-width: 900px) 20vw, 33vw" /> : <div className="nf-portrait__mono"><Silhouette size="40%" /></div>}
    </div>
  );

  // ── Hero ───────────────────────────────────────────────────────────────
  const heroLine = (
    <div className="nf-hero__line">
      <span className={`nf-avail${signalSoft ? " nf-avail--soft" : ""}`}><i aria-hidden="true" />{signal}</span>
      {livesIn ? <><span className="nf-dot" /><span>{livesIn}</span></> : null}
      {labels.represented ? <><span className="nf-dot" /><span>{labels.represented}</span></> : null}
      {heroRating && meetsCredibilityFloor(heroRating.ratingCount) ? (
        <><span className="nf-dot" /><ReviewsAnchorLink className="nf-hero__rating">{heroRatingChipLabel(heroRating.ratingAvg, heroRating.ratingCount, locale)}</ReviewsAnchorLink></>
      ) : null}
      {isFeatured ? <><span className="nf-dot" /><span style={{ color: "var(--nf-champ)" }}>{labels.featured}</span></> : null}
      {hubsIndicator ? <span className="nf-hero__hubs">{hubsIndicator}</span> : null}
    </div>
  );
  const heroCta = (
    <div className="nf-hero__cta">
      <div className="nf-actions">
        {primary(inquireButtonHeader)}
        {discoveryCta2 ? <div className="nf-side-slot nf-side-slot--hero">{discoveryCta2}</div> : null}
        {shareMenuSidebar ? (
          <details className="nf-share">
            <summary aria-label={labels.share} title={labels.share}><ShareGlyph /></summary>
            <div className="nf-share__pop">{shareMenuSidebar}</div>
          </details>
        ) : null}
      </div>
      <span className="nf-hero__hint">
        {bookable && startingFrom ? <>{L("Instant booking · from", "Reserva inmediata · desde")} <b>{startingFrom}</b></> : replyTime ? L(`Replies within ${replyTime} · no commitment`, `Responde en ${replyTime} · sin compromiso`) : L("No commitment", "Sin compromiso")}
      </span>
      {maxSiteUrl ? <a href={maxSiteUrl} target="_blank" rel="noopener noreferrer" className="nf-btn nf-btn--text">{labels.site} <span className="nf-arr">→</span></a> : null}
    </div>
  );
  const heroText = (
    <div>
      {parentType ? <span className="nf-eyebrow">{parentType}</span> : null}
      <h1>{name}</h1>
      {heroLine}
      {agency && props.isExclusive ? (
        <ExclusiveRepresentationLine agency={agency} t={t} className="nf-intro__exclusive text-[11px] tracking-[0.02em]" style={{ color: "rgba(236,228,211,0.6)" }} tone="dark" />
      ) : null}
    </div>
  );

  // ── Middle: everything between the first look and the masonry ─────────
  const middle = (
    <>
      <section className="nf-wrap nf-sec nf-intro" id="nf-facts" data-nf-reveal>
        <div>
          {lead ? <p className="nf-intro__lead">{lead}</p> : null}
          {body ? <p className="nf-intro__body">{body}</p> : null}
          <div className="nf-intro__facts">
            {langShort.length ? <span><b>{L("Speaks", "Habla")}</b> {langShort.join(", ")}</span> : null}
            {livesIn ? <span><b>{L("Based", "Base")}</b> {livesIn}</span> : null}
            {travelLine ? <span><b>{travelLine}</b></span> : null}
            {childTypes.length ? <span><b>{L("Also", "También")}</b> {childTypes.slice(0, 4).join(", ")}</span> : null}
          </div>
        </div>
        <NoirStatRail rows={compRows} locale={locale} />
      </section>

      {!isModal && plan.cinematic ? (
        <section className="nf-cine" data-nf-reveal aria-hidden="true">
          <Image src={plan.cinematic.url} alt="" fill quality={95} sizes="100vw" />
          {availableFor && lead !== availableFor ? <div className="nf-cine__cap">{availableFor}</div> : null}
        </section>
      ) : null}

      {!isModal && featuredMediaItems.length > 0 ? (
        <section className="nf-wrap nf-sec nf-reel" data-profile-section="featured-media" data-nf-reveal>
          <div><PublicFeaturedMedia items={featuredMediaItems} heading="" /></div>
          <div className="nf-reel__txt"><span className="nf-meta nf-meta--gold">{labels.reel}</span><h3>{labels.reelTitle}</h3><p>{labels.reelBody}</p></div>
        </section>
      ) : null}

      {hasCaps ? (
        <section className="nf-wrap nf-sec" data-profile-section="skills" data-nf-reveal>
          <h2 className="nf-sr">{labels.disciplines}</h2>
          <div className="nf-caps">
            <div>
              <h4 className="nf-h4">{labels.disciplines}</h4>
              <ul className="nf-disc">
                {disciplineList.map((d) => (
                  <li key={d.id} className={d.prime ? "is-prime" : undefined}><span className="n">{d.name}</span>{d.meta ? <span className="lvl">{d.meta}</span> : null}</li>
                ))}
              </ul>
              {notableWork && notableWork !== lead && notableWork !== body ? <div className="nf-caps__exp"><b>{labels.notable}</b>{notableWork}</div> : null}
            </div>
            <div>
              {showIndustries ? <><h4 className="nf-h4">{labels.industries}</h4><div className="nf-tags">{industries.map((x) => <span key={x}>{x}</span>)}</div></> : null}
              {showEvents ? <><h4 className="nf-h4" style={{ marginTop: showIndustries ? 28 : 0 }}>{labels.events}</h4><div className="nf-tags">{eventList.map((x) => <span key={x}>{x}</span>)}</div></> : null}
              {!showIndustries && !showEvents && highlights && highlights !== body && highlights !== lead ? <><h4 className="nf-h4">{L("Highlights", "Destacados")}</h4><p className="nf-caps__exp" style={{ marginTop: 0 }}>{highlights}</p></> : null}
            </div>
            <div>
              {logistics.length ? <><h4 className="nf-h4">{labels.logistics}</h4><dl className="nf-kv">{logistics.map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></> : null}
            </div>
          </div>
        </section>
      ) : null}

      {showAvailBand ? (
        <section className="nf-avl nf-sec" id="nf-availability" data-profile-section="availability" data-nf-reveal>
          <div className="nf-wrap">
            <div>
              <span className="nf-meta nf-meta--gold">{labels.availability}</span>
              <h3>
                {availableDaysInNext30 != null
                  ? <>{L("Open ", "Libre ")}<em>{L(`${availableDaysInNext30} of the next 30`, `${availableDaysInNext30} de los próximos 30`)}</em>{L(" days.", " días.")}</>
                  : <>{L("Booked ", "Reservas ")}<em>{(bookingStatus ?? L("by request", "bajo pedido")).toLowerCase()}.</em></>}
              </h3>
              <p>
                {livesIn ? L(`Based in ${livesIn}. `, `Con base en ${livesIn}. `) : ""}
                {travelLine ? `${travelLine}. ` : ""}
                {notice ? L(`${notice} notice`, `${notice} de antelación`) : ""}
                {notice && replyTime ? ", " : ""}
                {replyTime ? L(`replies within ${replyTime}.`, `responde en ${replyTime}.`) : notice ? "." : ""}
              </p>
              {dots ? <div className="nf-dots" aria-hidden="true">{dots.map((c, i) => <i key={i} className={c === "·" ? "y" : c === "×" ? undefined : "h"} />)}</div> : null}
            </div>
            <dl className="nf-avl__facts">
              <div><dt>{labels.nextAvailable}</dt><dd>{availableNow ? L("Now", "Ahora") : nextAvailableDate ? formatDay(nextAvailableDate, locale) : labels.onRequest}</dd></div>
              {notice ? <div><dt>{L("Notice", "Antelación")}</dt><dd>{notice}</dd></div> : null}
              {travelLine ? <div><dt>{L("Travel", "Viajes")}</dt><dd>{travelLine.replace(/^(Travels|Viaja:)\s*/, "")}</dd></div> : null}
              {replyTime ? <div><dt>{L("Replies", "Responde")}</dt><dd>{replyTime}</dd></div> : null}
            </dl>
            <div className="nf-avl__cta"><a href="#nf-book" className="nf-btn nf-btn--ghost">{labels.checkDates}</a></div>
          </div>
        </section>
      ) : null}

      {hasCommerce ? (
        <section className="nf-wrap nf-sec" id="nf-services" data-profile-section="services" data-nf-reveal>
          <div className="nf-sec-head"><h2>{labels.servicesTitle}</h2><span className="nf-meta">{labels.servicesNote}</span></div>
          {hasServices ? (
            <ServicesBlock packageTeasers={packageTeasers} serviceAreas={serviceAreas} startingFrom={startingFrom} bookingNote={bookingNote} locale={locale} heading="" packagesLabel={t("public.profile.editorial.packages")} bookingDetailsLabel={t("public.profile.editorial.bookingDetails")} />
          ) : null}
          {hasServiceMenu ? (
            <div style={{ marginTop: hasServices ? 28 : 0 }}>
              {hasStorefront
                ? <TalentStorefront offerings={storefrontOfferings} locale={locale} heading={L("Services & pricing", "Servicios y precios")} />
                : <ServiceMenuBlock items={serviceMenuItems} locale={locale} heading={L("Services & pricing", "Servicios y precios")} disciplineLabels={disciplineLabels} />}
            </div>
          ) : null}
        </section>
      ) : null}

      {!isModal ? <TalentExtrasBands family="noir" locale={locale} embeds={props.talentEmbeds} press={props.talentPressItems} /> : null}

      {ratingSummary.count > 0 ? (
        <section id="reviews" className="nf-wrap nf-sec" data-profile-section="reviews" data-nf-reveal>
          <div className="nf-trust">
            <div>
              <span className="nf-meta nf-meta--gold">{labels.reviewsEyebrow}</span>
              <div className="nf-trust__score">{ratingSummary.average.toFixed(1)}<small>/ 5</small></div>
              <div className="nf-trust__stars" aria-hidden="true">{"★".repeat(Math.round(ratingSummary.average))}</div>
              <div className="nf-trust__sub">{L(`${ratingSummary.count} verified ${ratingSummary.count === 1 ? "review" : "reviews"}`, `${ratingSummary.count} ${ratingSummary.count === 1 ? "reseña verificada" : "reseñas verificadas"}`)}</div>
            </div>
            <TalentReviewsSection summary={ratingSummary} reviews={talentReviews} theme="dark" heading="" talentName={name} />
          </div>
        </section>
      ) : null}
      {testimonials.length > 0 ? (
        <section className="nf-wrap nf-sec" data-profile-section="testimonials" data-nf-reveal><TestimonialsSection testimonials={testimonials} theme="dark" /></section>
      ) : null}

      {plan.rest.length > 0 ? (
        <div className="nf-wrap nf-sec-head" id="nf-portfolio" style={{ paddingTop: "clamp(40px,6vw,88px)" }}>
          <h2>{labels.portfolio}.</h2><span className="nf-meta">{labels.images(galleryItems.length)}</span>
        </div>
      ) : null}
    </>
  );

  return (
    <main id="main-content" className="flex-1" style={noirVars as React.CSSProperties} data-profile-shell data-profile-theme="noir" data-profile-variant={variant} data-bookbar="idle">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* Page-scoped on purpose: Cormorant/Jost load only on Noir profiles. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@300;400;500&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: NOIR_CSS }} />
      <noscript>
        <style>{`[data-profile-theme="noir"] [data-nf-reveal]{opacity:1!important;transform:none!important}[data-profile-theme="noir"][data-bookbar="idle"] .nf-rail,[data-profile-theme="noir"][data-bookbar="idle"] .nf-bar{transform:none!important}`}</style>
      </noscript>
      <NoirReveal />
      <NoirBookbarAutoHide />

      {resolvedPreview ? <div className="nf-preview-banner">{t("public.profile.previewModeBanner")}</div> : null}

      {/* ── STICKY RAIL (desktop) ── */}
      {/* data-profile-sticky-bar sits on the SLOT, not the rail: the tenant
          token forces `display:flex !important` on the attribute host, which
          would defeat the rail's phone-only display:none. */}
      <div className="nf-rail-slot" data-profile-sticky-bar="visible">
        <div className="nf-rail">
          <div className="nf-wrap">
            <div className="nf-rail__who">
              <span className="nf-thumb">{portraitImg ? <Image src={portraitImg} alt="" fill sizes="38px" /> : <span className="nf-portrait__mono"><Silhouette size="60%" /></span>}</span>
              <div style={{ minWidth: 0 }}><div className="n">{name}</div><div className="s">{[parentType, livesIn].filter(Boolean).join(" · ")}</div></div>
            </div>
            <nav aria-label={name}>
              {galleryItems.length ? <a href="#nf-look">{labels.portfolio}</a> : null}
              <a href="#nf-facts">{labels.compCard}</a>
              {hasCommerce ? <a href="#nf-services">{labels.services}</a> : null}
              <a href="#nf-book">{labels.book}</a>
            </nav>
            <div className="nf-rail__act"><span className="nf-status">{signal}</span>{primary(inquireButtonSidebar, true)}</div>
          </div>
        </div>
      </div>

      {/* ── 1. HERO ── */}
      <header className={`nf-hero${splitHero ? " nf-hero--split" : ""}`} data-profile-section="hero">
        {!splitHero ? (
          <div className="nf-hero__media"><Image src={bannerUrl!} alt={`${name}, banner`} fill priority quality={95} sizes="100vw" /></div>
        ) : null}
        <div className="nf-wrap nf-hero__body">
          {splitHero ? (
            <>
              <div className="nf-portrait">{portraitImg ? <Image src={portraitImg} alt={`${name}, portrait`} fill priority quality={85} sizes="(min-width: 900px) 440px, 100vw" /> : <div className="nf-portrait__mono" aria-hidden="true"><Silhouette /></div>}</div>
              <div className="nf-hero__side">
                {heroText}
                {heroCta}
                {stripN ? <div className="nf-hero__strip" aria-hidden="true">{galleryItems.slice(0, 3).map((g) => tile(g.id, g.url, ""))}</div> : null}
              </div>
            </>
          ) : (
            <>{heroText}{heroCta}</>
          )}
        </div>
      </header>

      {/* ── 2. FIRST LOOK → middle → 10. PORTFOLIO (one lightbox) ── */}
      {lightboxItems.length > 0 ? (
        <div id="nf-look" className="nf-look" data-profile-section="portfolio">
          <PortfolioGalleryLightbox
            name={name}
            items={lightboxItems}
            lightbox={ui.lightbox}
            closeLabel={ui.preview.close}
            watermarkPreset={watermarkPreset}
            watermarkLogoUrl={watermarkLogoUrl}
            tileClassName="nf-tile"
            sections={[
              {
                count: plan.look.length,
                listClassName: `nf-wrap nf-look-grid nf-look-grid--${plan.lookKind}`,
                after: (
                  <>
                    <div className="nf-wrap nf-look__caption">
                      <span className="nf-meta">{labels.portfolio} · {labels.images(galleryItems.length)}</span>
                      {plan.rest.length > 0 ? <a href="#nf-portfolio" className="nf-btn nf-btn--text">{labels.viewAll} <span className="nf-arr">→</span></a> : null}
                    </div>
                    {middle}
                  </>
                ),
              },
              { count: plan.rest.length, listClassName: "nf-wrap nf-folio" },
            ]}
          />
        </div>
      ) : middle}

      {/* ── 11. BOARD ── */}
      {!isModal && similarTalent.length > 0 ? (
        <section className="nf-wrap nf-sec" data-nf-reveal aria-label={labels.board}>
          <div className="nf-sec-head"><h2>{labels.board}</h2></div>
          <div className="nf-sim">
            {similarTalent.map((st) => (
              <div key={st.id} className="nf-sim__card">
                <Link href={st.href} className="nf-sim__media">
                  {st.thumbnailUrl ? <Image src={st.thumbnailUrl} alt="" fill quality={85} sizes="(min-width: 900px) 25vw, 50vw" /> : <div className="nf-portrait__mono" aria-hidden="true"><Silhouette /></div>}
                  <div className="nf-sim__cap"><div className="n">{st.displayName}</div>{st.primaryType ? <div className="t">{st.primaryType}</div> : null}</div>
                </Link>
                <TalentCardActions talentProfileId={st.id} profileCode={st.profileCode} displayName={st.displayName} portraitUrl={st.thumbnailUrl ?? null} sourcePage={profileSourcePage} variant="compact" locale={locale} className="absolute right-2.5 top-2.5 z-[2]" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── 12. CLOSING MOMENT ── */}
      <section className="nf-close" id="nf-book" data-nf-reveal aria-label={t("public.profile.ctaSectionAria")}>
        {plan.rest[2] ?? plan.look[0] ? <div className="nf-close__bg" aria-hidden="true"><Image src={(plan.rest[2] ?? plan.look[0]).url} alt="" fill quality={85} sizes="100vw" /></div> : null}
        <div className="nf-wrap nf-close__in">
          <span className="nf-meta nf-meta--gold">{labels.closeEyebrow}</span>
          <h2>{t("public.profile.footerCtaTitle").replace("{firstName}", firstName)}</h2>
          <p>{labels.closeBody}</p>
          {primary(inquireButtonFooter)}
          {slotPicker ? <div className="nf-close__picker">{slotPicker}</div> : null}
          {discoveryCta3 ? <div className="nf-close__side"><div className="nf-side-slot">{discoveryCta3}</div></div> : null}
        </div>
      </section>

      {isModal ? (
        <div className="nf-modal-foot">
          <div className="n">{name} <span>· {labels.fullHint}</span></div>
          <a href={`/t/${encodeURIComponent(profileCode)}`} className="nf-btn nf-btn--ghost">{labels.openFull} ↗</a>
        </div>
      ) : null}

      {showFooter && !isModal ? (
        <footer className="nf-wrap nf-foot">
          <div style={{ color: "rgba(236,228,211,0.6)", fontSize: 13, letterSpacing: 0, textTransform: "none" }}><PublicCmsFooterNav locale={locale} /></div>
          {props.whitelabel ? null : <span>Powered by <em>Tulala</em></span>}
        </footer>
      ) : null}

      {/* ── STICKY BAR (phone) ── */}
      <div className="nf-bar-slot" data-profile-sticky-bar="visible">
      <div className="nf-bar">
        <div className="nf-bar__l"><div className="n">{name}</div><div className="s">{bookable && startingFrom ? `${L("From", "Desde")} ${startingFrom} · ${signal}` : signal}</div></div>
        {primary(inquireButtonSidebar, true)}
      </div>
      </div>
    </main>
  );
}
