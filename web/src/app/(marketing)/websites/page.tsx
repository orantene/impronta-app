import type { Metadata } from "next";
import Link from "next/link";
import { withLocaleHref, withLocalePath } from "@/i18n/pathnames";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  CASE_STUDY_PHOTOS,
  MARKETING_PHOTOS,
  type MarketingPhoto,
} from "@/lib/marketing/photography";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { EditorialFrame } from "@/components/marketing/editorial-image";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";

/**
 * `/websites` — landing page for the $12/mo Website tier.
 *
 * The audience is NOT a different species from the rest of the platform: it is
 * the talent who owns a place. A chef with a parrilla, a DJ who runs a bar, a
 * dancer who opened a studio. Same person, same craft, now with an address of
 * their own. So the copy never frames "businesses" as the opposite of talent;
 * it frames the craft as having acquired a door.
 *
 * Strategically this tier is the front door to the demand side: a venue that
 * publishes its site here becomes a verified client who can book talent from
 * the same account. Hence pillar 03 and the anchor story's tango act.
 *
 * Structure deliberately mirrors `/agencies`: `SimplePageHero`, three numbered
 * pillars alternating background + art, then a story, then the price, then the
 * shared `FinalCtaSection`. `/sitios-web` is the Spanish-first SEO sibling
 * (same relationship as `/agencies` <-> `/agencia-de-talento`), so this page
 * carries no FAQ JSON-LD; the sibling owns it.
 *
 * HONESTY GUARDRAILS (do not "improve" these into promises):
 *  - "reservation requests", never "reservation system". There are no time
 *    slots, no table map, no capacity model. A request lands in the forms inbox.
 *  - No online ordering / ecommerce anywhere on this page.
 *  - No talent roster on this tier. Booking talent happens through the
 *    platform directory from the same account, which is a different thing.
 *  - Studio / Agency prices are NOT stated here. Link to /pricing instead.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const title = pickLocale(locale, {
    en: "A website for the place you run",
    es: "Una página web para el lugar que atiendes",
  });
  const description = pickLocale(locale, {
    en: `The website that fills tables, not just clicks. ${PLATFORM_BRAND.name} gives your restaurant, cafe, beach club, salon, or studio a real site on your own domain for $12 a month, in English and Spanish, with reservation requests, deposits, and the ability to book talent from the same account.`,
    es: `La página que llena mesas, no solo clics. ${PLATFORM_BRAND.name} le da a tu restaurante, café, beach club, salón o estudio un sitio real en tu propio dominio por 12 USD al mes, en español e inglés, con solicitudes de reserva, anticipos y la posibilidad de contratar talento desde la misma cuenta.`,
  });
  return {
    title,
    description,
    // Without an explicit openGraph/twitter block the root layout's English
    // platform boilerplate wins, so the Spanish rendering would unfurl under an
    // English headline. WhatsApp is how a venue owner passes this page around.
    openGraph: {
      title,
      description,
      siteName: PLATFORM_BRAND.name,
      url: `https://${PLATFORM_BRAND.domain}${withLocalePath("/websites", locale)}`,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
    ...buildMarketingLocaleAlternates(locale, "/websites"),
  };
}

type PillarArtKey = "domain" | "inbox" | "stage";

type Pillar = {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  art: PillarArtKey;
};

/** Art is locale-independent, so it lives outside the copy map. */
const PILLAR_ART: Record<
  PillarArtKey,
  { photo: MarketingPhoto; aspect: "portrait" | "landscape" }
> = {
  domain: { photo: MARKETING_PHOTOS.heroBusiness, aspect: "landscape" },
  inbox: { photo: MARKETING_PHOTOS.hostsRestaurant, aspect: "portrait" },
  stage: { photo: CASE_STUDY_PHOTOS.band, aspect: "landscape" },
};

