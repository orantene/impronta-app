/**
 * MaisonProfileLayout — the public profile template for INDEPENDENT SERVICE
 * PROFESSIONALS (beauty, wellness, grooming, studio crafts).
 *
 * Fifth sibling of Light / Noir / Lumen / Atelier: same `LightProfileLayoutProps`,
 * same dispatch in profile-view.tsx, same data. Where those present a ROSTER
 * TALENT, this presents a PRACTICE — the person, her menu, her results, and one
 * path to an appointment.
 *
 * v2 (2026-09-23), a substantial redesign:
 *   - WHITE FIRST. The beige ground and the burgundy block are gone.
 *   - SIX sections, not thirteen. The same services are no longer presented
 *     three times as featured cards, a specialty price list and a full menu.
 *   - THE ARTIST SITS SECOND, right under the hero, because on a one-person
 *     practice the person IS the product.
 *   - The menu is the flagship: four categories, full-width rows, one action
 *     each, a selected state that reads as chosen rather than as a CTA.
 *   - Motion is part of the composition (staggered hero, service marquee,
 *     scroll-in sections, image scale) and collapses under reduced-motion.
 *
 * Order: header · hero · marquee · the artist · services · results ·
 *        appointment + FAQ · closing · footer.
 *
 * Server component — presentational only. Interactivity lives in the four
 * islands (MaisonHeader, MaisonMotion, MaisonMenu, MaisonGallery) and in the
 * CTA slots the caller passes in.
 */

import Image from "next/image";
import {
  CalendarDays,
  Clock3,
  Heart,
  Languages,
  MapPin,
  Sparkles,
} from "lucide-react";

import type { TalentOffering } from "@/lib/talent/offerings-types";
import { TalentReviewsSection } from "@/components/reviews/TalentReviewsSection";
import { TestimonialsSection } from "@/components/reviews/TestimonialsSection";
import { meetsCredibilityFloor } from "@/lib/reviews/craft-standing";

import type { LightProfileLayoutProps } from "../_light/LightProfileLayout";
import { MAISON_DEFAULT_TOKENS } from "./maison-tokens";
import {
  derivedVisiting,
  pick,
  priceNoteFor,
  publicOfferings,
  resolveMaisonContent,
} from "./maison-derive";
import { MaisonStyles } from "./maison-styles";
import { MaisonMenu } from "./MaisonMenu";
import { MaisonGallery, type MaisonShot } from "./MaisonGallery";
import { MaisonHeader, MaisonMotion, MaisonWordmark } from "./MaisonChrome";
import type { MaisonContent } from "./maison-content";
import { MaisonAskButton } from "./MaisonAsk";
import { MaisonContact } from "./MaisonContact";

/**
 * The Maison template takes the SHARED profile props plus one optional
 * editorial block of its own. Every field inside it falls back to derived
 * profile data, which is why the block lives here and not in the shared type.
 */
export type MaisonProfileLayoutProps = LightProfileLayoutProps & {
  maison?: MaisonContent;
  /**
   * Language switch for the header. A slot rather than a data field so the
   * caller keeps ownership of routing — the live profile can pass the
   * platform's own toggle, this prototype passes plain links.
   */
  localeSwitch?: React.ReactNode;
  /**
   * What this surface can really do (resolveTalentBooking). Defaults to
   * "instant" so nothing changes for a surface that can confirm; anything
   * lower degrades the booking promise everywhere at once.
   */
  surfaceBooking?: "inquire" | "request" | "instant";
};

/** The appointment rows read as facts, not as a spreadsheet, once each has a mark. */
function FactIcon({ kind }: { kind?: string }) {
  const common = { size: 18, strokeWidth: 1.5, "aria-hidden": true } as const;
  if (kind === "place") return <MapPin {...common} />;
  if (kind === "studio") return <Sparkles {...common} />;
  if (kind === "days") return <CalendarDays {...common} />;
  if (kind === "clock") return <Clock3 {...common} />;
  if (kind === "languages") return <Languages {...common} />;
  return <Heart {...common} />;
}

// ── Layout ──────────────────────────────────────────────────────────────────

