import type { FixtureBriefQuestion, FixtureTranslation } from "./content-fixture";

export type Lang = "en" | "es";
export type Mode = "instant" | "request" | "quote";

export const q = {
  chips: (key: string, label: string, options: string[]): FixtureBriefQuestion => ({ key, label, type: "chips", options }),
  select: (key: string, label: string, options: string[]): FixtureBriefQuestion => ({ key, label, type: "select", options }),
  area: (key: string, label: string, placeholder?: string): FixtureBriefQuestion => ({ key, label, type: "area", ...(placeholder ? { placeholder } : {}) }),
  text: (key: string, label: string, placeholder?: string): FixtureBriefQuestion => ({ key, label, ...(placeholder ? { placeholder } : {}) }),
};

export type Svc = {
  id: string;
  cat: string;
  name: string;
  desc: string;
  mode: Mode;
  price: number;
  from?: boolean;
  /** Minutes; 0 = no fixed length. */
  mins: number;
  dur: string;
  /** materials, warranty, response */
  m: [string, string, string];
  ask: FixtureBriefQuestion[];
  emergency?: boolean;
  unit?: string;
  /** label, note, price delta, delta text */
  options?: Array<[string, string, number, string]>;
  optionsLabel?: string;
};

export type Task = [label: string, icon: string, serviceId: string, hint: string];

export type Def = {
  code: string;
  lang: Lang;
  currency: "MXN" | "USD";
  name: string;
  trade: string;
  city: string;
  topSub: string;
  call: string;
  urgency?: { statusOn: string; statusOff: string; title: string; lead: string; safety: string; on: string; off: string; serviceId: string };
  hero: { eyebrow: string; headline: string; facts: Array<[string, string]>; /** The spec cells in English, for a Spanish-primary demo. */ factsEn?: Array<[string, string]>; badges: string[]; ctas: [string, string] };
  tasks: { title: string; hint: string; items: Task[]; fallback: { kicker: string; badge: string; serviceId: string; body: string } };
  spec: Array<[string, string]>;
  jobs: Array<[string, string]>;
  services: Svc[];
  faq: Array<[string, string]>;
  zone: string;
  areas: string[];
  arrival: string;
  /** Second language (the talent does not speak it). */
  second?: FixtureTranslation;
};

export const ask = {
  en: {
    where: q.text("area", "Neighborhood or city", "Ex. Arcadia, Phoenix"),
    when: q.chips("when", "When works best?", ["This week", "Next week", "Weekends", "Flexible"]),
  },
  es: {
    where: q.text("col", "Colonia", "Ej. Centro, Morelia"),
    when: q.chips("cuando", "¿Cuándo te viene bien?", ["Esta semana", "La próxima", "Fin de semana", "Flexible"]),
  },
};