export default async function WebsitesPage() {
  const locale = await getRequestLocale();
  const L = (href: string) => withLocaleHref(href, locale);

  const t = pickLocale(locale, {
    en: {
      heroEyebrow: "Website",
      heroTitle: "The website that fills tables, not just clicks.",
      heroSubtitle:
        "A chef with a parrilla, a DJ who runs a bar, a dancer who opened a studio: same craft, now with a door of its own. $12 a month for a real website on your own domain, in both languages your customers speak, with the requests landing where you already work.",
      heroPrimary: "Start free",
      heroSecondary: "See pricing",
      pillars: [
        {
          id: "domain",
          index: "01",
          eyebrow: "Your own domain",
          title: "A website that speaks both languages of your customers.",
          body: "Your name on the door, not a profile inside someone else's app. Build the pages you actually need, menu, hours, map, photos, story, and publish them on your own domain in English and Spanish.",
          bullets: [
            "Custom domain, with SSL and DNS handled for you",
            "English and Spanish from the same editor, page by page",
            "Menu, hours, map, photos and story pages",
            "Media library plus SEO tools, so you show up when people search",
          ],
          art: "domain",
        },
        {
          id: "inbox",
          index: "02",
          eyebrow: "Requests and deposits",
          title: "Reservations in your WhatsApp, not in someone else's app.",
          body: "Reservation requests arrive as real messages in your inbox, and a click-to-chat button moves the rest of the conversation to WhatsApp, where you already answer. When a night is worth holding, your site takes the deposit.",
          bullets: [
            "Forms with a shared inbox, so nothing dies inside a DM",
            "WhatsApp click-to-chat, one tap from any page",
            "Payments and deposits, so a held night is a paid night",
            "Your site takes the deposits. Your phone takes the night off.",
          ],
          art: "inbox",
        },
        {
          id: "stage",
          index: "03",
          eyebrow: "Book the talent too",
          title: "The only website that can book your Friday band.",
          body: `Every other website builder stops at the page. Yours sits inside ${PLATFORM_BRAND.name}, so the same account that publishes your menu can find a tango duo, a DJ, or a photographer, agree the price in writing, and pay them without leaving the platform.`,
          bullets: [
            "Search the platform directory by craft, city and date",
            "Send a structured request instead of a chain of messages",
            "Get a priced offer, confirm it, pay it in the same chat",
            "No roster to manage: you book talent, you do not represent it",
          ],
          art: "stage",
        },
      ] as Pillar[],
      storyEyebrow: "El Paisa Parrilla",
      storyTitle: "You run the kitchen. The website runs itself.",
      storyBody:
        "El Paisa is an Argentine parrilla. The menu, the hours, the map and the photos live on its own domain, in Spanish for the neighbourhood and in English for the people walking over from the hotels. Reservation requests land in one inbox instead of five different chats. For New Year's dinner the site collects a deposit up front, so the table that is held is the table that shows up. And when Friday needs tango, the same account that publishes the menu books the act.",
      storyBullets: [
        "Menu, hours, map and photos on its own domain",
        "Reservation requests in one inbox, not five chats",
        "Deposits taken up front on the nights that matter",
        "A tango duo booked for Friday from the same account",
      ],
      priceEyebrow: "What it costs",
      priceTitle: "$12 a month.",
      priceBody:
        "One price for the whole surface: your own domain, English and Spanish, forms with a shared inbox, WhatsApp click-to-chat, SEO tools, a media library, and payments. There is no talent roster on this tier, and you do not need one to book talent. Start free with three pages on a tulala address, then move to your own domain when you are ready.",
      priceCta: "Compare every plan",
      closingLine: "Sell what you do, not what you ship.",
    },
    es: {
      heroEyebrow: "Página web",
      heroTitle: "La página que llena mesas, no solo clics.",
      heroSubtitle:
        "Un chef con su parrilla, un DJ con su bar, una bailarina con su estudio: el mismo oficio, ahora con puerta propia. 12 USD al mes por una página web real en tu propio dominio, en los dos idiomas que hablan tus clientes, con las solicitudes llegando a donde ya trabajas.",
      heroPrimary: "Empieza gratis",
      heroSecondary: "Ver precios",
      pillars: [
        {
          id: "domain",
          index: "01",
          eyebrow: "Tu propio dominio",
          title: "Una página que habla los dos idiomas de tus clientes.",
          body: "Tu nombre en la puerta, no un perfil dentro de la app de alguien más. Arma las páginas que de verdad necesitas, menú, horarios, mapa, fotos e historia, y publícalas en tu propio dominio en español e inglés.",
          bullets: [
            "Dominio propio, con SSL y DNS resueltos",
            "Español e inglés desde el mismo editor, página por página",
            "Menú, horarios, mapa, fotos y páginas de historia",
            "Biblioteca de medios y herramientas de SEO, para aparecer cuando te buscan",
          ],
          art: "domain",
        },
        {
          id: "inbox",
          index: "02",
          eyebrow: "Solicitudes y anticipos",
          title: "Las reservas llegan a tu WhatsApp, no a la app de alguien más.",
          body: "Las solicitudes de reserva llegan como mensajes reales a tu bandeja, y un botón de chat lleva el resto de la conversación a WhatsApp, donde ya respondes. Cuando la noche vale la pena apartar, tu página cobra el anticipo.",
          bullets: [
            "Formularios con bandeja compartida, para que nada se pierda en un DM",
            "WhatsApp a un toque desde cualquier página",
            "Pagos y anticipos: una noche apartada es una noche pagada",
            "Tu página cobra los anticipos. Tu teléfono descansa.",
          ],
          art: "inbox",
        },
        {
          id: "stage",
          index: "03",
          eyebrow: "También contrata talento",
          title: "La única página que puede contratar a tu banda del viernes.",
          body: `Cualquier otro creador de páginas se detiene en la página. La tuya vive dentro de ${PLATFORM_BRAND.name}, así que la misma cuenta que publica tu menú puede encontrar un dúo de tango, un DJ o un fotógrafo, acordar el precio por escrito y pagarle sin salir de la plataforma.`,
          bullets: [
            "Busca en el directorio de la plataforma por oficio, ciudad y fecha",
            "Envía una solicitud estructurada en vez de una cadena de mensajes",
            "Recibe una oferta con precio, confírmala y págala en el mismo chat",
            "Sin roster que administrar: tú contratas talento, no lo representas",
          ],
          art: "stage",
        },
      ] as Pillar[],
      storyEyebrow: "El Paisa Parrilla",
      storyTitle: "Tú llevas la cocina. La página se lleva sola.",
      storyBody:
        "El Paisa es una parrilla argentina. El menú, los horarios, el mapa y las fotos viven en su propio dominio, en español para el barrio y en inglés para quienes bajan de los hoteles. Las solicitudes de reserva llegan a una sola bandeja, no a cinco chats distintos. Para la cena de Año Nuevo la página cobra el anticipo por adelantado, así la mesa apartada es la mesa que llega. Y cuando el viernes pide tango, la misma cuenta que publica el menú contrata el acto.",
      storyBullets: [
        "Menú, horarios, mapa y fotos en su propio dominio",
        "Solicitudes de reserva en una sola bandeja, no en cinco chats",
        "Anticipos cobrados por adelantado en las noches que importan",
        "Un dúo de tango contratado para el viernes desde la misma cuenta",
      ],
      priceEyebrow: "Cuánto cuesta",
      priceTitle: "12 USD al mes.",
      priceBody:
        "Un solo precio para toda la superficie: tu propio dominio, español e inglés, formularios con bandeja compartida, WhatsApp a un toque, herramientas de SEO, biblioteca de medios y pagos. Este plan no incluye roster de talento, y no necesitas uno para contratar talento. Empieza gratis con tres páginas en una dirección de tulala y múdate a tu propio dominio cuando quieras.",
      priceCta: "Comparar todos los planes",
      closingLine: "Vende lo que haces, no lo que envías.",
    },
  });

  return (
    <>
      <SimplePageHero
        eyebrow={t.heroEyebrow}
        title={t.heroTitle}
        subtitle={t.heroSubtitle}
        sourcePage="websites-hero"
        primary={{ label: t.heroPrimary, href: L("/get-started"), intent: "website-start" }}
        secondary={{ label: t.heroSecondary, href: L("/pricing"), intent: "pricing" }}
      />

      {t.pillars.map((pillar, i) => (
        <MarketingSection
          key={pillar.id}
          id={pillar.id}
          className="relative"
          style={{ background: i % 2 === 0 ? "var(--plt-bg)" : "var(--plt-bg-raised)" }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: "var(--plt-hairline)" }}
          />
          <MarketingContainer size="wide">
            <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
              <div className={i % 2 === 0 ? "order-1" : "md:order-2"}>
                <div className="flex items-baseline gap-4">
                  <span
                    aria-hidden
                    className="plt-mono text-[0.75rem] tracking-[0.28em]"
                    style={{ color: "var(--plt-forest)" }}
                  >
                    {pillar.index}
                  </span>
                  <MarketingEyebrow>{pillar.eyebrow}</MarketingEyebrow>
                </div>
                <h2
                  className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.5rem]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {pillar.title}
                </h2>
                <p
                  className="mt-5 max-w-lg text-[1.0625rem] leading-[1.6]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {pillar.body}
                </p>
                <ul className="mt-8 space-y-3">
                  {pillar.bullets.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-3 text-[0.9375rem] leading-[1.55]"
                      style={{ color: "var(--plt-ink-soft)" }}
                    >
                      <span
                        className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--plt-forest)" }}
                        aria-hidden
                      />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={i % 2 === 0 ? "order-2" : "md:order-1"}>
                <EditorialFrame
                  photo={PILLAR_ART[pillar.art].photo}
                  aspect={PILLAR_ART[pillar.art].aspect}
                  size="lg"
                />
              </div>
            </div>
          </MarketingContainer>
        </MarketingSection>
      ))}

      {/* Anchor story: one real-shaped venue carrying every claim above. */}
      <MarketingSection>
        <MarketingContainer size="wide">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <MarketingEyebrow>{t.storyEyebrow}</MarketingEyebrow>
              <h2
                className="plt-display mt-5 text-[2rem] font-medium leading-[1.06] tracking-[-0.02em] sm:text-[2.35rem]"
                style={{ color: "var(--plt-ink)" }}
              >
                {t.storyTitle}
              </h2>
              <p
                className="mt-6 text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {t.storyBody}
              </p>
              <ul className="mt-6 space-y-2">
                {t.storyBullets.map((b) => (
                  <li
                    key={b}
                    className="text-[0.9375rem] leading-[1.6]"
                    style={{ color: "var(--plt-ink-strong)" }}
                  >
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <EditorialFrame photo={CASE_STUDY_PHOTOS.chefs} aspect="landscape" size="lg" />
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* Price. Only $12/mo and the free tier: Studio/Agency live on /pricing. */}
      <MarketingSection style={{ background: "var(--plt-bg-raised)" }}>
        <MarketingContainer size="wide">
          <MarketingEyebrow>{t.priceEyebrow}</MarketingEyebrow>
          <h2
            className="plt-display mt-5 text-[2.25rem] font-medium leading-[1.02] tracking-[-0.02em] sm:text-[3rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {t.priceTitle}
          </h2>
          <p
            className="mt-6 max-w-2xl text-[1.0625rem] leading-[1.7] sm:text-[1.125rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            {t.priceBody}
          </p>
          <div className="mt-8">
            <Link
              href={L("/pricing")}
              className="inline-flex min-h-11 items-center rounded-full px-5 text-[0.9375rem] transition-colors"
              style={{
                border: "1px solid var(--plt-hairline-strong)",
                color: "var(--plt-ink-strong)",
              }}
            >
              {t.priceCta}
            </Link>
          </div>
          <p
            className="plt-display mt-12 text-[1.5rem] leading-[1.2] tracking-[-0.01em] sm:text-[1.75rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {t.closingLine}
          </p>
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </>
  );
}
