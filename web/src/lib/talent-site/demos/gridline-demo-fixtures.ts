/**
 * Gridline (TH16): the content fixtures of the seven trade demos
 * (TAL-93206 to TAL-93212, `design-references/gridline/demos.json`). The
 * reference demo Alex Treviño (TAL-93030) has its own fixture, the mockup's
 * `content.json`; these seven are authored here, keyed by profile code.
 *
 * Every person is fictional. Content follows `demos.json`: names, services,
 * prices, modes and site languages are the planned ones (`quote` is the
 * mockup's word for the product's inquiry mode; a quote service keeps its
 * "from" price). Written in the demo's site language: 93206, 93207, 93210 and
 * 93211 in English, 93208 and 93209 in Spanish, 93212 in Spanish with English
 * as the second language the talent does not speak (`translations`, the text
 * the AI translate button writes). No credentials, licences, ratings or
 * reviews are invented; spec cells are typed copy about how the demo works.
 * No em dashes.
 *
 * The fixture feeds two writers: the content step (offerings with matrix cells,
 * intake questions and policy, FAQ, service areas, job captions) and the design
 * step (hero spec cells, tasks, spec rows, top bar) through the site-copy
 * mechanism. Nothing here is baked into the design payload.
 */
import demosJson from "../../../../design-references/gridline/demos.json";
import { ask, q, OMAR, GRACE, RAMON } from "./gridline-demo-fixtures-2";
import type { Lang, Mode, Svc, Task, Def } from "./gridline-demo-fixtures-2";
import type { DemoContentFixture, FixtureBriefQuestion, FixtureMatrixCells, FixtureService, FixtureTranslation } from "./content-fixture";


const COPY: Record<Lang, {
  matrix: Array<{ key: "price" | "dur" | "mode" | "mat" | "war" | "resp"; label: string }>;
  menuTitle: string;
  specTitle: string;
  specSub: string;
  recommend: string;
  details: string;
  faqTitle: string;
  locTitle: string;
  by: string;
  from: string;
  cta: Record<Mode, string>;
  note: Record<Mode, string>;
  prices: (c: string) => string;
  zoneKind: string;
  zoneSub: string;
}> = {
  en: {
    matrix: [
      { key: "price", label: "Price" },
      { key: "dur", label: "Duration" },
      { key: "mode", label: "How it is booked" },
      { key: "mat", label: "Materials" },
      { key: "war", label: "Warranty" },
      { key: "resp", label: "Response" },
    ],
    menuTitle: "Services and prices",
    specTitle: "Specifications",
    specSub: "How I work",
    recommend: "Best fit",
    details: "Details",
    faqTitle: "Questions",
    locTitle: "Where I work",
    by: "By quote",
    from: "from",
    cta: { instant: "See times", request: "Request a visit", quote: "Ask for a quote" },
    note: { instant: "Book online", request: "I confirm by message", quote: "Quote first" },
    prices: (c) => `Prices in ${c}`,
    zoneKind: "Area",
    zoneSub: "Approximate",
  },
  es: {
    matrix: [
      { key: "price", label: "Precio" },
      { key: "dur", label: "Duración" },
      { key: "mode", label: "Cómo se agenda" },
      { key: "mat", label: "Materiales" },
      { key: "war", label: "Garantía" },
      { key: "resp", label: "Respuesta" },
    ],
    menuTitle: "Servicios y precios",
    specTitle: "Especificaciones",
    specSub: "Cómo trabajo",
    recommend: "Te conviene",
    details: "Detalles",
    faqTitle: "Preguntas",
    locTitle: "Dónde trabajo",
    by: "A cotizar",
    from: "desde",
    cta: { instant: "Ver horarios", request: "Solicitar visita", quote: "Pedir cotización" },
    note: { instant: "Agenda en línea", request: "Confirmo por mensaje", quote: "Primero cotizo" },
    prices: (c) => `Precios en ${c}`,
    zoneKind: "Zona",
    zoneSub: "Aproximada",
  },
};

/** TUL-516: `$550 MXN` — never bare `$550`. */
const money = (n: number, lang: Lang, cur: string) => {
  const shown = n.toLocaleString(lang === "es" ? "es-MX" : "en-US");
  return `$${shown} ${cur}`;
};

