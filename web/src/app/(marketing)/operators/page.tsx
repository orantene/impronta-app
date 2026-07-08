import type { Metadata } from "next";
import { ContrastSection } from "@/components/marketing/contrast-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { MarketingCta } from "@/components/marketing/cta-link";
import { NetworkSection } from "@/components/marketing/network-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { getRequestLocale } from "@/i18n/request-locale";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { pickLocale } from "@/lib/i18n/pick-locale";

export const metadata: Metadata = {
  title: "For independent operators",
  description: `You ARE the business. ${PLATFORM_BRAND.name} gives independent coordinators and operators the structure of a real agency, without the overhead of building one.`,
};

type PainPoint = {
  id: string;
  number: string;
  title: string;
  body: string;
};

function getPainPoints(locale: string): PainPoint[] {
  return pickLocale(locale, {
    en: [
      {
        id: "bottleneck",
        number: "01",
        title: "You ARE the business.",
        body: "Every inquiry, every booking, every response \u2014 it\u2019s all you. The phone doesn\u2019t stop, and there\u2019s no coordinator to delegate to.",
      },
      {
        id: "tools",
        number: "02",
        title: "Your tools don\u2019t match your work.",
        body: "WhatsApp, a Notes app, maybe a spreadsheet. You\u2019re running a business with tools built for personal chat.",
      },
      {
        id: "optics",
        number: "03",
        title: "You look smaller than you are.",
        body: "Clients judge based on what they see. A screenshot pile doesn\u2019t convey the quality of the work, or the quality of you.",
      },
    ],
    es: [
      {
        id: "bottleneck",
        number: "01",
        title: "El negocio eres tú.",
        body: "Cada consulta, cada reserva, cada respuesta \u2014 todo recae en ti. El teléfono no para, y no hay un coordinador a quien delegarle.",
      },
      {
        id: "tools",
        number: "02",
        title: "Tus herramientas no están a la altura.",
        body: "WhatsApp, la app de Notas, quizá una hoja de cálculo. Llevas un negocio con herramientas hechas para el chat personal.",
      },
      {
        id: "optics",
        number: "03",
        title: "Te ves más chico de lo que eres.",
        body: "Los clientes te juzgan por lo que ven. Un montón de capturas no transmite la calidad del trabajo, ni la tuya.",
      },
    ],
  });
}

type Shift = {
  before: string;
  after: string;
};

function getShifts(locale: string): Shift[] {
  return pickLocale(locale, {
    en: [
      {
        before: "Roster lives in your camera roll.",
        after: "Roster lives on your domain, rendering like an agency.",
      },
      {
        before: "Inquiries buried in WhatsApp.",
        after: "Inquiries land structured \u2014 brief, dates, budget.",
      },
      {
        before: "Rates quoted from memory.",
        after: "Offers version-tracked, approved in-product.",
      },
      {
        before: "Screenshots as your portfolio.",
        after: "Editorial profiles with one share link.",
      },
      {
        before: "Calendar inside your head.",
        after: "Availability queryable, bookings exportable.",
      },
      {
        before: "No way to scale past you.",
        after: "Role-scoped access when you\u2019re ready to delegate.",
      },
    ],
    es: [
      {
        before: "Tu roster vive en el carrete de fotos.",
        after: "Tu roster vive en tu dominio, presentado como una agencia.",
      },
      {
        before: "Consultas enterradas en WhatsApp.",
        after: "Las consultas llegan estructuradas \u2014 brief, fechas, presupuesto.",
      },
      {
        before: "Tarifas cotizadas de memoria.",
        after: "Ofertas con control de versiones, aprobadas dentro del producto.",
      },
      {
        before: "Capturas de pantalla como portafolio.",
        after: "Perfiles editoriales con un solo link para compartir.",
      },
      {
        before: "El calendario en tu cabeza.",
        after: "Disponibilidad consultable, reservas exportables.",
      },
      {
        before: "Sin forma de crecer más allá de ti.",
        after: "Accesos por rol cuando estés listo para delegar.",
      },
    ],
  });
}

