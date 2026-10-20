/**
 * service-hub-channels.ts — the pure model behind "Where it's sold", the one
 * calendar and "earnings by channel" (TUL-1371). For ANY talent in ANY trade who
 * sells through their own site, the Tulala hub, or one or more workspaces.
 * No I/O: the listing link (TUL-1367) and terms card (TUL-1368) feed it.
 *
 * Money rules (TUL-1365, approved): Tulala's fee is on top of the client's
 * price, never taken from the talent, so "you get" is the price minus the
 * workspace's own cut only. Anything that cannot be computed returns null,
 * never a guessed number.
 */

export type Channel =
  | { kind: "my_site" }
  | { kind: "hub" }
  | { kind: "workspace"; tenantId: string; name: string };

export function channelKey(c: Channel): string {
  return c.kind === "workspace" ? `ws:${c.tenantId}` : c.kind;
}

export type ChannelTerms =
  | { model: "percent"; percentBps: number }
  | { model: "fixed"; fixedCents: number }
  | { model: "none" }
  /** Per-hour, rent and other shapes with no single sale price: "you get" is unknown, never guessed. */
  | { model: "custom" };

const isCents = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/** What the talent receives from a sale at `priceCents` under `terms`, or null when invalid. */
export function youGetCents(priceCents: number, terms: ChannelTerms): number | null {
  if (!isCents(priceCents)) return null;
  switch (terms.model) {
    case "none":
      return priceCents;
    case "percent": {
      if (!Number.isInteger(terms.percentBps) || terms.percentBps < 0 || terms.percentBps > 10000) return null;
      return priceCents - Math.round((priceCents * terms.percentBps) / 10000);
    }
    case "fixed": {
      if (!isCents(terms.fixedCents)) return null;
      return Math.max(0, priceCents - terms.fixedCents);
    }
    case "custom":
      return null;
    default:
      return null;
  }
}

/* ─── Where it's sold ──────────────────────────────────────────────────── */

export type SoldListing = {
  channel: Channel;
  /** The price this channel lists the service at. */
  listPriceCents: number;
  terms: ChannelTerms;
  /** The talent's optional "lowest price I accept" for this workspace. */
  minAcceptCents: number | null;
  /** A listing the workspace offered and the talent has not accepted yet. Absent = accepted. */
  status?: "offered" | "accepted";
  /** The listing row (workspaces only), so the lowest price can be edited. */
  listingId?: string;
};

export type WhereSoldRow = SoldListing & { youGetCents: number | null; belowMinimum: boolean };

function channelOrder(c: Channel): number {
  return c.kind === "my_site" ? 0 : c.kind === "hub" ? 1 : 2;
}

export function belowMinimum(l: SoldListing): boolean {
  return l.channel.kind === "workspace" && l.minAcceptCents != null && l.listPriceCents < l.minAcceptCents;
}

/** My site, the hub, then each workspace by name, each with "you get". */
export function whereItsSold(listings: readonly SoldListing[]): WhereSoldRow[] {
  return [...listings]
    .sort((a, b) => {
      const o = channelOrder(a.channel) - channelOrder(b.channel);
      if (o !== 0) return o;
      return a.channel.kind === "workspace" && b.channel.kind === "workspace" ? a.channel.name.localeCompare(b.channel.name) : 0;
    })
    .map((l) => ({ ...l, youGetCents: youGetCents(l.listPriceCents, l.terms), belowMinimum: belowMinimum(l) }));
}

/** After a price raise: the workspace listings that now sit below the talent's minimum, to alert. */
export function listingsBelowMinimum(listings: readonly SoldListing[]): SoldListing[] {
  return listings.filter(belowMinimum);
}

/* ─── Earnings by channel ──────────────────────────────────────────────── */

export type EarningsRowLike = {
  source: "agency_routed" | "personal_page" | "hub" | "unknown";
  grossCents: number;
  netCents: number;
  tenantId?: string | undefined;
  agencyName: string;
};

export type ChannelEarnings = {
  key: string;
  kind: "my_site" | "hub" | "workspace" | "other";
  name: string | null;
  grossCents: number;
  netCents: number;
  count: number;
  /** The share of gross the talent keeps, in basis points. Null when gross is 0. */
  youKeepBps: number | null;
};

export function earningsByChannel(rows: readonly EarningsRowLike[]): ChannelEarnings[] {
  const acc = new Map<string, ChannelEarnings>();
  for (const r of rows) {
    let key: string;
    let kind: ChannelEarnings["kind"];
    let name: string | null = null;
    if (r.source === "personal_page") {
      key = "my_site";
      kind = "my_site";
    } else if (r.source === "hub") {
      key = "hub";
      kind = "hub";
    } else if (r.source === "agency_routed" && r.tenantId) {
      key = `ws:${r.tenantId}`;
      kind = "workspace";
      name = r.agencyName || null;
    } else {
      key = "other";
      kind = "other";
    }
    const cur = acc.get(key) ?? { key, kind, name, grossCents: 0, netCents: 0, count: 0, youKeepBps: null };
    cur.grossCents += r.grossCents;
    cur.netCents += r.netCents;
    cur.count += 1;
    if (!cur.name && name) cur.name = name;
    acc.set(key, cur);
  }
  const rank = { my_site: 0, hub: 1, workspace: 2, other: 3 } as const;
  return [...acc.values()]
    .map((c) => ({ ...c, youKeepBps: c.grossCents > 0 ? Math.round((c.netCents * 10000) / c.grossCents) : null }))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || (a.name ?? "").localeCompare(b.name ?? ""));
}

/* ─── One calendar ─────────────────────────────────────────────────────── */

