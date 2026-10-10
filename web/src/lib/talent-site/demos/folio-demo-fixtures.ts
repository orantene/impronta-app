/**
 * Folio (TH02) per-demo content fixtures (Wave 2). Built from
 * `design-references/folio/demos.json` so Lucía…Rafa get FAQ, measures,
 * captions and language-matched copy — not Mateo's shared caption with empty
 * bars. Mateo stays on `design-references/folio/content.json`.
 */
import demosJson from "../../../../design-references/folio/demos.json";
import type { DemoContentFixture, FixtureService } from "./content-fixture";

type FolioDemoJson = {
  code: string;
  name: string;
  first: string;
  profession: string;
  city: string;
  country: string;
  locale: "es" | "en";
  langs: string[];
  tagEs: string;
  tagEn: string;
  bioEs: string;
  bioEn: string;
  siteLangs: string[];
  site: string;
  services: Array<{
    name: string;
    nameEn: string;
    desc: string;
    descEn: string;
    cat: string;
    mode: "instant" | "request" | "quote";
    disp: string;
    price: number;
    cur: "MXN" | "USD";
    unit: string;
    dur: number;
  }>;
};

const CTA = {
  es: { instant: "Ver horarios", request: "Solicitar", quote: "Consultar" },
  en: { instant: "See times", request: "Request", quote: "Inquire" },
} as const;

function slugId(s: string, i: number): string {
  const base = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `${base || "svc"}-${i + 1}`;
}

function durationLabel(mins: number, lang: "es" | "en"): string | null {
  if (!mins) return null;
  if (mins < 60) return lang === "es" ? `${mins} min` : `${mins} min`;
  const h = mins / 60;
  if (Number.isInteger(h)) return lang === "es" ? `${h} h` : `${h} h`;
  return lang === "es" ? `${mins} min` : `${mins} min`;
}

function priceLabel(amount: number, cur: string, from: boolean, lang: "es" | "en"): string {
  const n = amount.toLocaleString(lang === "es" ? "es-MX" : "en-US");
  if (from) return lang === "es" ? `Desde $${n} ${cur}` : `From $${n} ${cur}`;
  return `$${n} ${cur}`;
}

function statsFor(d: FolioDemoJson): DemoContentFixture["stats"] {
  const langs = d.siteLangs.map((l) => l.toUpperCase()).join("/");
  if (d.code === "TAL-93007") {
    return [
      { label: d.locale === "es" ? "Capacidad" : "Capacity", value: d.locale === "es" ? "Hasta 60 invitados" : "Up to 60 guests" },
      { label: d.locale === "es" ? "Ciudad" : "City", value: "Cancún" },
      { label: d.locale === "es" ? "Idiomas" : "Languages", value: langs },
    ];
  }
  if (d.code === "TAL-93115") {
    return [
      { label: d.locale === "es" ? "Entrega" : "Delivery", value: d.locale === "es" ? "20–40 fotos" : "20–40 photos" },
      { label: d.locale === "es" ? "Locación" : "Location", value: "Guadalajara" },
      { label: d.locale === "es" ? "Idiomas" : "Languages", value: langs },
    ];
  }
  if (d.code === "TAL-93116") {
    return [
      { label: d.locale === "es" ? "Enfoque" : "Focus", value: d.locale === "es" ? "Marca e impresos" : "Brand and print" },
      { label: d.locale === "es" ? "Ciudad" : "City", value: "Puebla" },
      { label: d.locale === "es" ? "Idiomas" : "Languages", value: langs },
    ];
  }
  if (d.code === "TAL-93110") {
    return [
      { label: d.locale === "es" ? "Altura cm" : "Height cm", value: "183" },
      { label: d.locale === "es" ? "Talla" : "Size", value: "M" },
      { label: d.locale === "es" ? "Calzado" : "Shoe", value: "43" },
      { label: d.locale === "es" ? "Idiomas" : "Languages", value: langs },
    ];
  }
  if (d.code === "TAL-93112") {
    return [
      { label: d.locale === "es" ? "Enfoque" : "Focus", value: d.locale === "es" ? "Manos" : "Hands" },
      { label: d.locale === "es" ? "Estudio" : "Studio", value: "Brooklyn" },
      { label: d.locale === "es" ? "Idiomas" : "Languages", value: langs },
    ];
  }
  if (d.code === "TAL-93113") {
    return [
      { label: d.locale === "es" ? "Altura cm" : "Height cm", value: "168" },
      { label: d.locale === "es" ? "Edad" : "Age", value: "56" },
      { label: d.locale === "es" ? "Idiomas" : "Languages", value: langs },
    ];
  }
  if (d.code === "TAL-93114") {
    return [
      { label: d.locale === "es" ? "Altura cm" : "Height cm", value: "180" },
      { label: d.locale === "es" ? "Voz" : "Voice", value: d.locale === "es" ? "Barítono" : "Baritone" },
      { label: d.locale === "es" ? "Idiomas" : "Languages", value: langs },
    ];
  }
  return [
    { label: d.locale === "es" ? "Estatura cm" : "Height cm", value: d.code === "TAL-93111" ? "178" : "174" },
    { label: d.locale === "es" ? "Calzado MX" : "Shoe", value: d.country === "US" ? "8.5" : "25" },
    { label: d.locale === "es" ? "Idiomas" : "Languages", value: langs },
  ];
}