function service(s: Svc, d: Def): FixtureService {
  const c = COPY[d.lang];
  const quote = s.mode === "quote";
  // Ladder / options: label the cheapest option (hero fact = card).
  const optionPrices = (s.options ?? []).map(([, , delta]) => s.price + delta).filter((p) => p > 0);
  const minPrice = optionPrices.length ? Math.min(...optionPrices) : s.price;
  const showFrom = Boolean(s.from) || (s.options?.length ?? 0) > 1;
  return {
    id: s.id,
    category: s.cat,
    name: s.name,
    durationLabel: s.mins ? s.dur : null,
    durationMinutes: s.mins || null,
    priceLabel:
      s.price <= 0 && !quote
        ? d.lang === "es"
          ? "Consultar"
          : "Ask"
        : `${showFrom ? `${c.from} ` : ""}${money(minPrice > 0 ? minPrice : s.price, d.lang, d.currency)}${s.unit ? ` ${s.unit}` : ""}`,
    priceAmount: s.price,
    currency: d.currency,
    ...(showFrom ? { priceFrom: true } : {}),
    ...(s.unit ? { priceUnit: s.unit } : {}),
    mode: s.mode,
    ctaLabel: c.cta[s.mode],
    description: s.desc,
    includes: [],
    imageKey: `service-${s.id}`,
    ...(s.mode === "instant" ? { payMode: "free" as const } : {}),
    modeNote: c.note[s.mode],
    matrix: { materials: s.m[0], warranty: s.m[1], response: s.m[2] },
    ...(s.emergency ? { emergency: true } : {}),
    ...(s.options
      ? {
          optionsLabel: s.optionsLabel ?? "",
          variants: s.options.map(([label, note, delta, deltaLabel], i) => ({
            id: `o${i + 1}`,
            label,
            note,
            priceDelta: delta,
            minutesDelta: 0,
            deltaLabel,
          })),
        }
      : {}),
    flow: { brief: s.ask },
    ...(quote ? { policy: c.note.quote } : {}),
  };
}

type PlannedDemo = { code: string; tagEs: string; tagEn: string; bioEs: string; bioEn: string };
const PLANNED = new Map((demosJson.demos as PlannedDemo[]).map((x) => [x.code, x]));

/** The planned tagline and bio of a demo (`demos.json`), in a language. */
function planned(code: string, lang: Lang): { tagline: string; bio: string } {
  const x = PLANNED.get(code);
  if (!x) throw new Error(`${code} is not in demos.json`);
  return lang === "es" ? { tagline: x.tagEs, bio: x.bioEs } : { tagline: x.tagEn, bio: x.bioEn };
}

function fixture(d: Def): DemoContentFixture {
  const c = COPY[d.lang];
  const other: Lang = d.lang === "es" ? "en" : "es";
  const second = d.second ? { ...planned(d.code, other), ...d.second } : undefined;
  const svc = d.services.map((s) => service(s, d));
  return {
    design: "gridline",
    profileCode: d.code,
    locale: d.lang,
    ...(second ? { translations: { [other]: second } } : {}),
    talent: { displayName: d.name, ...planned(d.code, d.lang), trade: d.trade, city: d.city, languages: [d.lang === "es" ? "Español" : "English"] },
    topBar: { subtitle: d.topSub, phoneAriaLabel: d.call },
    ...(d.urgency
      ? {
          urgency: {
            setting: d.lang === "es" ? "Atiendo emergencias hoy" : "I take emergency calls today",
            defaultOn: true,
            serviceId: d.urgency.serviceId,
            statusOn: d.urgency.statusOn,
            statusOff: d.urgency.statusOff,
            band: { title: d.urgency.title, safetyLead: d.urgency.lead, safety: d.urgency.safety },
            dock: { on: { label: d.urgency.on, serviceId: d.urgency.serviceId }, off: { label: d.urgency.off, serviceId: d.urgency.serviceId } },
          },
        }
      : {}),
    hero: {
      eyebrow: d.hero.eyebrow,
      headline: d.hero.headline,
      ctas: d.hero.ctas,
      facts: d.hero.facts.map(([label, value]) => ({ label, value })),
      ...(d.hero.factsEn
        ? { factsI18n: { en: d.hero.factsEn.map(([label, value]) => ({ label, value })) } }
        : {}),
      badges: d.hero.badges,
    },
    menu: { eyebrow: null, title: c.menuTitle, subtitle: c.prices(d.currency) },
    tasks: {
      title: d.tasks.title,
      hint: d.tasks.hint,
      recommendKicker: c.recommend,
      detailsLabel: c.details,
      items: d.tasks.items.map(([label, icon, serviceId, hint], i) => ({ id: `t${i + 1}`, label, icon, serviceId, hint })),
      fallback: d.tasks.fallback,
    },
    matrix: { rows: c.matrix },
    specTable: { title: c.specTitle, subtitle: c.specSub, rows: d.spec.map(([label, value]) => ({ label, value })) },
    payment: { depositPercent: 25, inPersonMethods: [], cancelHours: 4, rescheduleHours: 4, lateToleranceMinutes: 15 },
    portfolio: {
      eyebrow: null,
      title: null,
      items: d.jobs.map(([title, caption], i) => ({ imageKey: `gallery-${i + 1}`, title, caption })),
    },
    services: svc,
    reviews: { items: [] },
    about: null,
    faq: { title: c.faqTitle, items: d.faq.map(([qq, a]) => ({ q: qq, a })) },
    stats: [],
    location: {
      eyebrow: "",
      title: c.locTitle,
      kind: c.zoneKind,
      studioKind: "home_visits",
      addressMode: "zone_only",
      zone: d.zone,
      city: d.city,
      headline: c.zoneKind,
      sub: c.zoneSub,
      rows: [],
      areas: d.areas,
      arrivalNote: d.arrival,
    },
    footer: { columns: [] },
    mockupOnly: { note: "Fictional demo content. Work-order numbers on the job cards are sample captions." },
  };
}