// ── TAL-93210 Omar Siddiqui, computer technician, Austin (en, USD) ──────────
export const OMAR: Def = {
  code: "TAL-93210",
  lang: "en",
  currency: "USD",
  name: "Omar Siddiqui",
  trade: "computer-technician",
  city: "Austin",
  topSub: "Computer technician · Austin",
  call: "Call",
  hero: {
    eyebrow: "Schedule open · Austin and remote",
    headline: "Computer trouble fixed, {i}with a plain-language report.{/i}",
    facts: [["Response", "Within 1 business day"], ["Remote", "$75 per hour"], ["Price", "Before I start"], ["Diagnostic", "$110"]],
    badges: ["Homes and small offices", "English and Urdu"],
    ctas: ["See times", "What do you need?"],
  },
  tasks: {
    title: "What is going on?",
    hint: "Pick one",
    items: [
      ["My computer is slow or acting odd", "sparkle", "remote", "Many software problems can be fixed remotely in an hour. I connect, look and tell you what I did."],
      ["It will not turn on or has a hardware issue", "settings", "diag", "I come to you, open it up and tell you what it needs before anything is replaced."],
      ["I just bought a new computer", "check", "setup", "I move your files, install your software and set up automatic backup."],
      ["Wi-Fi or network problems", "globe", "diag", "I check your computer and network and tell you what is causing it."],
      ["My office needs steady IT help", "briefcase", "office", "Monthly visits and remote support for offices up to 10 devices, quoted by scope."],
    ],
    fallback: { kicker: "Not sure what it is?", badge: "Start here", serviceId: "remote", body: "Tell me what the computer is doing. If you are not sure, a remote session is the fastest way to find out, and I tell you the cost before I fix anything." },
  },
  spec: [
    ["Systems", "Windows, macOS, home networks and printers"],
    ["Reports", "A short written summary after each visit"],
    ["Backups", "Automatic backup set up on new computers"],
    ["Price", "Always before I start"],
    ["Payment", "After the session: card or transfer"],
  ],
  jobs: [
    ["Remote session", "WO-0220 · Online · 1 h"],
    ["Desktop check", "WO-0217 · East Austin · 1 h"],
    ["New laptop setup", "WO-0214 · Mueller · 3 h"],
    ["Small office check", "WO-0210 · Downtown · 2 h"],
    ["Laptop opened for repair", "WO-0207 · Hyde Park · 1 h"],
    ["Hardware inspection", "WO-0203 · Zilker · 1 h"],
  ],
  services: [
    {
      id: "remote", cat: "Support", name: "Remote support", desc: "I connect to your machine to fix a software problem.",
      mode: "instant", price: 75, mins: 60, dur: "1 h", unit: "per hour", m: ["None needed", "30 days on the fix", "Within 1 business day"],
      ask: [q.chips("os", "Which system?", ["Windows", "Mac", "Not sure"]), q.area("issue", "What is it doing?", "Ex. very slow since last week")],
    },
    {
      id: "diag", cat: "Support", name: "In-home diagnostic", desc: "I check your computer or network and tell you what it needs.",
      mode: "instant", price: 110, mins: 60, dur: "1 h", m: ["Parts quoted first", "30 days on the repair", "Within 2 days"],
      ask: [q.text("area", "Neighborhood or city", "Ex. East Austin"), q.chips("kind", "What needs a look?", ["Desktop", "Laptop", "Wi-Fi or network", "Printer"]), q.area("issue", "What is going on?")],
    },
    {
      id: "setup", cat: "Setup", name: "New device setup", desc: "I transfer your files, install software and set up automatic backup.",
      mode: "request", price: 225, mins: 180, dur: "About 3 h", m: ["Software licenses are yours", "30 days", "Within 3 days"],
      ask: [q.select("device", "New device", ["Windows laptop", "MacBook", "Desktop", "Other"]), q.chips("move", "What should I move?", ["Files", "Browser bookmarks", "Email", "Photos"]), ask.en.when],
    },
    {
      id: "office", cat: "Business", name: "Monthly office support", desc: "Visits and remote support for offices of up to 10 devices.",
      mode: "quote", price: 600, from: true, mins: 0, dur: "", m: ["Quoted by scope", "Per agreement", "Quote within 2 days"], unit: "per month",
      ask: [q.select("devices", "How many devices?", ["1 to 3", "4 to 6", "7 to 10"]), q.chips("needs", "What do you need?", ["Monthly visit", "Remote help", "Backups", "Network care"]), q.area("notes", "Tell me about the office")],
    },
  ],
  faq: [
    ["Can you fix it remotely?", "Most software problems, yes. If I need to see the hardware, I tell you before you pay for anything else."],
    ["Do you keep my files private?", "I only open what I need to fix the problem, and I never copy your files. I can sit with you while I work."],
    ["Do you come to my home?", "Yes, around Austin. The in-home diagnostic is $110 and covers a computer or your network."],
    ["What do I get after a visit?", "A short written summary of what I found, what I did and what I recommend next, in plain language."],
  ],
  zone: "East Austin",
  areas: ["Austin", "Round Rock", "Cedar Park", "Pflugerville", "Georgetown"],
  arrival: "Outside this area I add travel to the quote.",
};

