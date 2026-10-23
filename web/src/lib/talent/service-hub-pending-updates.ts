/**
 * TUL-1929 · "Pending update" cards. When a workspace changes the terms of a talent's hub
 * listing, the database guard sets it back to 'offered' and clears her consent, so it stops
 * selling until she answers. This turns those listing rows into the card model the
 * "Where you appear" page shows (what the listing says now, and the two answers).
 * No I/O. A malformed row is dropped, never guessed.
 */

type Raw = Record<string, unknown>;

const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number.parseInt(v, 10) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export type PendingListingUpdate = {
  listingId: string;
  workspaceName: string;
  serviceTitle: string;
  currency: string;
  bookingType: "request" | "instant";
  /** What the client sees as the price, or null when it cannot be known (never guessed). */
  listPriceCents: number | null;
  priceMode: "talent_price" | "margin" | "fixed" | "from";
  showWho: "name" | "portfolio" | "hidden";
  clientContact: "workspace" | "talent";
  /** Her own "lowest price I accept" for this workspace; kept when she accepts again. */
  minAcceptCents: number | null;
};

const PRICE_MODES = ["talent_price", "margin", "fixed", "from"] as const;
const SHOW_WHO = ["name", "portfolio", "hidden"] as const;

/** The talent's OFFERED listings (status 'offered'), newest information first by workspace name. */
export function pendingListingUpdates(input: {
  listings: readonly Raw[];
  offerings: ReadonlyMap<string, { title: string; priceCents: number | null; currency: string }>;
  tenantNames: ReadonlyMap<string, string>;
}): PendingListingUpdate[] {
  const out: PendingListingUpdate[] = [];
  for (const raw of input.listings) {
    if (raw.status !== "offered") continue;
    const listingId = str(raw.id);
    const tenantId = str(raw.tenant_id);
    const offering = input.offerings.get(String(raw.offering_id));
    const mode = PRICE_MODES.find((m) => m === raw.price_mode);
    const showWho = SHOW_WHO.find((m) => m === raw.show_who);
    if (!listingId || !tenantId || !mode || !showWho) continue;
    const base = offering?.priceCents ?? null;
    let listPriceCents: number | null = null;
    if (mode === "talent_price") listPriceCents = base;
    else if (mode === "margin") {
      const bps = int(raw.margin_bps);
      listPriceCents = base == null || bps == null ? null : base + Math.round((base * bps) / 10000);
    } else listPriceCents = int(raw.price_cents);
    out.push({
      listingId,
      workspaceName: input.tenantNames.get(tenantId) ?? tenantId,
      serviceTitle: offering?.title ?? "",
      currency: str(raw.currency) ?? offering?.currency ?? "",
      bookingType: raw.booking_type === "instant" ? "instant" : "request",
      listPriceCents,
      priceMode: mode,
      showWho,
      clientContact: raw.client_contact === "talent" ? "talent" : "workspace",
      minAcceptCents: int(raw.talent_lowest_cents),
    });
  }
  return out.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName) || a.serviceTitle.localeCompare(b.serviceTitle));
}

export type PendingUpdateCopy = {
  title: string;
  intro: string;
  booking: string;
  bookingRequest: string;
  bookingInstant: string;
  price: string;
  priceOnRequest: string;
  from: string;
  who: string;
  whoName: string;
  whoPortfolio: string;
  whoHidden: string;
  contact: string;
  contactWorkspace: string;
  contactTalent: string;
  accept: string;
  decline: string;
  accepted: string;
  declined: string;
  failed: string;
};

const COPY: Record<"en" | "es", PendingUpdateCopy> = {
  en: {
    title: "Pending update",
    intro: "{workspace} changed how {service} is sold. It is paused until you answer.",
    booking: "Booking",
    bookingRequest: "Clients send a request",
    bookingInstant: "Clients book instantly",
    price: "Price shown",
    priceOnRequest: "On request",
    from: "from",
    who: "Who is shown",
    whoName: "Your name",
    whoPortfolio: "Your portfolio only",
    whoHidden: "Nobody (hidden)",
    contact: "Client contact",
    contactWorkspace: "Through the workspace",
    contactTalent: "Directly with you",
    accept: "Accept",
    decline: "Decline",
    accepted: "Accepted. It is on sale again.",
    declined: "Declined. It stays off sale.",
    failed: "Could not save your answer. Try again in a moment.",
  },
  es: {
    title: "Actualización pendiente",
    intro: "{workspace} cambió cómo se vende {service}. Está en pausa hasta que respondas.",
    booking: "Reserva",
    bookingRequest: "Los clientes envían una solicitud",
    bookingInstant: "Los clientes reservan al instante",
    price: "Precio que se muestra",
    priceOnRequest: "A consultar",
    from: "desde",
    who: "Quién se muestra",
    whoName: "Tu nombre",
    whoPortfolio: "Solo tu portafolio",
    whoHidden: "Nadie (oculto)",
    contact: "Contacto con el cliente",
    contactWorkspace: "A través del espacio de trabajo",
    contactTalent: "Directo contigo",
    accept: "Aceptar",
    decline: "Rechazar",
    accepted: "Aceptado. Vuelve a estar a la venta.",
    declined: "Rechazado. Sigue fuera de venta.",
    failed: "No se pudo guardar tu respuesta. Inténtalo de nuevo en un momento.",
  },
};

export function pendingUpdateCopy(locale: string): PendingUpdateCopy {
  return locale.toLowerCase().startsWith("es") ? COPY.es : COPY.en;
}

export type PendingUpdateLine = { key: "booking" | "price" | "who" | "contact"; label: string; value: string };

/** The four terms the workspace can change, as label / value lines. */
export function pendingUpdateLines(
  u: PendingListingUpdate,
  locale: string,
  formatMoney: (cents: number, currency: string) => string,
): PendingUpdateLine[] {
  const c = pendingUpdateCopy(locale);
  const price =
    u.listPriceCents == null
      ? c.priceOnRequest
      : `${u.priceMode === "from" ? `${c.from} ` : ""}${formatMoney(u.listPriceCents, u.currency)}`;
  return [
    { key: "booking", label: c.booking, value: u.bookingType === "instant" ? c.bookingInstant : c.bookingRequest },
    { key: "price", label: c.price, value: price },
    { key: "who", label: c.who, value: u.showWho === "name" ? c.whoName : u.showWho === "portfolio" ? c.whoPortfolio : c.whoHidden },
    { key: "contact", label: c.contact, value: u.clientContact === "talent" ? c.contactTalent : c.contactWorkspace },
  ];
}