// ── TAL-93206 Gary Lindqvist, electrician, Phoenix (en, USD) ────────────────
const GARY: Def = {
  code: "TAL-93206",
  lang: "en",
  currency: "USD",
  name: "Gary Lindqvist",
  trade: "electrician",
  city: "Phoenix",
  topSub: "Electrician · Phoenix",
  call: "Call",
  urgency: {
    statusOn: "Emergencies today",
    statusOff: "No emergencies today",
    title: "Same-day help",
    lead: "Meanwhile:",
    safety: "if you see sparks or smell burning, turn off the main breaker and stay away from the panel.",
    on: "Ask now",
    off: "See times",
    serviceId: "insp",
  },
  hero: {
    eyebrow: "Schedule open · Phoenix and the East Valley",
    headline: "Electrical work done right, {i}priced before I start.{/i}",
    facts: [["Response", "Next business day"], ["Warranty", "1 year on labor"], ["Price", "Before I start"], ["Inspection", "$95"]],
    badges: ["Homes and small shops", "Quote before work"],
    ctas: ["See times", "What do you need?"],
  },
  tasks: {
    title: "What is going on?",
    hint: "Pick one",
    items: [
      ["A breaker keeps tripping", "zap", "insp", "Usually an overload or a short. I check first, then quote the repair."],
      ["Outlets or switches not working", "check", "insp", "An inspection finds the dead circuit and I quote the fix before I touch anything."],
      ["Install a light or ceiling fan", "sun", "fixture", "Priced per unit. Send me a photo of the ceiling and the fixture."],
      ["Old or full panel", "grid", "panel", "A panel swap is quoted from photos of your current panel and the number of circuits."],
      ["Rewire a room or the house", "home", "rewire", "Big jobs start with an inspection, then a written quote for the whole scope."],
    ],
    fallback: { kicker: "Not sure what it is?", badge: "Start here", serviceId: "insp", body: "Pick what you see at home and I will tell you what to book. If you are not sure, an inspection finds the problem and I quote the repair first." },
  },
  spec: [
    ["Voltage", "120 V and 240 V, homes and small shops"],
    ["Warranty", "1 year on labor, in writing"],
    ["Materials", "Brand and price on the quote, before you buy"],
    ["Price", "Always before I start"],
    ["Payment", "At the visit: card or cash"],
  ],
  jobs: [
    ["Panel diagnosis", "WO-0612 · Arcadia · 1 h"],
    ["Bedroom ceiling fan", "WO-0608 · Ahwatukee · 1 h"],
    ["Panel replacement", "WO-0601 · Biltmore · 1 day"],
    ["Outlets and switches", "WO-0597 · Arcadia · 2 h"],
    ["Breaker cleanup", "WO-0590 · Tempe · 3 h"],
    ["Load check", "WO-0584 · Scottsdale · 1 h"],
  ],
  services: [
    {
      id: "insp", cat: "Inspection", name: "Inspection visit", desc: "Diagnosis of a fault or general installation check; credited if you hire the work.",
      mode: "instant", price: 95, mins: 60, dur: "1 h", m: ["Quoted", "1 year", "Next business day"], emergency: true,
      options: [["House", "Up to 3 bedrooms", 0, ""], ["Apartment", "Up to 2 bedrooms", -10, "-$10"], ["Small shop", "Up to 1,200 sq ft", 25, "+$25"]], optionsLabel: "Property type",
      ask: [q.text("area", "Neighborhood or city", "Ex. Arcadia, Phoenix"), q.chips("what", "What is happening?", ["Breaker trips", "Dead outlet", "Flickering lights", "Burning smell", "General check"])],
    },
    {
      id: "fixture", cat: "Installations", name: "Light fixture or ceiling fan install", desc: "Per unit, with connection materials included.",
      mode: "request", price: 125, mins: 60, dur: "1 h per unit", unit: "per unit", m: ["Connection kit included", "1 year", "Within 2 days"],
      ask: [q.select("kind", "What are we installing?", ["Ceiling fan", "Light fixture", "Both"]), q.text("count", "How many?", "Ex. 3"), q.select("height", "Ceiling height", ["Up to 9 ft", "9 to 12 ft", "Over 12 ft"]), ask.en.when],
    },
    {
      id: "panel", cat: "Installations", name: "Electrical panel replacement", desc: "Removal of the old panel and installation of a new one; materials extra.",
      mode: "request", price: 2400, from: true, mins: 240, dur: "Half a day", m: ["Panel and breakers quoted", "1 year", "Quote within 2 days"],
      ask: [q.select("panelType", "Current panel", ["Fuses", "Old breaker panel", "Newer breaker panel", "Not sure"]), q.text("circuits", "Number of circuits", "Ex. 12"), q.area("notes", "Anything else I should know?"), ask.en.when],
    },
    {
      id: "rewire", cat: "Projects", name: "Rewiring or remodel", desc: "New wiring for rooms or a whole house, based on inspection.",
      mode: "quote", price: 4500, from: true, mins: 0, dur: "", m: ["Quoted by scope", "1 year", "Quote after an inspection"],
      ask: [q.chips("scope", "What needs wiring?", ["One room", "Kitchen", "Bathroom", "Whole house", "Addition"]), q.select("home", "Age of the home", ["Under 20 years", "20 to 50 years", "Over 50 years", "Not sure"]), q.area("notes", "Describe the project")],
    },
  ],
  faq: [
    ["Is the warranty in writing?", "Yes. When I finish I leave a note with the work done, the date and a year of warranty on labor."],
    ["Do you charge to come look?", "The inspection is $95 and you pay at the visit. If you hire me for the repair, I credit it."],
    ["Do you buy the materials?", "I can buy them and give you the receipt, or you buy from the list I send. Brand and price are on the quote first."],
    ["Do you work in small shops?", "Yes, small shops and offices up to about 1,200 square feet in a standard inspection. Bigger spaces are quoted."],
  ],
  zone: "Arcadia, Phoenix",
  areas: ["Phoenix", "Scottsdale", "Tempe", "Mesa", "Glendale", "Chandler"],
  arrival: "Outside this area I add travel to the quote.",
};