function faqFor(d: FolioDemoJson): Array<{ q: string; a: string }> {
  if (d.locale === "en") {
    const base = [
      { q: "Do you travel?", a: `Yes, within the ${d.city} area. Longer trips are quoted separately.` },
      { q: "How fast do you reply?", a: "Same business day. Put the date in the subject if it is urgent." },
      { q: "What about usage rights?", a: "Base rates cover the shoot. Ad use, territory and term are quoted separately." },
    ];
    if (d.code === "TAL-93112") {
      return [
        { q: "Do you shoot face work?", a: "No. Hands only: jewelry, watches and small product." },
        ...base,
      ];
    }
    return base;
  }
  const base = [
    { q: "¿Viajas fuera de la ciudad?", a: `Sí, con traslado cotizado. Cuéntame la ciudad y las fechas.` },
    { q: "¿Cuánto tarda en responder?", a: "El mismo día hábil. Si es urgente, escribe la fecha en el asunto." },
    { q: "¿Incluye derechos de uso?", a: "Las tarifas base cubren la sesión. Pauta, territorio y plazo se cotizan aparte." },
  ];
  if (d.code === "TAL-93114") {
    return [
      { q: "¿Puedo contratar foto y música el mismo día?", a: "Sí. Cotizo paquete cuando la campaña y el show van juntos." },
      { q: "¿Llevas equipo de sonido?", a: "Llevo un set básico. Para eventos grandes pedimos PA del venue." },
      ...base.slice(1),
    ];
  }
  if (d.code === "TAL-93007") {
    return [
      { q: "¿Incluye el alcohol?", a: "No. Te mando la lista de compras; tú compras botellas y yo llevo herramientas y cristalería." },
      { q: "¿Atiendes fuera de Cancún?", a: "Sí, con traslado cotizado en la Riviera Maya." },
      ...base.slice(1),
    ];
  }
  if (d.code === "TAL-93115") {
    return [
      { q: "¿Cuánto tarda la entrega?", a: "Entre 5 y 10 días hábiles con galería en línea para descargar." },
      { q: "¿Haces sesiones en pareja?", a: "Sí. La sesión de pareja dura un poco más y entrega más fotos." },
      ...base.slice(1),
    ];
  }
  if (d.code === "TAL-93116") {
    return [
      { q: "¿Incluye impresión?", a: "Entrego archivos listos para imprenta o redes. La impresión la cotizas con tu proveedor." },
      { q: "¿Cuántas revisiones incluye?", a: "La identidad básica incluye dos rondas de cambios sobre el logotipo." },
      ...base.slice(1),
    ];
  }
  if (d.code === "TAL-93113") {
    return [
      { q: "¿Trabajas en español e inglés?", a: "Sí. Puedo dirigir la sesión en cualquiera de los dos." },
      ...base,
    ];
  }
  return base;
}