export type ChannelHold = {
  id: string;
  channel: Channel;
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "requested" | "declined" | "cancelled" | "released";
};

export type HoldSummary = {
  /** Block the time on every channel. */
  blocking: ChannelHold[];
  /** Workspace requests waiting for the talent's approval. They block nothing until approved. */
  needsApproval: ChannelHold[];
  /** A request overlapping a blocking hold: shown so the talent decides knowingly. */
  conflicts: Array<{ a: string; b: string }>;
};

function validWindow(h: ChannelHold): boolean {
  const s = Date.parse(h.startsAt);
  const e = Date.parse(h.endsAt);
  return Number.isFinite(s) && Number.isFinite(e) && e > s;
}

export function summariseHolds(holds: readonly ChannelHold[]): HoldSummary {
  const blocking: ChannelHold[] = [];
  const needsApproval: ChannelHold[] = [];
  for (const h of holds) {
    if (!validWindow(h)) continue;
    if (h.status === "declined" || h.status === "cancelled" || h.status === "released") continue;
    // The talent's own site and the hub hold at once; a workspace asks first.
    if (h.status === "requested" && h.channel.kind === "workspace") needsApproval.push(h);
    else blocking.push(h);
  }
  const conflicts: HoldSummary["conflicts"] = [];
  for (const r of needsApproval) {
    for (const b of blocking) {
      if (Date.parse(b.startsAt) < Date.parse(r.endsAt) && Date.parse(b.endsAt) > Date.parse(r.startsAt)) {
        conflicts.push({ a: b.id, b: r.id });
      }
    }
  }
  return { blocking, needsApproval, conflicts };
}

/* ─── Where you appear ─────────────────────────────────────────────────── */

/** Leaving a workspace never cancels work already booked: open jobs stay. */
export function planLeaveWorkspace(input: {
  tenantId: string;
  openJobs: ReadonlyArray<{ id: string; status: string }>;
}): { allowed: boolean; keepOpenJobIds: string[] } {
  if (!input.tenantId) return { allowed: false, keepOpenJobIds: [] };
  const closed = new Set(["completed", "cancelled", "declined", "released"]);
  return { allowed: true, keepOpenJobIds: input.openJobs.filter((j) => !closed.has(j.status)).map((j) => j.id) };
}

/* ─── Copy ─────────────────────────────────────────────────────────────── */

export type ChannelCopy = {
  whereSold: string;
  whereAppear: string;
  mySite: string;
  hub: string;
  youGet: string;
  lowestPrice: string;
  belowMinimum: string;
  needsApproval: string;
  leave: string;
  leaveKeepsJobs: string;
  earningsByChannel: string;
  youKeep: string;
  other: string;
  save: string;
  saved: string;
  saveFailed: string;
  notReady: string;
  offered: string;
  pending: string;
  feeNote: string;
  calendarByChannel: string;
  mySiteHub: string;
  hold: string;
  booking: string;
  firm: string;
  soft: string;
  noUpcoming: string;
  calendarFailed: string;
};

export const CHANNEL_COPY: Record<"en" | "es", ChannelCopy> = {
  en: {
    whereSold: "Where it's sold",
    whereAppear: "Where you appear",
    mySite: "My site",
    hub: "Tulala hub",
    youGet: "You get",
    lowestPrice: "Lowest price I accept",
    belowMinimum: "Listed below your lowest price",
    needsApproval: "Needs your approval",
    leave: "Leave",
    leaveKeepsJobs: "Jobs already booked stay.",
    earningsByChannel: "Earnings by channel",
    youKeep: "You keep",
    other: "Other",
    save: "Save",
    saved: "Saved.",
    saveFailed: "Could not save. Try again in a moment.",
    notReady: "This is not available yet.",
    offered: "Waiting for your answer",
    pending: "Waiting for your answer",
    feeNote: "Tulala's fee is added on top for the client.",
    calendarByChannel: "Calendar by channel",
    mySiteHub: "My site / hub",
    hold: "Hold",
    booking: "Booking",
    firm: "firm",
    soft: "soft",
    noUpcoming: "Nothing coming up.",
    calendarFailed: "Could not load your calendar. Try again in a moment.",
  },
  es: {
    whereSold: "Dónde se vende",
    whereAppear: "Dónde apareces",
    mySite: "Mi sitio",
    hub: "Hub de Tulala",
    youGet: "Recibes",
    lowestPrice: "Precio mínimo que acepto",
    belowMinimum: "Publicado por debajo de tu precio mínimo",
    needsApproval: "Necesita tu aprobación",
    leave: "Salir",
    leaveKeepsJobs: "Los trabajos ya reservados se mantienen.",
    earningsByChannel: "Ganancias por canal",
    youKeep: "Te quedas con",
    other: "Otros",
    save: "Guardar",
    saved: "Guardado.",
    saveFailed: "No se pudo guardar. Inténtalo de nuevo en un momento.",
    notReady: "Esto aún no está disponible.",
    offered: "Esperando tu respuesta",
    pending: "Esperando tu respuesta",
    feeNote: "La comisión de Tulala se suma encima para el cliente.",
    calendarByChannel: "Calendario por canal",
    mySiteHub: "Mi sitio / hub",
    hold: "Bloqueo",
    booking: "Reserva",
    firm: "firme",
    soft: "provisional",
    noUpcoming: "Nada próximo.",
    calendarFailed: "No se pudo cargar tu calendario. Inténtalo de nuevo en un momento.",
  },
};

export function channelCopy(locale: string): ChannelCopy {
  return locale.toLowerCase().startsWith("es") ? CHANNEL_COPY.es : CHANNEL_COPY.en;
}