// ── TAL-93207 Tamika Sutton, plumber, Tampa (en, USD) ───────────────────────
const TAMIKA: Def = {
  code: "TAL-93207",
  lang: "en",
  currency: "USD",
  name: "Tamika Sutton",
  trade: "plumber",
  city: "Tampa",
  topSub: "Plumber · Tampa",
  call: "Call",
  urgency: {
    statusOn: "Emergencies today",
    statusOff: "No emergencies today",
    title: "Active leak?",
    lead: "Right now:",
    safety: "close the water shutoff valve, or the main at the meter, and turn off the water heater if it is leaking.",
    on: "Ask now",
    off: "See times",
    serviceId: "leak",
  },
  hero: {
    eyebrow: "Schedule open · Tampa and Hillsborough County",
    headline: "Plumbing that stays fixed, {i}with the price up front.{/i}",
    facts: [["Response", "Same or next day"], ["Warranty", "90 days on repairs"], ["Price", "Before I start"], ["Leak check", "$95"]],
    badges: ["Homes and apartments", "Tools included"],
    ctas: ["See times", "What do you need?"],
  },
  tasks: {
    title: "What is going on?",
    hint: "Pick one",
    items: [
      ["I think there is a leak", "droplet", "leak", "I find where it is coming from and quote the repair. The visit is credited if I do the repair."],
      ["Slow or clogged drain", "waves", "drain", "Sink, shower or kitchen drain. I bring the tools and clear it on the visit."],
      ["Replace a toilet, sink or faucet", "home", "fixture", "Priced per piece. Tell me what you are replacing and send a photo of the space."],
      ["No hot water", "flame", "leak", "A leak check covers the water heater too. I tell you what it needs before any repair."],
      ["Monthly check for a rental", "calendar", "rental", "One visit to check faucets, toilets and the water heater in your unit."],
    ],
    fallback: { kicker: "Not sure what it is?", badge: "Start here", serviceId: "leak", body: "Tell me what you see or hear. If you are not sure, a leak check finds the problem and I quote the repair before I start." },
  },
  spec: [
    ["Work", "Leaks, drains, fixtures and water heaters"],
    ["Warranty", "90 days on repairs, in writing"],
    ["Materials", "Fixtures are extra and priced per piece"],
    ["Price", "Always before I start"],
    ["Payment", "At the visit: card or cash"],
  ],
  jobs: [
    ["Ceiling leak check", "WO-0318 · Seminole Heights · 1 h"],
    ["Kitchen drain cleared", "WO-0315 · Ybor City · 1 h"],
    ["New bathroom faucet", "WO-0311 · Hyde Park · 1 h"],
    ["Rental unit check", "WO-0307 · Channelside · 1 h"],
    ["Valve and pipe check", "WO-0302 · Seminole Heights · 1 h"],
    ["Valve adjustment", "WO-0299 · Carrollwood · 30 min"],
  ],
  services: [
    {
      id: "leak", cat: "Inspection", name: "Leak check", desc: "I locate the leak and quote the repair; credited if I do the repair.",
      mode: "instant", price: 95, mins: 60, dur: "1 h", m: ["Quoted", "90 days", "Same or next day"], emergency: true,
      ask: [q.text("area", "Neighborhood or city", "Ex. Seminole Heights, Tampa"), q.chips("where", "Where is it?", ["Under a sink", "Ceiling", "Wall", "Water heater", "Outside", "Not sure"]), q.select("size", "How bad is it?", ["A drip", "A steady leak", "Water is spreading"])],
    },
    {
      id: "drain", cat: "Repairs", name: "Drain clearing", desc: "Sink, shower or kitchen drain, tools included.",
      mode: "request", price: 165, mins: 90, dur: "1 h 30", m: ["Tools included", "30 days", "Same or next day"],
      ask: [q.select("drain", "Which drain?", ["Kitchen sink", "Bathroom sink", "Shower or tub", "Other"]), q.chips("signs", "What do you notice?", ["Slow", "Fully blocked", "Bad smell", "Gurgling"]), ask.en.when],
    },
    {
      id: "fixture", cat: "Installations", name: "Bathroom fixture replacement", desc: "Installation of a toilet, sink or faucet; fixture extra, priced per piece.",
      mode: "quote", price: 250, from: true, mins: 180, dur: "About 3 h", m: ["Fixture bought by you or quoted", "90 days", "Quote within 2 days"],
      ask: [q.chips("what", "What are we replacing?", ["Toilet", "Sink", "Faucet", "Shower valve"]), q.select("have", "Do you have the fixture?", ["Yes, already bought", "No, please quote one"]), q.area("notes", "Anything else I should know?")],
    },
    {
      id: "rental", cat: "Rentals", name: "Monthly rental check", desc: "Visit to check faucets, toilets and water heater in a unit.",
      mode: "request", price: 120, mins: 60, dur: "1 h", m: ["Minor parts quoted", "30 days", "Within 3 days"],
      ask: [q.select("units", "How many units?", ["1", "2 to 3", "4 or more"]), q.text("area", "Neighborhood or city", "Ex. Channelside, Tampa"), ask.en.when],
    },
  ],
  faq: [
    ["Do you charge to find the leak?", "The leak check is $95 and you pay at the visit. If I do the repair, I credit it."],
    ["Do you bring your own tools?", "Yes. Drain clearing and repairs include my tools. Fixtures like toilets and faucets are extra."],
    ["Can you do a monthly check for my rental?", "Yes. One visit looks at faucets, toilets and the water heater, and I send you a short note of what I found."],
    ["What if the leak is bigger than expected?", "I stop and tell you before doing more. Any extra work is quoted first, and nothing is added without your yes."],
  ],
  zone: "Seminole Heights, Tampa",
  areas: ["Tampa", "Temple Terrace", "Brandon", "Carrollwood", "Riverview"],
  arrival: "Outside this area I add travel to the quote.",
};