export function MaisonProfileLayout(props: MaisonProfileLayoutProps) {
  const {
    name,
    locale,
    profileImageUrl,
    livesIn,
    languages,
    ratingSummary,
    talentReviews,
    testimonials,
    ui,
    profileSourcePage,
    canonicalShareUrl,
    inquireButtonHeader,
    inquireButtonFooter,
    slotPicker,
    showFooter,
    localeSwitch,
    surfaceBooking = "instant",
  } = props;

  // The tenant's theme. page.tsx projects agency_branding.theme_json onto
  // `--token-color-*` vars and passes them here; every colour in maison-styles
  // reads one of those with the shipped value as its fallback, so applying
  // them on the root is the whole of what makes a Look reach this page.
  // WITHOUT this spread the stylesheet's token references resolve to their
  // fallbacks forever and the template is un-themeable — which is exactly what
  // it did until 2026-09-23.
  // Maison's OWN palette first, the tenant's theme over the top. The shell
  // sets a full default token set inline on <html>, so the fallbacks written
  // into maison-styles can never fire on a real page — see maison-tokens.ts.
  // Declaring the palette here, deeper in the tree, is what makes the shipped
  // design actually render; themeVars still wins key by key when a tenant has
  // chosen colours of its own.
  const themeMode = props.themeMode ?? "light";
  const themeStyle = {
    ...MAISON_DEFAULT_TOKENS,
    ...(props.themeVars ?? {}),
  } as React.CSSProperties;

  const c = pick(locale);
  const content = resolveMaisonContent(props, c);
  const offerings = publicOfferings(props.storefrontOfferings);
  const priceNote = priceNoteFor(offerings, locale, c.servicesLead);
  const categories = content.menuCategories ?? [];
  // 12 keeps the 4-up desktop grid landing on whole rows (a wide shot counts
  // as two cells), so the band never ends with a lone orphan tile.
  const gallery = (content.gallery ?? []).slice(0, 12);
  const showReviews = meetsCredibilityFloor(ratingSummary.count);
  const marquee = content.marquee?.length ? content.marquee : [name];

  const navLinks = [
    { href: "#sobre-mi", label: c.navAbout },
    { href: "#servicios", label: c.navServices },
    { href: "#resultados", label: c.navResults },
    { href: "#tu-cita", label: c.navVisit },
    { href: "#preguntas", label: c.navFaq },
  ];

  // Wordmark: first word upright, the rest in display italic.
  const [wordLead, ...wordRest] = name.split(" ");

  return (
    <main
      id="main-content"
      className="mn-root"
      data-profile-template="maison"
      // The document language belongs to the app shell, which may be serving a
      // different locale than the talent writes in. Declaring it here means a
      // screen reader pronounces her Spanish copy with a Spanish voice even on
      // an English-locale page.
      lang={locale}
      style={themeStyle}
    >
      <MaisonStyles />
      <MaisonMotion />
      <span id="top" />

      <MaisonHeader
        wordmarkLead={wordLead ?? name}
        wordmarkAccent={wordRest.join(" ")}
        wordmarkImageUrl={content.wordmarkImageUrl}
        wordmarkImageRatio={content.wordmarkImageRatio}
        links={navLinks}
        cta={<div className="mn-slot">{inquireButtonHeader}</div>}
        navLabel={c.a11ySections}
        localeSwitch={localeSwitch}
      />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="mn-hero mn-shell" id="mn-hero">
        <div className="mn-hero-grid">
          <div className="mn-hero-copy">
            {content.heroKicker ? (
              <p className="mn-kicker" data-mn-reveal>
                {content.heroKicker}
              </p>
            ) : null}
            <h1 className="mn-display" data-mn-reveal style={{ "--mn-delay": "70ms" } as React.CSSProperties}>
              {content.heroTitle}
              {content.heroTitleAccent ? (
                <>
                  {" "}
                  <em>{content.heroTitleAccent}</em>
                </>
              ) : null}
            </h1>
            {content.heroLead ? (
              <p className="mn-lead" data-mn-reveal style={{ "--mn-delay": "150ms" } as React.CSSProperties}>
                {content.heroLead}
              </p>
            ) : null}
            <div className="mn-hero-actions" data-mn-reveal style={{ "--mn-delay": "230ms" } as React.CSSProperties}>
              <a className="mn-btn mn-btn-primary" href="#servicios">
                {c.heroPrimary}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              <a className="mn-btn mn-btn-quiet" href="#sobre-mi">
                {c.heroSecondary}
              </a>
            </div>
            {content.heroFacts?.length ? (
              <ul className="mn-hero-facts" data-mn-reveal style={{ "--mn-delay": "300ms" } as React.CSSProperties}>
                {content.heroFacts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="mn-hero-media">
            <div className="mn-hero-main" data-mn-reveal="media">
              {content.heroImageUrl ? (
                <Image
                  src={content.heroImageUrl}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 899px) 100vw, 46vw"
                  className="object-cover"
                />
              ) : null}
            </div>
            {content.heroInsetUrl ? (
              <div className="mn-hero-inset" data-mn-reveal="media" style={{ "--mn-delay": "260ms" } as React.CSSProperties}>
                <Image src={content.heroInsetUrl} alt="" fill sizes="240px" className="object-cover" />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── MARQUEE ──────────────────────────────────────────────────── */}
      <div className="mn-marquee" aria-hidden="true">
        <div className="mn-marquee-track">
          {[0, 1].map((copy) => (
            <span key={copy}>
              {marquee.map((w, i) => (
                <span key={`${copy}-${w}`} style={{ display: "contents" }}>
                  {i % 2 === 1 ? <em>{w}</em> : w}
                  <i>✦</i>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ── THE ARTIST — second, because she is the product ──────────── */}
      {content.artist ? (
        <section className="mn-section mn-shell" id="sobre-mi">
          <div className="mn-artist-grid">
            <div className="mn-artist-portrait" data-mn-reveal="media">
              {profileImageUrl ? (
                <Image
                  src={profileImageUrl}
                  alt={name}
                  fill
                  sizes="(max-width: 899px) 100vw, 34vw"
                  className="object-cover"
                />
              ) : (
                <div className="mn-portrait-empty">
                  <span className="mn-display">{name.slice(0, 1)}</span>
                  <small>{c.portraitPending}</small>
                </div>
              )}
            </div>
            <div className="mn-artist-body">
              <h2 className="mn-display" data-mn-reveal>
                {content.artist.greeting}
              </h2>
              <div data-mn-reveal style={{ "--mn-delay": "90ms" } as React.CSSProperties}>
                {content.artist.paragraphs.map((p) => (
                  <p key={p.slice(0, 24)}>{p}</p>
                ))}
                {content.artist.more?.length ? (
                  <details className="mn-more">
                    <summary>{content.artist.moreLabel ?? c.moreLabel}</summary>
                    {content.artist.more.map((p) => (
                      <p key={p.slice(0, 24)}>{p}</p>
                    ))}
                  </details>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── SERVICES ─────────────────────────────────────────────────── */}
      <section className="mn-section mn-blush" id="servicios">
        <div className="mn-shell">
          <div className="mn-menu-head" data-mn-reveal>
            <div>
              <p className="mn-kicker">{c.menuKicker}</p>
              <h2 className="mn-display">
                {c.servicesTitle} <em>{c.servicesAccent}</em>
              </h2>
              <p className="mn-lead">
                {content.menuNote ?? priceNote}
                {surfaceBooking !== "instant" ? ` ${c.requestOnlyNote}` : ""}
              </p>
            </div>
            <ul className="mn-menu-meta">
              <li>
                <strong>{offerings.length}</strong>
                <span>{c.metaServices}</span>
              </li>
              <li>
                <strong>{categories.length}</strong>
                <span>{c.metaCategories}</span>
              </li>
            </ul>
          </div>
          {offerings.length === 0 ? (
            <div className="mn-empty" style={{ marginTop: 30 }}>
              <h3 className="mn-display">{c.menuEmptyTitle}</h3>
              <p>{c.menuEmptyBody}</p>
            </div>
          ) : (
            <MaisonMenu
              offerings={offerings}
              categories={categories}
              locale={locale}
              surfaceBooking={surfaceBooking}
              labels={{
                select: c.select,
                a11yCategories: c.a11yCategories,
                options: c.options,
                consult: c.consult,
                selected: c.selected,
                from: c.from,
                durationNote: c.durationNote,
                barIdleTitle: c.barIdleTitle,
                barIdleHint: c.barIdleHint,
                barSeeServices: c.barSeeServices,
                barContinue: c.barContinue,
                emptyTitle: c.menuEmptyTitle,
                emptyBody: c.menuEmptyBody,
              }}
            />
          )}
        </div>
      </section>

      {/* ── RESULTS ──────────────────────────────────────────────────── */}
      <section className="mn-section mn-shell" id="resultados">
        <h2 className="mn-display" data-mn-reveal>
          {c.resultsTitle} <em>{c.resultsAccent}</em>
        </h2>
        <MaisonGallery
          shots={gallery}
          name={name}
          emptyTitle={c.galleryEmptyTitle}
          emptyBody={c.galleryEmptyBody}
          closeLabel={ui.preview.close || c.close}
          prevLabel={c.prev}
          nextLabel={c.next}
          enlargeLabel={c.a11yEnlarge}
        />
        {content.galleryNote ? <p className="mn-disclaimer">{content.galleryNote}</p> : null}
      </section>

      {/* ── 1. YOUR VISIT — the map and the practical facts, side by side.
             Three separate bands from here on: one job each. Cramming the
             map, the facts, the FAQ, an ask CTA and four channels into one
             two-column card made every one of them harder to read. ── */}
      {content.visiting?.facts?.length ? (
        <section className="mn-section mn-blush" id="tu-cita">
          <div className="mn-shell">
            <h2 className="mn-display" data-mn-reveal>
              {c.visitTitle} <em>{c.visitAccent}</em>
            </h2>

            <div className="mn-visit-split">
              {content.visiting.map ? (
                <figure className="mn-areamap" data-mn-reveal="media">
                  <Image
                    src={content.visiting.map.imageUrl}
                    alt={content.visiting.map.caption}
                    fill
                    sizes="(max-width: 899px) 100vw, 46vw"
                    className="object-cover"
                  />
                  <span className="mn-areamap-chip">
                    <MapPin size={14} strokeWidth={1.8} aria-hidden="true" />
                    {content.visiting.map.caption}
                  </span>
                  {content.visiting.map.attribution ? (
                    <figcaption>{content.visiting.map.attribution}</figcaption>
                  ) : null}
                </figure>
              ) : null}

              <ul className="mn-facts" data-mn-reveal>
                {content.visiting.facts.map((f) => (
                  <li key={f.label}>
                    <span className="mn-fact-icon">
                      <FactIcon kind={f.icon} />
                    </span>
                    <div>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 2. FAQ — its own band, one narrow column, nothing competing ── */}
      {content.faq?.length ? (
        <section className="mn-section" id="preguntas">
          <div className="mn-shell mn-center">
            <h2 className="mn-display" data-mn-reveal>
              {c.faqTitle}
            </h2>
            {content.faqIntro ? (
              <p className="mn-lead" data-mn-reveal>
                {content.faqIntro}
              </p>
            ) : null}
            <div className="mn-faq" data-mn-reveal>
              {content.faq.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                  {f.steps?.length ? (
                    <ol className="mn-answer-steps">
                      {f.steps.map((step, i) => (
                        <li key={step.title}>
                          <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                          <div>
                            <strong>{step.title}</strong>
                            <p>{step.detail}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── REVIEWS (hidden until there are real ones) ────────────────── */}
      {showReviews ? (
        <section className="mn-section mn-shell" id="reviews">
          <TalentReviewsSection
            summary={ratingSummary}
            reviews={talentReviews}
            theme={themeMode}
            heading={c.reviews}
            talentName={name}
          />
        </section>
      ) : null}
      {testimonials?.length ? (
        <section className="mn-shell" style={{ paddingBottom: 48 }}>
          <TestimonialsSection testimonials={testimonials} theme={themeMode} />
        </section>
      ) : null}

      {/* ── 3. CLOSING — book, or ask, or reach her directly. The three
             ways to make contact belong together at the end, not squeezed
             beside the FAQ. ── */}
      <section className="mn-section mn-blush mn-closing" data-mn-reveal>
        <div className="mn-shell mn-center">
          <h2 className="mn-display">
            {content.closing?.title ?? name}
            {content.closing?.titleAccent ? (
              <>
                {" "}
                <em>{content.closing.titleAccent}</em>
              </>
            ) : null}
          </h2>
          {content.closing?.body ? <p className="mn-lead">{content.closing.body}</p> : null}

          <div className="mn-hero-actions">
            <div className="mn-slot">{inquireButtonFooter}</div>
          </div>

          <div className="mn-closing-alt">
            <span>{c.askLead}</span>
            <MaisonAskButton
              label={c.askCta}
              variant="link"
              context={{ talentName: name, sourcePage: profileSourcePage, from: "closing" }}
            />
          </div>

          {content.contact ? (
            <MaisonContact
              channels={content.contact}
              heading={c.contactEmail}
              talentName={name}
            />
          ) : null}
        </div>
      </section>


      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      {showFooter ? (
        <footer className="mn-footer">
          <div className="mn-shell mn-footer-in">
            <p className="mn-wordmark" style={{ margin: 0 }}>
              <MaisonWordmark
                lead={wordLead ?? name}
                accent={wordRest.join(" ")}
                imageUrl={content.wordmarkImageUrl}
                ratio={content.wordmarkImageRatio}
              />
            </p>
            <ul className="mn-footer-links">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
            {/* Channels live in the closing band now; repeating them one row
                later in the footer just made the page end twice. */}
            <small>
              {[livesIn, languages.join(" · ")].filter(Boolean).join(" · ")}
            </small>
          </div>
        </footer>
      ) : null}

      {slotPicker}
    </main>
  );
}