// ── TAL-93211 Grace Tanaka, smart home installer, Seattle (en, USD) ─────────
export const GRACE: Def = {
  code: "TAL-93211",
  lang: "en",
  currency: "USD",
  name: "Grace Tanaka",
  trade: "smart-home-installer",
  city: "Seattle",
  topSub: "Smart home installer · Seattle",
  call: "Call",
  hero: {
    eyebrow: "Schedule open · Seattle and the Eastside",
    headline: "A smart home that just works, {i}set up and explained.{/i}",
    facts: [["Response", "Within 2 business days"], ["Setup", "In your app, with you"], ["Price", "Before I start"], ["Consultation", "$110"]],
    badges: ["Doorbells, locks and Wi-Fi", "Equipment list first"],
    ctas: ["See times", "What do you need?"],
  },
  tasks: {
    title: "What do you want to do?",
    hint: "Pick one",
    items: [
      ["I want a video doorbell or smart lock", "lock", "doorbell", "I install it and set it up in your app, then show you how it works."],
      ["My Wi-Fi does not reach everywhere", "globe", "wifi", "A mesh network and a coverage check, room by room. Equipment is extra."],
      ["I want cameras, lights and routines", "sun", "home", "A full plan for your house, quoted after a walk-through."],
      ["I do not know where to start", "calendar", "consult", "We walk through your home and I give you an equipment list and an installation price."],
    ],
    fallback: { kicker: "Not sure where to start?", badge: "Start here", serviceId: "consult", body: "Tell me what you would like to automate. A consultation visit gives you a plain equipment list and the installation price before you buy anything." },
  },
  spec: [
    ["Devices", "Doorbells, locks, cameras, lights and mesh Wi-Fi"],
    ["Setup", "Configured in your app, with you, before I leave"],
    ["Equipment", "Listed with prices first; you can buy it or I can"],
    ["Price", "Always before I start"],
    ["Payment", "After the install: card or transfer"],
  ],
  jobs: [
    ["Consultation", "WO-0142 · Ballard · 1 h"],
    ["Doorbell app setup", "WO-0139 · Fremont · 30 min"],
    ["Mesh Wi-Fi", "WO-0136 · Capitol Hill · 2 h"],
    ["Smart home dashboard", "WO-0133 · Ballard · 3 h"],
    ["Doorbell install", "WO-0130 · Ballard · 1 h 30"],
    ["Front door install", "WO-0127 · Queen Anne · 1 h 30"],
  ],
  services: [
    {
      id: "consult", cat: "Consultation", name: "Consultation visit", desc: "We walk through your home and I give you an equipment list and installation price.",
      mode: "instant", price: 110, mins: 60, dur: "1 h", m: ["Equipment listed with prices", "Not applicable", "Within 2 business days"],
      ask: [q.text("area", "Neighborhood or city", "Ex. Ballard, Seattle"), q.select("home", "Type of home", ["House", "Apartment", "Townhouse", "Other"]), q.chips("goals", "What interests you?", ["Doorbell", "Smart lock", "Cameras", "Lights", "Wi-Fi", "Not sure"])],
    },
    {
      id: "doorbell", cat: "Installations", name: "Video doorbell or smart lock install", desc: "Installation and setup of one device in your app.",
      mode: "request", price: 165, mins: 90, dur: "1 h 30", unit: "per device", m: ["Device bought by you or quoted", "1 year on the install", "Within 3 days"],
      ask: [q.select("device", "Which device?", ["Video doorbell", "Smart lock", "Both"]), q.text("brand", "Brand and model, if you have it"), q.select("door", "Door type", ["Wood", "Metal", "Glass", "Not sure"]), ask.en.when],
    },
    {
      id: "wifi", cat: "Installations", name: "Whole-home Wi-Fi", desc: "Mesh network installation and coverage tuning; equipment extra.",
      mode: "request", price: 300, mins: 150, dur: "About 2 h 30", m: ["Mesh kit quoted", "1 year on the install", "Within 3 days"],
      ask: [q.text("sqft", "Approximate home size (sq ft)", "Ex. 1,800"), q.select("floors", "Floors", ["1", "2", "3 or more"]), q.chips("dead", "Where is the signal weak?", ["Bedrooms", "Basement", "Backyard", "Office"]), ask.en.when],
    },
    {
      id: "home", cat: "Projects", name: "Complete smart home", desc: "Cameras, lights, locks and routines; price depends on home and equipment.",
      mode: "quote", price: 2500, from: true, mins: 0, dur: "", m: ["Equipment quoted by scope", "1 year on the install", "Quote after a walk-through"],
      ask: [q.chips("goals", "What should it cover?", ["Cameras", "Lights", "Locks", "Thermostat", "Routines", "Wi-Fi"]), q.select("home", "Type of home", ["House", "Apartment", "Townhouse"]), q.area("notes", "Describe what you have in mind")],
    },
  ],
  faq: [
    ["Do I have to buy equipment from you?", "No. I give you a list with prices first. You can buy it yourself or ask me to, and I install either way."],
    ["Will it work with my phone?", "Yes. I set everything up in your app, with you, and show you the basics before I leave."],
    ["Is there a warranty on the install?", "Yes, a year on my installation work. Equipment follows the maker's warranty."],
    ["What if my Wi-Fi is already good?", "Then we skip it. A consultation checks coverage first and I only recommend what you need."],
  ],
  zone: "Ballard, Seattle",
  areas: ["Seattle", "Bellevue", "Kirkland", "Shoreline", "Redmond"],
  arrival: "Outside this area I add travel to the quote.",
};