export default async function OperatorsPage() {
  const locale = await getRequestLocale();
  const painPoints = getPainPoints(locale);
  const shifts = getShifts(locale);
  const c = pickLocale(locale, {
    en: {
      heroEyebrow: "For independent operators",
      heroTitleA: "You\u2019re already running",
      heroTitleB: "a real business.",
      heroSubtitle: `${PLATFORM_BRAND.name} is the talent business platform for coordinators, freelance scouts, managers, and one-person agencies. Get a polished storefront, a structured inquiry inbox, and exposure on a shared discovery network \u2014 free to start.`,
      startFree: "Start free",
      seeHow: "See how it works",
      bottleneckEyebrow: "The one-person bottleneck",
      bottleneckTitleA: "You\u2019re doing agency work.",
      bottleneckTitleB: "With personal tools.",
      shiftsEyebrow: `Today \u2192 with ${PLATFORM_BRAND.name}`,
      shiftsTitleA: "Six shifts that make you",
      shiftsTitleB: "look like a real agency.",
      shiftsBody:
        "None of this replaces what you do. It replaces the improvised tooling that makes the work feel smaller than it is.",
    },
    es: {
      heroEyebrow: "Para operadores independientes",
      heroTitleA: "Ya est\u00e1s llevando",
      heroTitleB: "un negocio de verdad.",
      heroSubtitle: `${PLATFORM_BRAND.name} es la plataforma de negocio de talento para coordinadores, scouts independientes, m\u00e1nagers y agencias de una sola persona. Ten un escaparate pulido, un buz\u00f3n de consultas estructurado y presencia en una red de descubrimiento compartida \u2014 gratis para empezar.`,
      startFree: "Empieza gratis",
      seeHow: "Mira c\u00f3mo funciona",
      bottleneckEyebrow: "El cuello de botella de una sola persona",
      bottleneckTitleA: "Est\u00e1s haciendo trabajo de agencia.",
      bottleneckTitleB: "Con herramientas personales.",
      shiftsEyebrow: `Hoy \u2192 con ${PLATFORM_BRAND.name}`,
      shiftsTitleA: "Seis cambios que te hacen",
      shiftsTitleB: "ver como una agencia de verdad.",
      shiftsBody:
        "Nada de esto reemplaza lo que haces. Reemplaza las herramientas improvisadas que hacen que el trabajo se vea m\u00e1s chico de lo que es.",
    },
  })
  return (
    <>
      <SimplePageHero
        eyebrow={c.heroEyebrow}
        title={
          <>
            {c.heroTitleA}
            <br />
            <span style={{ color: "var(--plt-forest)" }}>{c.heroTitleB}</span>
          </>
        }
        subtitle={c.heroSubtitle}
        primary={{ label: c.startFree, href: "/get-started?audience=operator", intent: "get-started" }}
        secondary={{ label: c.seeHow, href: "/how-it-works", intent: "learn" }}
        sourcePage="operators-hero"
      />

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-2xl text-center">
            <MarketingEyebrow>{c.bottleneckEyebrow}</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              {c.bottleneckTitleA}
              <br className="hidden sm:block" />{" "}
              <span style={{ color: "var(--plt-muted)" }}>{c.bottleneckTitleB}</span>
            </h2>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
            {painPoints.map((p) => (
              <article
                key={p.id}
                className="group relative overflow-hidden rounded-[28px] p-7 transition-all duration-300 hover:-translate-y-0.5 sm:p-8"
                style={{
                  background: "var(--plt-bg-elevated)",
                  border: "1px solid var(--plt-hairline)",
                  boxShadow: "0 1px 2px rgba(15,23,20,0.04)",
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--plt-forest) 0%, var(--plt-forest-bright) 100%)",
                  }}
                />
                <span
                  className="plt-mono text-[0.6875rem] tracking-[0.24em]"
                  style={{ color: "var(--plt-forest)" }}
                >
                  {p.number}
                </span>
                <h3
                  className="plt-display mt-3 text-[1.25rem] font-medium leading-[1.2] tracking-[-0.02em]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {p.title}
                </h3>
                <p
                  className="mt-4 text-[0.9375rem] leading-[1.6]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {p.body}
                </p>
              </article>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection
        className="relative"
        style={{
          background:
            "linear-gradient(180deg, var(--plt-bg-raised) 0%, var(--plt-bg) 100%)",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "var(--plt-hairline)" }}
        />
        <MarketingContainer size="wide">
          <div className="grid gap-12 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] md:gap-16">
            <div>
              <MarketingEyebrow>{c.shiftsEyebrow}</MarketingEyebrow>
              <h2
                className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.5rem]"
                style={{ color: "var(--plt-ink)" }}
              >
                {c.shiftsTitleA}
                <br />
                <span style={{ color: "var(--plt-forest)" }}>{c.shiftsTitleB}</span>
              </h2>
              <p
                className="mt-5 max-w-md text-[1rem] leading-[1.6]"
                style={{ color: "var(--plt-muted)" }}
              >
                {c.shiftsBody}
              </p>
              <div className="mt-8">
                <MarketingCta
                  href="/get-started?audience=operator"
                  variant="primary"
                  size="md"
                  eventSource="operators-shifts"
                  eventIntent="get-started"
                >
                  {c.startFree}
                </MarketingCta>
              </div>
            </div>
            <ul className="space-y-3">
              {shifts.map((s, i) => (
                <li
                  key={i}
                  className="grid gap-3 rounded-2xl p-4 sm:grid-cols-2 sm:p-5"
                  style={{
                    background: "var(--plt-bg-elevated)",
                    border: "1px solid var(--plt-hairline)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <BeforeMark />
                    <span
                      className="text-[0.9375rem] leading-[1.45] line-through"
                      style={{ color: "var(--plt-muted)" }}
                    >
                      {s.before}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <AfterMark />
                    <span
                      className="text-[0.9375rem] font-medium leading-[1.45]"
                      style={{ color: "var(--plt-ink)" }}
                    >
                      {s.after}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <ContrastSection />
      <HowItWorksSection />
      <NetworkSection />
      <FinalCtaSection />
    </>
  );
}

function BeforeMark() {
  return (
    <span
      aria-hidden
      className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{
        background: "var(--plt-hairline)",
        color: "var(--plt-muted)",
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2 2l6 6M8 2l-6 6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function AfterMark() {
  return (
    <span
      aria-hidden
      className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{
        background: "rgba(46,107,82,0.14)",
        color: "var(--plt-forest)",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 11 11"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2 5.8l2.4 2.4L9 3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
