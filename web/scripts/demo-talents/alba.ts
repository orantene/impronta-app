/**
 * ALBA, Maison v2's demo talent (2026-09-28). Fictional. Every string, price,
 * duration, mode, photo and review below is the Maison v2 proposal artifact's
 * own demo data word for word (Experience tab `DEMO` object, Images tab
 * sources). Reviews are shown with a "Reseña de demo" label on the site; they
 * are demo content, not real client feedback. Bookings on a demo are refused
 * server-side (is_demo guard) and every offering reserves for free: no card,
 * no charge, ever.
 *
 * Photos: the proposal's Unsplash picks (served locally for the design-diff
 * harness from ~/.claude/mockup-serve/maison-v2/img). `unsplash` is the photo
 * id recorded as the source on each media asset.
 */
import type { DemoTalent } from "./demo-types";
import { ALBA_PHOTO_SOURCES } from "./alba-photos";

export { ALBA_PHOTO_SOURCES };

export const ALBA: DemoTalent = {
  profileCode: "TAL-93020",
  email: "demo-alba-unas@impronta.test",
  displayName: "Alba",
  siteSlug: "alba-nail-artist",
  city: "Mérida",
  serviceCategorySlug: "beauty-services",
  talentTypeSlug: "nail-artist",
  theme: "maison-v2",
  palette: "rose",
  // Proposal: "Lun a sáb, 9:00 a 20:00, con cita".
  hours: { timezone: "America/Merida", days: [1, 2, 3, 4, 5, 6], startMin: 9 * 60, endMin: 20 * 60, slotMinutes: 30 },
  tagline:
    "Manicura rusa, pestañas hechas a mano y cejas con diseño. Un estudio privado donde cada cita es solo tuya.",
  bio: "Empecé haciendo uñas a mis amigas en la prepa. Nueve años después sigo con la misma obsesión: que salgas sintiéndote tú, pero mejor. Trabajo sola, con cita, y solo con productos que yo misma uso.",
  services: [
    {
      name: "Extensiones de volumen ruso 4D con mapeo personalizado",
      description:
        "Abanicos hechos a mano de cuatro pestañas finas, con un mapeo pensado para la forma de tus ojos. Duran de 3 a 4 semanas con retoque.",
      category: "Pestañas",
      pricingType: "per_contact",
      amountMxn: 1250,
      durationMin: 150,
      booking: "instant",
      photo: "lasheye",
      cancellationHours: 24,
      variants: [
        { label: "Natural", priceMxn: 1250 },
        { label: "Volumen", priceMxn: 1400 },
        { label: "Mega volumen", priceMxn: 1550 },
      ],
      extras: [
        { label: "Retiro de extensiones previas", priceMxn: 200 },
        { label: "Tinte de cejas", priceMxn: 150 },
      ],
    },
    {
      name: "Pestañas clásicas",
      description: "Una extensión por cada pestaña natural. Discretas, para todos los días.",
      category: "Pestañas",
      pricingType: "per_contact",
      amountMxn: 900,
      durationMin: 120,
      booking: "instant",
      photo: "lashapply",
      cancellationHours: 24,
      extras: [{ label: "Retiro de extensiones previas", priceMxn: 200 }],
    },
    {
      name: "Lifting y tinte de pestañas",
      description: "Curva desde la raíz sobre tu propia pestaña, con tinte negro. Dura de 6 a 8 semanas.",
      category: "Pestañas",
      pricingType: "per_contact",
      amountMxn: 550,
      durationMin: 60,
      booking: "instant",
      photo: "lashlift",
      cancellationHours: 24,
    },
    {
      name: "Manicura rusa con gel",
      description: "Cutícula trabajada en seco con torno, nivelación con rubber base y gel del color que elijas.",
      category: "Uñas",
      pricingType: "per_contact",
      amountMxn: 650,
      durationMin: 90,
      booking: "instant",
      photo: "russian",
      cancellationHours: 24,
      variants: [
        { label: "Color liso", priceMxn: 650 },
        { label: "Francés fino", priceMxn: 750 },
        { label: "Cromo", priceMxn: 770 },
      ],
      extras: [{ label: "Refuerzo con rubber base", priceMxn: 120 }],
    },
    {
      name: "Gel semipermanente en manos",
      description: "Limado, cutícula básica y gel semipermanente. Dura de 2 a 3 semanas.",
      category: "Uñas",
      pricingType: "per_contact",
      amountMxn: 480,
      durationMin: 60,
      booking: "instant",
      photo: "gel",
      cancellationHours: 24,
    },
    {
      name: "Acrílico esculpido, juego nuevo",
      description: "Uñas esculpidas en acrílico sobre molde, con la forma y el largo que quieras.",
      category: "Uñas",
      pricingType: "per_contact",
      amountMxn: 950,
      durationMin: 120,
      booking: "instant",
      photo: "acrylic",
      cancellationHours: 24,
    },
    {
      name: "Nail art a mano alzada",
      description:
        "Diseños pintados a mano. Mándame tu idea o una foto de referencia y te confirmo tiempo y precio.",
      category: "Uñas",
      pricingType: "per_contact",
      amountMxn: 120,
      // The proposal lists no length ("Desde $120 por uña"); 10 min per nail.
      durationMin: 10,
      priceUnit: { es: "uña", en: "nail" },
      booking: "request",
      photo: "nailart",
    },
    {
      name: "Laminado de cejas con diseño",
      description: "Cejas peinadas y fijadas hacia arriba, con diseño y depilación con hilo.",
      category: "Cejas",
      pricingType: "per_contact",
      amountMxn: 500,
      durationMin: 50,
      booking: "instant",
      photo: "lashclose",
      cancellationHours: 24,
    },
    {
      name: "Novia: uñas y pestañas a domicilio",
      description:
        "Para el día de tu boda, en tu hotel o casa. Incluye prueba previa. Cotizo según fecha, lugar y personas.",
      category: "Novias",
      pricingType: "custom",
      amountMxn: null,
      durationMin: 240,
      booking: "quote",
      photo: "bridal",
    },
  ],
  photos: {
    // Hero (card = headshot), then the Recent work strip in the proposal's
    // order with its captions and "Quiero esto" service links, then the rest.
    headshot: "hero",
    work: [
      { key: "russian", caption: "Manicura rusa · francés fino", service: 3 },
      { key: "lasheye", caption: "Volumen ruso · natural", service: 0 },
      { key: "glitter", caption: "Gel · glitter lavanda", service: 4 },
      { key: "acrylic", caption: "Acrílico · almendra", service: 5 },
      { key: "lashwork", caption: "Clásicas · primera cita", service: 1 },
      { key: "nailart", caption: "Nail art · corazones", service: 6 },
    ],
    more: ["lashclose", "portrait", "lashapply", "lashlift", "gel", "bridal"],
    alt: {
      hero: "Manos con manicura en tonos suaves",
      lashclose: "Detalle de pestañas",
      portrait: "Retrato de Alba",
    },
  },
  faq: [
    {
      q: "¿Puedo hacerme pestañas y uñas el mismo día?",
      a: "Sí. Elige los dos servicios y te doy una sola cita: primero pestañas, luego manicura, con 10 minutos entre uno y otro.",
    },
    { q: "¿Cuánto duran las extensiones?", a: "De 3 a 4 semanas. Te recomiendo retoque a las 2 o 3 semanas." },
    {
      q: "¿Qué pasa si llego tarde?",
      a: "Te espero 15 minutos. Después tal vez haya que ajustar el servicio para no retrasar a la siguiente clienta.",
    },
    {
      q: "¿Cómo pago?",
      a: "El anticipo de pestañas se paga en línea con tarjeta. El resto, en el estudio con tarjeta, efectivo o transferencia.",
    },
  ],
  // Newest first on the site, so the proposal's first review is written last.
  reviews: [
    { name: "Daniela R.", body: "Mis pestañas duraron casi cuatro semanas. Alba te explica todo y no se siente prisa." },
    { name: "Mariana C.", body: "La manicura rusa más limpia que me han hecho. Tres semanas y sigue perfecta." },
    { name: "Fernanda T.", body: "Me hizo uñas y pestañas para mi boda en el hotel. Llegó puntual y con todo listo." },
  ],
  // The artifact's page copy, set in the builder the way a talent edits it.
  profile: { lastName: "Castillo", phone: "+52 999 000 0000", gender: "female", dateOfBirth: "1995-04-12" },
  // Footer fine print shows "Instagram · WhatsApp" when both are published.
  socialLinks: [{ platform: "instagram", href: "https://www.instagram.com/alba.unas.demo/" }],
  siteCopy: {
    heroHeading: "Manos que {i}hablan{/i} por ti.",
    heroEyebrow: "Nail Artist · Mérida",
    heroLede: "Manicura rusa, pestañas hechas a mano y cejas con diseño. Un estudio privado donde cada cita es solo tuya.",
    heroProof: "{b}9 años{/b} de oficio · Estudio privado",
    ticker: ["Pestañas", "Uñas", "Cejas", "Novias", "Manicura rusa", "Volumen ruso"],
    heroInset: "lashclose",
    aboutPhoto: "portrait",
    menuSubtitle: "Precios en MXN. Puedes juntar pestañas y uñas en una sola cita.",
    visitExtraFacts: [
      { label: "Dónde", value: "García Ginerés, Mérida", note: "La dirección exacta llega al confirmar." },
      { label: "Anticipo", value: "Solo en pestañas", note: "$300 para apartar. El resto en el estudio." },
    ],
    footerLine: "García Ginerés, Mérida · Lunes a sábado con cita",
    brandTagline: "Nail Artist",
  },
};
