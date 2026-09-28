/**
 * Pure helpers for My presence › Where I appear and Discover networks.
 * No I/O, no React: the panels read their decisions from here so the rules
 * (which control a row offers, how a listing is summarised, what an
 * application's timeline says) are testable without a browser.
 */
import type { EffectiveVisibility } from "./representation";

export type PlacementKind = "tulala" | "hub" | "agency";

export type PlacementStatus =
  | "live"
  | "hidden_by_you"
  | "hidden_everywhere"
  | "pending"
  | "not_published"
  | "unavailable";

/**
 * One status per row. A roster the agency has not published is "not
 * published", never "live": there is no page to link to, and no views to
 * report. A removed or winding-down relationship is "unavailable".
 */
export function placementStatus(effective: EffectiveVisibility, hasPublicUrl: boolean): PlacementStatus {
  switch (effective) {
    case "global_hidden":
      return "hidden_everywhere";
    case "you_hid":
      return "hidden_by_you";
    case "pending":
      return "pending";
    case "agency_hidden":
      return "not_published";
    case "winding_down":
    case "removed":
      return "unavailable";
    case "live":
      return hasPublicUrl ? "live" : "not_published";
    default:
      return "unavailable";
  }
}

export type PlacementControl = "hide" | "show_again" | "request_change" | "none";

/**
 * What the row lets the talent do about its visibility.
 *  - A self-managed hub listing can be hidden outright and shown again.
 *  - An agency decides what it publishes: the talent can only ask.
 *  - The Tulala profile is hidden with the global switch in Settings, so the
 *    row itself offers nothing.
 */
export function placementControl(kind: PlacementKind, status: PlacementStatus): PlacementControl {
  if (kind === "tulala") return "none";
  if (kind === "agency") return status === "unavailable" ? "none" : "request_change";
  if (status === "live") return "hide";
  if (status === "hidden_by_you") return "show_again";
  return "none";
}

export type StatusTone = "ok" | "warn" | "idle" | "risk";

export function placementTone(status: PlacementStatus): StatusTone {
  if (status === "live") return "ok";
  if (status === "pending") return "warn";
  if (status === "hidden_everywhere") return "risk";
  return "idle";
}

export function placementLabel(status: PlacementStatus): string {
  switch (status) {
    case "live":
      return "Live";
    case "hidden_by_you":
      return "Hidden by you";
    case "hidden_everywhere":
      return "Hidden everywhere";
    case "pending":
      return "Pending";
    case "not_published":
      return "No public page";
    default:
      return "Connection unavailable";
  }
}

/** Live rows go under "Live listings"; everything else is an "other connection". */
export function splitPlacements<T extends { status: PlacementStatus }>(rows: T[]): { live: T[]; other: T[] } {
  return {
    live: rows.filter((r) => r.status === "live"),
    other: rows.filter((r) => r.status !== "live"),
  };
}

export function placementSummary(liveCount: number, otherCount: number, es = false): string {
  const live = es
    ? `${liveCount} ${liveCount === 1 ? "ficha activa" : "fichas activas"}`
    : `${liveCount} live ${liveCount === 1 ? "listing" : "listings"}`;
  if (otherCount === 0) return live;
  const other = es
    ? `${otherCount} ${otherCount === 1 ? "otra conexión" : "otras conexiones"}`
    : `${otherCount} other ${otherCount === 1 ? "connection" : "connections"}`;
  return `${live} · ${other}`;
}

/** Host and path, no scheme: what a person reads aloud or prints. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** WhatsApp opens with the message written. It sends nothing on its own. */
export function whatsappShareUrl(url: string, message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`.trim())}`;
}

export function instagramBioLine(url: string, es = false): string {
  return `${es ? "Reserva conmigo" : "Book with me"} → ${displayUrl(url)}`;
}

/** File name for a downloaded QR: one code per exact address. */
export function qrFileName(url: string, ext: "svg" | "png"): string {
  const slug = displayUrl(url)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `qr-${slug || "page"}.${ext}`;
}

// ── Discover networks ────────────────────────────────────────────────────

export type NetworkAccess = "open" | "apply" | "invite";
export type NetworkMembership = "none" | "joined" | "pending" | "hidden";

export type NetworkPrimaryAction = "join" | "apply" | "invite_only" | "none";

/** A network already joined never offers Join again. */
export function networkPrimaryAction(access: NetworkAccess, state: NetworkMembership): NetworkPrimaryAction {
  if (state !== "none") return "none";
  if (access === "open") return "join";
  if (access === "apply") return "apply";
  return "invite_only";
}

export type NetworkFilter = { query: string; access: "any" | NetworkAccess };

export function filterNetworks<T extends { name: string; city: string; summary: string; access: NetworkAccess }>(
  list: T[],
  filter: NetworkFilter,
): T[] {
  const q = filter.query.trim().toLowerCase();
  return list.filter((n) => {
    if (filter.access !== "any" && n.access !== filter.access) return false;
    if (!q) return true;
    return `${n.name} ${n.city} ${n.summary}`.toLowerCase().includes(q);
  });
}

export type TimelineStep = { label: string; done: boolean };

/**
 * An application's timeline from its stored status. Accepted and Live are
 * separate lines; who acts next is always named and no date is invented.
 */
export function applicationTimeline(status: string): { steps: TimelineStep[]; next: string | null } {
  const s = status.toLowerCase();
  const sent = { label: "You sent your application", done: true };
  if (s === "approved" || s === "accepted") {
    return {
      steps: [sent, { label: "Accepted", done: true }, { label: "Listing published", done: false }],
      next: "They publish your listing. No date given.",
    };
  }
  if (s === "rejected" || s === "declined") {
    return { steps: [sent, { label: "Not accepted", done: true }], next: null };
  }
  if (s === "withdrawn") {
    return { steps: [sent, { label: "You withdrew it", done: true }], next: null };
  }
  return {
    steps: [sent, { label: "They decide", done: false }],
    next: "They review it. No date given.",
  };
}