// ── TAL-93208 Madera Tapia, carpenter, Morelia (es, MXN) ────────────────────
const MADERA: Def = {
  code: "TAL-93208",
  lang: "es",
  currency: "MXN",
  name: "Madera Tapia",
  trade: "carpenter",
  city: "Morelia",
  topSub: "Carpintero · Morelia",
  call: "Llamar",
  hero: {
    eyebrow: "Agenda abierta · Morelia y alrededores",
    headline: "Muebles a tu medida, {i}con precio y dibujo antes de empezar.{/i}",
    facts: [["Respuesta", "En 2 días"], ["Garantía", "6 meses"], ["Precio", "Antes de empezar"], ["Visita", "$400"]],
    factsEn: [["Response", "Within 2 days"], ["Warranty", "6 months"], ["Price", "Before I start"], ["Visit", "$400"]],
    badges: ["Pino y parota", "Taller propio"],
    ctas: ["Ver horarios", "¿Qué necesitas?"],
  },
  tasks: {
    title: "¿Qué necesitas?",
    hint: "Elige una opción",
    items: [
      ["Quiero un librero o un closet", "home", "librero", "Se diseña a tu medida. Primero la visita y el dibujo, luego el precio final."],
      ["Quiero repisas en mi pared", "grid", "repisas", "Juego de tres repisas de pino instaladas. Mándame una foto de la pared."],
      ["Tengo un mueble que restaurar", "sparkle", "restauracion", "Silla, mesa o cómoda. Lijado, reparación y barniz, con precio según el estado."],
      ["Necesito medidas y un dibujo", "calendar", "visita", "Voy, tomo medidas y te entrego un dibujo con precio. Se descuenta si me contratas."],
    ],
    fallback: { kicker: "¿No sabes por dónde empezar?", badge: "Empieza aquí", serviceId: "visita", body: "Cuéntame qué quieres hacer. Si aún no lo tienes claro, la visita sirve para medir, platicar opciones y darte un dibujo con precio." },
  },
  spec: [
    ["Maderas", "Pino, parota y MDF según el mueble"],
    ["Garantía", "6 meses en mano de obra, por escrito"],
    ["Materiales", "Madera y herrajes en la cotización, antes de comprar"],
    ["Precio", "Siempre antes de empezar"],
    ["Pago", "Anticipo al aprobar el dibujo; el resto al entregar"],
  ],
  jobs: [
    ["Librero a medida", "OT-0204 · Santa María · 3 semanas"],
    ["Repisas flotantes", "OT-0201 · Centro · 2 h"],
    ["Closet de pino", "OT-0198 · Chapultepec · 2 semanas"],
    ["Silla restaurada", "OT-0195 · taller · 4 días"],
    ["Corte y marcado", "OT-0192 · taller · 1 día"],
    ["Medidas en taller", "OT-0189 · taller · 1 día"],
  ],
  services: [
    {
      id: "visita", cat: "Proyectos", name: "Visita y medidas", desc: "Tomo medidas y te entrego dibujo con precio; se descuenta del trabajo.",
      mode: "instant", price: 400, mins: 60, dur: "1 h", m: ["Se cotizan", "6 meses", "En 2 días"],
      ask: [q.text("col", "Colonia", "Ej. Santa María, Morelia"), q.chips("que", "¿Qué quieres hacer?", ["Librero", "Closet", "Repisas", "Restaurar un mueble", "Otra cosa"]), ask.es.when],
    },
    {
      id: "repisas", cat: "Muebles", name: "Repisas flotantes", desc: "Juego de tres repisas de pino instaladas en tu pared.",
      mode: "request", price: 2400, mins: 120, dur: "2 h", unit: "el juego", m: ["Pino y herrajes incluidos", "6 meses", "En 3 días"],
      ask: [q.select("pared", "Tipo de pared", ["Tabique o ladrillo", "Concreto", "Tablaroca", "No sé"]), q.text("largo", "Largo aproximado (cm)", "Ej. 120"), q.area("notas", "¿Algo más que deba saber?")],
    },
    {
      id: "librero", cat: "Proyectos", name: "Librero o closet a medida", desc: "Diseño, fabricación e instalación; precio según medida y madera.",
      mode: "quote", price: 14000, from: true, mins: 0, dur: "", m: ["Madera y herrajes cotizados", "6 meses", "Dibujo en 1 semana"],
      ask: [q.select("mueble", "¿Qué quieres?", ["Librero", "Closet", "Mueble para TV", "Otro"]), q.text("medidas", "Medidas aproximadas", "Ej. 2.4 m de alto por 1.8 m de ancho"), q.select("madera", "Madera", ["Pino", "Parota", "No sé, recomiéndame"]), q.area("notas", "Cuéntame cómo lo imaginas")],
    },
    {
      id: "restauracion", cat: "Restauración", name: "Restauración de mueble", desc: "Lijado, reparación y barniz de una silla, mesa o cómoda.",
      mode: "request", price: 1800, from: true, mins: 0, dur: "Según el mueble", m: ["Barniz y pegamento incluidos", "6 meses", "En 3 días"],
      ask: [q.select("mueble", "¿Qué mueble es?", ["Silla", "Mesa", "Cómoda", "Otro"]), q.chips("estado", "¿Cómo está?", ["Flojo", "Rayado", "Con plaga", "Sin barniz"]), q.area("notas", "Cuéntame su historia o tu idea de acabado")],
    },
  ],
  faq: [
    ["¿Me das un dibujo antes de empezar?", "Sí. En la visita tomo medidas y después te mando un dibujo con precio. No empiezo sin tu aprobación."],
    ["¿Se descuenta la visita?", "Sí. Si me contratas el trabajo, los $400 de la visita se descuentan del precio final."],
    ["¿Qué maderas usas?", "Pino y parota en la mayoría de los muebles, y MDF cuando conviene al presupuesto. Te explico las diferencias antes de elegir."],
    ["¿Cuánto tarda un librero o un closet?", "Entre dos y tres semanas desde que apruebas el dibujo, según la medida y la madera."],
  ],
  zone: "Santa María, Morelia",
  areas: ["Morelia", "Tarímbaro", "Charo", "Álvaro Obregón", "Indaparapeo"],
  arrival: "Fuera de esta zona se agrega traslado a la cotización.",
};

