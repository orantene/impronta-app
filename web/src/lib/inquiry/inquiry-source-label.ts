/**
 * Inquiry source label — one pure resolver for "where did this inquiry come
 * from", shared by the agency-admin thread, the client inbox, and the talent
 * inbox.
 *
 * Background (#4 "source label"): every inquiry captures provenance on
 * `public.inquiries` — `source_channel` (the `inquiry_source_channel` enum),
 * `origin_domain` (the exact host the form was submitted on), plus
 * `source_type` / `source_page`. Historically only the two Discover channels
 * surfaced a "via Discover" chip, and the captured `origin_domain` was never
 * shown to anyone. This helper maps the raw fields to a friendly, role-aware
 * label so all three audiences see a quiet provenance cue.
 *
 * It returns a stable i18n KEY plus interpolation args (never a hardcoded
 * English string) so callers resolve it through their own translator. The
 * caller decides tone/placement; this module owns the taxonomy only.
 *
 * House rules honoured here: no em dashes in any user-facing string (those
 * live in the catalogs anyway), no "buyer"/"cart" language, and the agency
 * accent is applied by the caller, never by this resolver.
 */
import { TULALA_APEX_HOST } from "@/lib/brand/tulala";

/** Who is looking at the label — the wording shifts slightly per audience. */
export type InquirySourceRole = "agency" | "client" | "talent";

/** Raw source fields as captured on an inquiry row (any subset may be null). */
export interface InquirySourceInput {
  /** `inquiries.source_channel` (the `inquiry_source_channel` enum) or null. */
  sourceChannel: string | null | undefined;
  /** `inquiries.origin_domain` — the exact host the form was submitted on. */
  originDomain?: string | null;
  /** Display name of the agency that owns this inquiry (for "via {agency}"). */
  agencyName?: string | null;
  /**
   * The agency's own primary host (custom domain or tenant subdomain), used to
   * decide whether `origin_domain` means "from your own site". Optional — when
   * absent we fall back to the channel value alone.
   */
  agencyHost?: string | null;
}

/** A resolved label: an i18n key plus the args to interpolate into it. */
export interface InquirySourceLabel {
  /** Dot-path i18n key under `dashboard.inquirySource.*`. */
  key: string;
  /** Interpolation args (e.g. `{ agency }`). Empty when the key has no slots. */
  args: Record<string, string>;
}

const KEY_ROOT = "dashboard.inquirySource";

/** Normalise a host for comparison: lowercase, strip a leading `www.`. */
function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  return host.trim().toLowerCase().replace(/^www\./, "");
}

/** True when `host` is the Tulala platform apex (the shared network host). */
function isTulalaHost(host: string): boolean {
  const h = normalizeHost(host);
  if (!h) return false;
  return (
    h === normalizeHost(TULALA_APEX_HOST) ||
    h.endsWith(`.${normalizeHost(TULALA_APEX_HOST)}`)
  );
}

/**
 * Resolve an inquiry's source fields to a friendly, role-aware label key.
 *
 * Returns `null` when the source carries no useful provenance to show (e.g. a
 * staff-created row to the client, or an unknown/empty channel) so callers can
 * simply omit the chip rather than render a meaningless one.
 */
export function inquirySourceLabel(
  input: InquirySourceInput,
  role: InquirySourceRole,
): InquirySourceLabel | null {
  const channel = (input.sourceChannel ?? "").toLowerCase().trim();
  const origin = normalizeHost(input.originDomain);
  const agencyHost = normalizeHost(input.agencyHost);
  const agency = (input.agencyName ?? "").trim();

  // ── Discover / shortlist / saved-talent — the cross-tenant catalog ──────
  // Same friendly label for every role: "via Discover".
  if (
    channel === "discover_single_talent" ||
    channel === "discover_shortlist" ||
    channel === "saved_talent"
  ) {
    return { key: `${KEY_ROOT}.discover`, args: {} };
  }

  // ── Tulala network (the shared hub) — by channel OR by origin host ──────
  if (channel === "hub_site" || (origin && isTulalaHost(origin))) {
    return { key: `${KEY_ROOT}.network`, args: {} };
  }

  // ── Instant booking ─────────────────────────────────────────────────────
  if (channel === "instant_book") {
    return { key: `${KEY_ROOT}.instantBook`, args: {} };
  }

  // ── From a curated pitch ────────────────────────────────────────────────
  if (channel === "pitch") {
    return { key: `${KEY_ROOT}.pitch`, args: {} };
  }

  // ── Repeat booking ──────────────────────────────────────────────────────
  if (channel === "book_again") {
    return { key: `${KEY_ROOT}.bookAgain`, args: {} };
  }

  // ── Agency storefront / public talent profile / public directory ────────
  // The same origin, phrased per audience: the agency sees "from your site",
  // everyone else sees "via {agency}" (falling back to a neutral phrasing
  // when the agency name is unknown).
  const isOwnStorefront =
    channel === "agency_site" ||
    channel === "public_talent_profile" ||
    channel === "directory_guest" ||
    channel === "directory_client" ||
    // origin host matches the agency's own host (and is not the shared hub)
    (!!origin && !!agencyHost && origin === agencyHost);

  if (isOwnStorefront) {
    if (role === "agency") {
      return { key: `${KEY_ROOT}.yourSite`, args: {} };
    }
    if (agency) {
      return { key: `${KEY_ROOT}.viaAgency`, args: { agency } };
    }
    return { key: `${KEY_ROOT}.viaAgencyGeneric`, args: {} };
  }

  // ── Client dashboard (an existing client account reaching out) ──────────
  if (channel === "direct_client_dashboard") {
    if (role === "agency") return { key: `${KEY_ROOT}.clientAccount`, args: {} };
    if (role === "talent" && agency) {
      return { key: `${KEY_ROOT}.viaAgency`, args: { agency } };
    }
    // To the client themselves this is just "their own message" — nothing to show.
    return null;
  }

  // ── Manual / off-platform channels logged by staff ──────────────────────
  if (
    channel === "phone" ||
    channel === "whatsapp" ||
    channel === "email" ||
    channel === "admin" ||
    channel === "admin_created"
  ) {
    // The agency knows it logged this; the client should not see "by phone".
    if (role === "agency") return { key: `${KEY_ROOT}.addedByTeam`, args: {} };
    if (role === "talent" && agency) {
      return { key: `${KEY_ROOT}.viaAgency`, args: { agency } };
    }
    return null;
  }

  // ── Unknown / "other" — nothing meaningful to surface. ──────────────────
  return null;
}