// ── TAL-93212 Don Ramón Arreglos, handyperson, Mazatlán (es + en, MXN) ──────
export const RAMON: Def = {
  code: "TAL-93212",
  lang: "es",
  currency: "MXN",
  name: "Don Ramón Arreglos",
  trade: "handyman",
  city: "Mazatlán",
  topSub: "Arreglos en casa · Mazatlán",
  call: "Llamar",
  urgency: {
    statusOn: "Urgencias hoy",
    statusOff: "Sin urgencias hoy",
    title: "Algo no puede esperar",
    lead: "Mientras tanto:",
    safety: "si hay una fuga de agua, cierra la llave de paso; si es la chapa de la puerta, no la fuerces.",
    on: "Consultar",
    off: "Ver horarios",
    serviceId: "visita",
  },
  hero: {
    eyebrow: "Agenda abierta · Mazatlán",
    headline: "Esos pendientes de la casa, {i}resueltos con precio claro.{/i}",
    facts: [["Respuesta", "En 1 o 2 días"], ["Visita", "$400"], ["Por hora", "$350"], ["Precio", "Antes de empezar"]],
    factsEn: [["Response", "Within 1 or 2 days"], ["Visit", "$400"], ["Per hour", "$350"], ["Price", "Before I start"]],
    badges: ["Casas y departamentos", "Herramienta incluida"],
    ctas: ["Ver horarios", "¿Qué necesitas?"],
  },
  tasks: {
    title: "¿Qué necesitas?",
    hint: "Elige una opción",
    items: [
      ["Tengo varios arreglos pendientes", "check", "visita", "Reviso tu lista, te doy precio y resuelvo lo rápido en esa visita."],
      ["Colgar, ajustar o cambiar una chapa", "settings", "hora", "Por hora y con herramienta incluida. Anota todo lo que quieras resolver."],
      ["Armar un mueble", "home", "muebles", "Por mueble mediano: cómoda, escritorio o base de cama."],
      ["Preparar mi casa de temporada", "sun", "temporada", "Revisión y arreglos antes de que llegues, con precio según tu lista."],
    ],
    fallback: { kicker: "¿No sabes por dónde empezar?", badge: "Empieza aquí", serviceId: "visita", body: "Haz tu lista de pendientes, aunque sea corta. En la visita la reviso contigo, te doy el precio y resuelvo lo más rápido ahí mismo." },
  },
  spec: [
    ["Trabajos", "Colgar, ajustar, armar, sellar y cambiar chapas"],
    ["Herramienta", "Incluida en las visitas y en las horas"],
    ["Materiales", "Se compran con tu visto bueno, con ticket"],
    ["Precio", "Siempre antes de empezar"],
    ["Pago", "Al terminar: efectivo o transferencia"],
  ],
  jobs: [
    ["Lista de arreglos", "OT-0350 · Centro Histórico · 1 h"],
    ["Bisagra de gabinete", "OT-0347 · Playa Sur · 30 min"],
    ["Base de cama armada", "OT-0344 · Zona Dorada · 1 h 30"],
    ["Casa lista", "OT-0341 · Marina · 1 día"],
    ["Cuadro colgado", "OT-0338 · Centro Histórico · 30 min"],
    ["Gancho en pared", "OT-0335 · Telleria · 30 min"],
  ],
  services: [
    {
      id: "visita", cat: "Visitas", name: "Visita para lista de arreglos", desc: "Reviso tu lista, te doy precio y resuelvo lo rápido en esa visita.",
      mode: "instant", price: 400, mins: 60, dur: "1 h", m: ["Se compran con tu visto bueno", "1 mes", "En 1 o 2 días"], emergency: true,
      ask: [q.text("col", "Colonia", "Ej. Centro Histórico, Mazatlán"), q.chips("que", "¿Qué hay pendiente?", ["Chapas", "Cuadros y repisas", "Muebles", "Sellado", "Eléctrico menor", "Otro"]), q.area("lista", "Escribe tu lista de pendientes")],
    },
    {
      id: "hora", cat: "Visitas", name: "Hora de arreglos", desc: "Colgar, ajustar, cambiar chapas o sellar, por hora con herramienta.",
      mode: "instant", price: 350, mins: 60, dur: "1 h", unit: "por hora", m: ["Se compran con tu visto bueno", "1 mes", "En 1 o 2 días"],
      ask: [q.text("col", "Colonia", "Ej. Telleria, Mazatlán"), q.select("horas", "¿Cuántas horas calculas?", ["1", "2", "3", "4 o más", "No sé"]), q.area("lista", "¿Qué quieres resolver?")],
    },
    {
      id: "muebles", cat: "Muebles", name: "Armado de muebles", desc: "Por mueble mediano como cómoda, escritorio o base de cama.",
      mode: "request", price: 600, mins: 90, dur: "1 h 30", unit: "por mueble", m: ["Herrajes del fabricante", "1 mes", "En 2 días"],
      ask: [q.select("mueble", "¿Qué mueble es?", ["Cómoda", "Escritorio", "Base de cama", "Librero", "Otro"]), q.text("cuantos", "¿Cuántos?", "Ej. 2"), q.select("piso", "¿Dónde está?", ["Planta baja", "Con escalera", "Con elevador"]), ask.es.when],
    },
    {
      id: "temporada", cat: "Casas de temporada", name: "Casa lista antes de llegar", desc: "Revisión y arreglos previos a tu temporada; precio según lista.",
      mode: "quote", price: 1800, from: true, mins: 0, dur: "", m: ["Se compran con tu visto bueno", "1 mes", "Cotización en 2 días"],
      ask: [q.text("llegada", "¿Cuándo llegas?", "Ej. 15 de diciembre"), q.chips("revisar", "¿Qué reviso?", ["Agua y fugas", "Chapas y puertas", "Aire acondicionado", "Limpieza ligera", "Pintura"]), q.area("lista", "Cuéntame de la casa y lo que necesitas")],
    },
  ],
  faq: [
    ["¿Qué incluye la visita?", "Reviso tu lista, te doy precio y resuelvo lo rápido en esa misma visita. Lo que requiere más tiempo queda cotizado."],
    ["¿Traes herramienta?", "Sí. La visita y la hora de arreglos incluyen mi herramienta. Los materiales se compran contigo, con ticket."],
    ["¿Atiendes casas de temporada?", "Sí. Reviso y arreglo antes de que llegues, y te mando fotos al terminar. El precio depende de tu lista."],
    ["¿Puedo escribirte en inglés?", "Sí. El sitio está en español e inglés y recibo tus mensajes en ambos idiomas."],
  ],
  zone: "Centro Histórico, Mazatlán",
  areas: ["Mazatlán", "Villa Unión", "Urías", "El Habal"],
  arrival: "Fuera de esta zona se agrega traslado a la cotización.",
  second: {
    services: {
      visita: { name: "Visit for your repair list", description: "I review your list, quote it and fix the quick items during that visit.", category: "Visits", matrix: { materials: "Bought with your approval", warranty: "1 month", response: "In 1 or 2 days" } },
      hora: { name: "Hour of repairs", description: "Hanging, adjusting, changing locks or sealing, per hour with tools.", category: "Visits", matrix: { materials: "Bought with your approval", warranty: "1 month", response: "In 1 or 2 days" } },
      muebles: { name: "Furniture assembly", description: "Per medium piece such as a dresser, desk or bed frame.", category: "Furniture", matrix: { materials: "Maker's hardware", warranty: "1 month", response: "In 2 days" } },
      temporada: { name: "Home ready before you arrive", description: "Inspection and repairs before your season; price depends on the list.", category: "Seasonal homes", matrix: { materials: "Bought with your approval", warranty: "1 month", response: "Quote in 2 days" } },
    },
    faq: [
      { q: "What does the visit include?", a: "I review your list, quote it and fix the quick items during that same visit. Anything that needs more time is quoted." },
      { q: "Do you bring tools?", a: "Yes. The visit and the hour of repairs include my tools. Materials are bought with you, with a receipt." },
      { q: "Do you take care of seasonal homes?", a: "Yes. I inspect and repair before you arrive and send photos when I finish. The price depends on your list." },
      { q: "Can I write to you in English?", a: "Yes. The site is in Spanish and English, and I receive your messages in both languages." },
    ],
    tasks: {
      t1: { label: "I have several repairs pending", hint: "I review your list, quote it and fix the quick items during that visit." },
      t2: { label: "Hang, adjust or change a lock", hint: "By the hour with tools included. Write down everything you want fixed." },
      t3: { label: "Assemble furniture", hint: "Per medium piece: dresser, desk or bed frame." },
      t4: { label: "Get my seasonal home ready", hint: "Inspection and repairs before you arrive, priced from your list." },
    },
    taskDefault: { kicker: "Not sure where to start?", hint: "Make a list of what is pending, even a short one. At the visit I review it with you, quote it and fix the quick items right there." },
    // TUL-302: page chrome EN so site-copy writes props.i18n.en on every Gridline block.
    topBar: { subtitle: "Home repairs · Mazatlan", phoneAriaLabel: "Call" },
    urgency: {
      statusOn: "Emergencies today",
      statusOff: "No emergencies today",
      band: {
        title: "Something cannot wait",
        safetyLead: "Meanwhile:",
        safety: "if there is a water leak, shut the main valve; if it is the door lock, do not force it.",
      },
      ctaLabel: "Ask now",
    },
    hero: {
      eyebrow: "Schedule open · Mazatlan",
      headline: "Those home to-dos, {i}done with a clear price.{/i}",
      badges: ["Homes and apartments", "Tools included"],
      ctas: ["See times", "What do you need?"],
    },
    tasksTitle: "What do you need?",
    specTable: {
      title: "Specifications",
      subtitle: "How I work",
      rows: [
        { label: "Jobs", value: "Hang, adjust, assemble, seal and change locks" },
        { label: "Tools", value: "Included on visits and hourly work" },
        { label: "Materials", value: "Bought with your approval, with a receipt" },
        { label: "Price", value: "Always before I start" },
        { label: "Payment", value: "When I finish: cash or transfer" },
      ],
    },
    menu: { title: "Services and prices", subtitle: "Prices in MXN" },
  },
};