// ── TAL-93209 Karla Beltrán, appliance technician, Hermosillo (es, MXN) ─────
const KARLA: Def = {
  code: "TAL-93209",
  lang: "es",
  currency: "MXN",
  name: "Karla Beltrán",
  trade: "appliance-repair",
  city: "Hermosillo",
  topSub: "Técnica de línea blanca · Hermosillo",
  call: "Llamar",
  urgency: {
    statusOn: "Urgencias hoy",
    statusOff: "Sin urgencias hoy",
    title: "Se descompuso hoy",
    lead: "Mientras tanto:",
    safety: "desconecta el aparato. Si es un minisplit, baja el interruptor; si la lavadora o el refri gotean, cierra la llave y seca el piso.",
    on: "Consultar",
    off: "Ver horarios",
    serviceId: "diag",
  },
  hero: {
    eyebrow: "Agenda abierta · Hermosillo",
    headline: "Tu aparato funcionando de nuevo, {i}con el precio antes de reparar.{/i}",
    facts: [["Respuesta", "Mismo día o siguiente"], ["Garantía", "3 meses en reparación"], ["Precio", "Antes de reparar"], ["Diagnóstico", "$450"]],
    factsEn: [["Response", "Same or next day"], ["Warranty", "3 months on repairs"], ["Price", "Before I repair"], ["Diagnostic", "$450"]],
    badges: ["Minisplit y línea blanca", "Refacciones con factura"],
    ctas: ["Ver horarios", "¿Qué necesitas?"],
  },
  tasks: {
    title: "¿Qué está pasando?",
    hint: "Elige una opción",
    items: [
      ["El minisplit no enfría", "sun", "diag", "Puede ser gas, limpieza o una falla eléctrica. Primero se revisa y luego se cotiza."],
      ["Quiero limpiar mi minisplit", "sparkle", "mantto", "Limpieza de evaporador, filtros y revisión de gas, por equipo."],
      ["La lavadora no funciona", "droplet", "reparacion", "Se revisa la falla y se cotiza la mano de obra; las refacciones van aparte."],
      ["El refri no enfría o gotea", "flame", "reparacion", "Reviso y te digo qué refacción necesita antes de cambiar nada."],
      ["Quiero instalar un minisplit", "home", "instalacion", "Instalación básica hasta 3 m de tubería. Mándame una foto de donde va."],
    ],
    fallback: { kicker: "¿No sabes qué es?", badge: "Empieza aquí", serviceId: "diag", body: "Cuéntame qué hace tu aparato. Si no estás segura, el diagnóstico encuentra la falla y te doy el precio antes de reparar." },
  },
  spec: [
    ["Aparatos", "Minisplit, lavadora, refrigerador y estufa"],
    ["Garantía", "3 meses en la reparación, por escrito"],
    ["Refacciones", "Con factura y precio antes de cambiarlas"],
    ["Precio", "Siempre antes de reparar"],
    ["Pago", "En la visita: efectivo o transferencia"],
  ],
  jobs: [
    ["Diagnóstico de lavadora", "OT-0731 · Pitic · 1 h"],
    ["Presión de minisplit", "OT-0728 · Centenario · 1 h"],
    ["Reparación de lavadora", "OT-0724 · Modelo · 2 h"],
    ["Entrega de minisplit", "OT-0720 · Pitic · 4 h"],
    ["Limpieza de filtro", "OT-0716 · Country Club · 1 h 30"],
    ["Revisión interna", "OT-0713 · Villa de Seris · 1 h 30"],
  ],
  services: [
    {
      id: "diag", cat: "Diagnóstico", name: "Diagnóstico a domicilio", desc: "Reviso el aparato y te doy precio; se descuenta si hago la reparación.",
      mode: "instant", price: 450, mins: 60, dur: "1 h", m: ["Se cotizan", "3 meses", "Mismo día o siguiente"], emergency: true,
      ask: [q.text("col", "Colonia", "Ej. Pitic, Hermosillo"), q.select("aparato", "¿Qué aparato es?", ["Minisplit", "Lavadora", "Refrigerador", "Estufa", "Otro"]), q.text("marca", "Marca y modelo", "Ej. Mirage, 12,000 BTU"), q.area("falla", "¿Qué hace o qué no hace?")],
    },
    {
      id: "mantto", cat: "Mantenimiento", name: "Mantenimiento de minisplit", desc: "Limpieza de evaporador, filtros y revisión de gas, por equipo.",
      mode: "request", price: 850, mins: 90, dur: "1 h 30", unit: "por equipo", m: ["Productos de limpieza incluidos", "1 mes", "En 2 días"],
      ask: [q.select("equipos", "¿Cuántos equipos?", ["1", "2", "3 o más"]), q.select("ultimo", "Último mantenimiento", ["Menos de 6 meses", "6 a 12 meses", "Más de un año", "Nunca"]), ask.es.when],
    },
    {
      id: "reparacion", cat: "Reparaciones", name: "Reparación de lavadora o refri", desc: "Mano de obra según falla; refacciones aparte.",
      mode: "quote", price: 900, from: true, mins: 120, dur: "Según la falla", m: ["Refacciones aparte, con factura", "3 meses", "En 1 o 2 días"],
      ask: [q.select("aparato", "¿Qué aparato es?", ["Lavadora", "Refrigerador", "Otro"]), q.text("marca", "Marca y modelo"), q.chips("falla", "¿Qué falla tiene?", ["No enciende", "No enfría", "Gotea", "Hace ruido", "No centrifuga"]), q.area("notas", "Cuéntame más")],
    },
    {
      id: "instalacion", cat: "Instalaciones", name: "Instalación de minisplit", desc: "Instalación básica hasta 3 m de tubería.",
      mode: "request", price: 3200, mins: 240, dur: "Medio día", m: ["Equipo y materiales extra", "6 meses en la instalación", "En 3 días"],
      ask: [q.select("capacidad", "Capacidad del equipo", ["12,000 BTU", "18,000 BTU", "24,000 BTU", "No sé"]), q.select("piso", "¿Dónde se instala?", ["Planta baja", "Segundo piso", "Azotea"]), q.text("metros", "Distancia aproximada entre unidades (m)", "Ej. 3"), ask.es.when],
    },
  ],
  faq: [
    ["¿Cobras por revisar?", "El diagnóstico cuesta $450 y se paga en la visita. Si decides la reparación conmigo, se descuenta."],
    ["¿Las refacciones tienen factura?", "Sí. Te digo la refacción y el precio antes de cambiarla, y te entrego la factura."],
    ["¿Cada cuánto conviene dar mantenimiento al minisplit?", "Una vez al año, y cada seis meses si lo usas todo el verano o tienes mascotas."],
    ["¿Reparas todas las marcas?", "Trabajo con las marcas más comunes de minisplit, lavadora y refrigerador. Si no puedo con la tuya, te lo digo en la revisión."],
  ],
  zone: "Pitic, Hermosillo",
  areas: ["Hermosillo", "Bahía de Kino", "Poblado Miguel Alemán", "San Pedro el Saucito"],
  arrival: "Fuera de esta zona se agrega traslado a la cotización.",
};


const DEFS: Def[] = [GARY, TAMIKA, MADERA, KARLA, OMAR, GRACE, RAMON];

/** Fixture per profile code. */
export const GRIDLINE_DEMO_FIXTURES: Readonly<Record<string, DemoContentFixture>> = Object.fromEntries(DEFS.map((d) => [d.code, fixture(d)]));

export type { FixtureMatrixCells };