function buildFixture(d: FolioDemoJson): DemoContentFixture {
  const lang = d.locale;
  const tagline = lang === "es" ? d.tagEs : d.tagEn;
  const bio = lang === "es" ? d.bioEs : d.bioEn;
  const services: FixtureService[] = d.services.map((s, i) => {
    const name = lang === "es" ? s.name : s.nameEn;
    const description = lang === "es" ? s.desc : s.descEn;
    const from = s.disp === "from" || s.mode === "quote";
    const id = slugId(s.nameEn || s.name, i);
    return {
      id,
      category: s.cat,
      name,
      durationLabel: durationLabel(s.dur, lang),
      durationMinutes: s.dur || null,
      priceLabel: s.mode === "quote" && s.disp === "quote" ? (lang === "es" ? "A cotizar" : "By quote") : priceLabel(s.price, s.cur, from, lang),
      priceAmount: s.mode === "quote" && s.disp === "quote" ? null : s.price,
      currency: s.cur,
      priceFrom: from,
      priceUnit: s.unit,
      mode: s.mode,
      ctaLabel: CTA[lang][s.mode],
      description,
      includes: [],
      imageKey: `f-${id}`,
    };
  });

  const domain = d.site.replace(/^https?:\/\//, "");
  const chapterA =
    d.code === "TAL-93114"
      ? lang === "es"
        ? "Modelaje"
        : "Modeling"
      : d.code === "TAL-93007"
        ? lang === "es"
          ? "Barra"
          : "Bar"
        : d.code === "TAL-93115"
          ? lang === "es"
            ? "Retrato"
            : "Portrait"
          : d.code === "TAL-93116"
            ? lang === "es"
              ? "Identidad"
              : "Identity"
            : lang === "es"
              ? "Editorial"
              : "Editorial";
  const chapterB =
    d.code === "TAL-93114"
      ? lang === "es"
        ? "Música"
        : "Music"
      : d.code === "TAL-93007"
        ? lang === "es"
          ? "Carta"
          : "Menu"
        : d.code === "TAL-93115"
          ? lang === "es"
            ? "Marca"
            : "Brand"
          : d.code === "TAL-93116"
            ? lang === "es"
              ? "Digital"
              : "Digital"
            : lang === "es"
              ? "Campaña"
              : "Campaign";
  const statsTitle =
    d.code === "TAL-93007" || d.code === "TAL-93115" || d.code === "TAL-93116"
      ? lang === "es"
        ? "Detalles · Servicios"
        : "Details · Services"
      : lang === "es"
        ? "Medidas · Comp card"
        : "Measures · Comp card";

  return {
    design: "folio",
    profileCode: d.code,
    locale: lang,
    talent: {
      displayName: d.name,
      tagline,
      bio,
      trade: d.profession,
      city: d.city,
      languages: d.langs,
    },
    hero: {
      eyebrow: `${d.profession} · ${d.city}`,
      headline: d.name,
      lines: [tagline],
      mastheadLeft: lang === "es" ? "Vol. 07 · 2026" : "Vol. 07 · 2026",
      mastheadRight: `${d.city} · ${d.siteLangs.map((x) => x.toUpperCase()).join(" / ")}`,
      ctas: lang === "es" ? ["Consultar", "Ver el libro"] : ["Inquire", "View the book"],
      imageKey: "f-hero",
      imageAlt: d.name,
    },
    menu: {
      eyebrow: null,
      title: lang === "es" ? "Contratación" : "Booking",
      subtitle:
        lang === "es"
          ? `Tarifas base en ${services[0]?.currency ?? "MXN"}. El uso en pauta se cotiza aparte.`
          : `Base rates in ${services[0]?.currency ?? "USD"}. Ad use is quoted separately.`,
    },
    portfolio: {
      eyebrow: null,
      title: null,
      items: [
        { group: chapterA, numeral: "I", contents: tagline, imageKey: "f-hero", caption: lang === "es" ? "01 · Retrato" : "01 · Portrait" },
        { group: chapterA, numeral: "I", imageKey: "f-d-1", caption: lang === "es" ? "02 · Trabajo" : "02 · Work" },
        { group: chapterB, numeral: "II", contents: chapterB, imageKey: "f-d-2", caption: lang === "es" ? "03 · Detalle" : "03 · Detail" },
        { group: chapterB, numeral: "II", imageKey: "f-d-3", caption: lang === "es" ? "04 · Movimiento" : "04 · Movement" },
      ],
    },
    services,
    reviews: { items: [] },
    about: null,
    faq: {
      title: lang === "es" ? "Preguntas" : "Questions",
      items: faqFor(d),
    },
    stats: statsFor(d),
    statsTitle,
    location: null,
    footer: {
      headline: lang === "es" ? "Siguiente número." : "Next number.",
      line: tagline,
      cta: lang === "es" ? "Consultar" : "Inquire",
      columns: [],
    },
    suggestions:
      lang === "es"
        ? ["¿Tienes disponible la próxima semana?", "¿Incluye derechos de uso?", "¿Viajas fuera de la ciudad?"]
        : ["Are you free next week?", "Does the rate include usage?", "Do you travel?"],
    mockupOnly: {
      note: "Fictional Folio demo content. Never written from mockupOnly.",
      domain,
    },
  };
}

const demos = (demosJson as { demos: FolioDemoJson[] }).demos;

export const FOLIO_DEMO_FIXTURES: Readonly<Record<string, DemoContentFixture>> = Object.fromEntries(
  demos.map((d) => [d.code, buildFixture(d)]),
);
