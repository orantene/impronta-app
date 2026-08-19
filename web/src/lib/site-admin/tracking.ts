/**
 * tracking.ts — the analytics / advertising accounts a tenant can connect from
 * Website → Setup → Tracking, and the exact tags each one emits.
 *
 * This module is PURE. It does no I/O, imports nothing server-only, and holds
 * every decision the feature makes: what a valid ID looks like, what markup a
 * connected provider produces, and which tenant a stored configuration belongs
 * to. The DB read/write lives in `server/tracking-settings.ts`, the storefront
 * injector in `components/integrations/tenant-tracking.tsx`, and neither has a
 * branch of its own. Same split as the custom-code library (#1247), for the same
 * reason: the security rules are unit-tested without a database or a DOM.
 *
 * WHY VALIDATION IS THE SECURITY BOUNDARY, NOT ESCAPING
 * ─────────────────────────────────────────────────────
 * Three of the four providers need their ID interpolated into an inline
 * `<script>`, and a `<script>` is a raw-text element: escaping its contents
 * corrupts the JavaScript rather than protecting anything, and `</script` inside
 * it ends the element no matter what entities are used. So the ID is never
 * escaped. Instead every accepted ID is drawn from a closed character set that
 * contains no quote, no backslash, no angle bracket and no whitespace, checked
 * by an anchored regex at save time AND again at render time. An ID that could
 * break out is not stored, and if one were stored by some other route it is
 * dropped before it reaches markup. `renderTrackingTags` is the only road to the
 * DOM, and it re-validates unconditionally.
 *
 * A second, independent reason to validate hard: a mistyped ID is a tracker that
 * never fires while the admin screen says "connected". The tenant would find out
 * months later with no data. Rejecting a malformed ID with a plain sentence at
 * the moment of pasting is the whole point of the surface.
 *
 * CONTENT SECURITY POLICY
 * ───────────────────────
 * Each provider names the hosts it needs. `next.config.ts` must allow-list them
 * or the tag is blocked by the browser and, again, looks connected while doing
 * nothing. The current state of that pairing is recorded on each provider below
 * and asserted in `tracking.test.ts` against the real `next.config.ts` text, so
 * a provider can never be added here without the directive following it.
 */

/** The accounts an operator can connect. Stable ids; they are storage keys. */
export const TRACKING_PROVIDER_IDS = ["ga4", "gtm", "metaPixel", "plausible"] as const;

export type TrackingProviderId = (typeof TRACKING_PROVIDER_IDS)[number];

export function isTrackingProviderId(value: unknown): value is TrackingProviderId {
  return (
    typeof value === "string" &&
    (TRACKING_PROVIDER_IDS as readonly string[]).includes(value)
  );
}

/** Longest ID we will ever store. Guards the settings JSON against a paste of a
 *  whole page into the field; the per-provider regexes are far tighter. */
export const TRACKING_ID_MAX = 253;

export type TrackingProviderSpec = {
  id: TrackingProviderId;
  /**
   * The closed character set an accepted ID may use. Anchored, and containing
   * no quote / backslash / angle bracket / whitespace — see the header note on
   * why this, and not escaping, is what makes interpolation safe.
   */
  pattern: RegExp;
  /** `upper` for the Google prefixed ids, `lower` for a domain, `none` for digits. */
  normalize: "upper" | "lower" | "none";
  /** Hosts this provider's tags contact, for the CSP pairing assertion. */
  cspHosts: { script: readonly string[]; connect: readonly string[] };
};

export const TRACKING_PROVIDERS: Readonly<Record<TrackingProviderId, TrackingProviderSpec>> = {
  // Measurement ID from Admin → Data streams. Always `G-` + uppercase alnum.
  ga4: {
    id: "ga4",
    pattern: /^G-[A-Z0-9]{4,20}$/,
    normalize: "upper",
    cspHosts: {
      script: ["https://www.googletagmanager.com"],
      connect: ["https://www.google-analytics.com"],
    },
  },
  // Container ID from the GTM workspace header. Always `GTM-` + uppercase alnum.
  gtm: {
    id: "gtm",
    pattern: /^GTM-[A-Z0-9]{4,20}$/,
    normalize: "upper",
    cspHosts: {
      script: ["https://www.googletagmanager.com"],
      connect: ["https://www.googletagmanager.com"],
    },
  },
  // Meta (Facebook) pixel ID from Events Manager. A bare decimal number.
  metaPixel: {
    id: "metaPixel",
    pattern: /^[0-9]{8,20}$/,
    normalize: "none",
    cspHosts: {
      script: ["https://connect.facebook.net"],
      connect: ["https://www.facebook.com"],
    },
  },
  // Plausible identifies a site by its DOMAIN, not by a key. Hosted plausible.io
  // only: a self-hosted instance would need its own host in the CSP, which is a
  // per-tenant policy change and is deliberately not offered.
  plausible: {
    id: "plausible",
    pattern: /^(?=.{4,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/,
    normalize: "lower",
    cspHosts: {
      script: ["https://plausible.io"],
      connect: ["https://plausible.io"],
    },
  },
};

/** Every host any provider needs, for the CSP pairing test. */
export function trackingCspHosts(): { script: string[]; connect: string[] } {
  const script = new Set<string>();
  const connect = new Set<string>();
  for (const id of TRACKING_PROVIDER_IDS) {
    for (const h of TRACKING_PROVIDERS[id].cspHosts.script) script.add(h);
    for (const h of TRACKING_PROVIDERS[id].cspHosts.connect) connect.add(h);
  }
  return { script: [...script], connect: [...connect] };
}

/** What is stored, per tenant, under `agencies.settings.tracking`. */
export type TenantTrackingConfig = Partial<Record<TrackingProviderId, string>>;

/** A config plus the tenant that owns it. The owner travels WITH the data so
 *  the render-time tenant check has something to compare against, rather than
 *  trusting that the caller passed the right row. */
export type OwnedTrackingConfig = {
  tenantId: string;
  providers: TenantTrackingConfig;
};

export const EMPTY_TRACKING_CONFIG: TenantTrackingConfig = Object.freeze({});

// ── validation ───────────────────────────────────────────────────────────────

export type TrackingIdResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Plain-language rejection copy. The reader is an agency owner who has just
 * pasted something out of another product's settings screen, so each message
 * says what the right thing LOOKS like rather than naming a regex.
 */
const REJECTION: Record<TrackingProviderId, string> = {
  ga4: "That does not look like a Google Analytics measurement ID. It starts with G- followed by letters and numbers, for example G-1A2B3C4D5E. You can find it in Google Analytics under Admin, then Data streams.",
  gtm: "That does not look like a Google Tag Manager container ID. It starts with GTM- followed by letters and numbers, for example GTM-A1B2C3D. You can find it at the top of your Tag Manager workspace.",
  metaPixel:
    "That does not look like a Meta pixel ID. It is a number only, usually 15 or 16 digits, with no letters, spaces or dashes. You can find it in Meta Events Manager next to your pixel name.",
  plausible:
    "That does not look like a website address. Enter the domain you set up in Plausible on its own, for example yoursite.com, with no https:// in front and nothing after the domain.",
};

/**
 * Clean and check one pasted ID.
 *
 * An empty string is a legitimate value: it means "disconnect this provider",
 * and is returned as `null`. Everything else must match the provider's anchored
 * pattern after normalization, or it is refused with the sentence above.
 */
export function normalizeTrackingId(
  provider: TrackingProviderId,
  raw: unknown,
): TrackingIdResult {
  const spec = TRACKING_PROVIDERS[provider];
  if (!spec) return { ok: false, error: "Unknown tracking provider." };

  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: REJECTION[provider] };

  let value = raw.trim();
  if (value === "") return { ok: true, value: null };
  if (value.length > TRACKING_ID_MAX) return { ok: false, error: REJECTION[provider] };

  if (spec.normalize === "upper") value = value.toUpperCase();
  if (spec.normalize === "lower") {
    value = value.toLowerCase();
    // A pasted domain very often arrives as a full URL. Strip the parts a
    // domain field cannot use rather than refusing an operator who did the
    // reasonable thing; anything left over still has to pass the pattern.
    value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    value = value.replace(/^www\./, "");
    const cut = value.search(/[/?#]/);
    if (cut >= 0) value = value.slice(0, cut);
    value = value.replace(/\.$/, "");
  }

  if (!spec.pattern.test(value)) return { ok: false, error: REJECTION[provider] };
  return { ok: true, value };
}

// ── settings JSON parse / merge ──────────────────────────────────────────────

/**
 * Read `agencies.settings.tracking` defensively. Anything that is not a valid
 * ID for a known provider is dropped rather than carried: a row written by a
 * newer deploy, by hand, or by a bug must not become markup on a live site.
 */
export function parseTrackingConfig(settings: unknown): TenantTrackingConfig {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { ...EMPTY_TRACKING_CONFIG };
  }
  const raw = (settings as Record<string, unknown>).tracking;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_TRACKING_CONFIG };
  }
  const bag = raw as Record<string, unknown>;
  const out: TenantTrackingConfig = {};
  for (const id of TRACKING_PROVIDER_IDS) {
    const parsed = normalizeTrackingId(id, bag[id]);
    if (parsed.ok && parsed.value) out[id] = parsed.value;
  }
  return out;
}

/**
 * Merge one provider into an existing config. `null` clears it.
 * Returns a NEW object; the input is never mutated.
 */
export function withTrackingId(
  config: TenantTrackingConfig,
  provider: TrackingProviderId,
  value: string | null,
): TenantTrackingConfig {
  const next: TenantTrackingConfig = { ...config };
  if (value) next[provider] = value;
  else delete next[provider];
  return next;
}

/**
 * Fold a config back into the whole `agencies.settings` blob, preserving every
 * other key. Same read-modify-write shape as `pageRolesToSettings`, and for the
 * same reason: `settings` is a shared JSON column and a blind overwrite would
 * silently drop another surface's keys.
 */
export function trackingToSettings(
  settings: unknown,
  config: TenantTrackingConfig,
): Record<string, unknown> {
  const base =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? { ...(settings as Record<string, unknown>) }
      : {};
  if (Object.keys(config).length === 0) delete base.tracking;
  else base.tracking = { ...config };
  return base;
}

// ── render ───────────────────────────────────────────────────────────────────

/** One tag to place in the document head. Exactly one of `src` / `code` is set. */
export type TrackingTag = {
  /** Stable per provider + slot, used as the React key and a debug attribute. */
  key: string;
  provider: TrackingProviderId;
  src?: string;
  code?: string;
  /** How an external script loads. Every provider here is fire-and-forget
   *  telemetry, so no tag is ever emitted as a blocking synchronous script. */
  loading?: "async" | "defer";
  /** Extra data-* attributes. A value may carry a VALIDATED tenant ID; it is
   *  rendered as a React attribute, so React escapes it normally. */
  attrs?: Readonly<Record<string, string>>;
};

export type TrackingSelection = {
  tags: TrackingTag[];
  dropped: {
    /** Config belonged to a different tenant than the one being rendered. */
    otherTenant: number;
    /** Stored value failed re-validation at render time. */
    invalid: number;
  };
};

export const EMPTY_TRACKING_SELECTION: TrackingSelection = Object.freeze({
  tags: [],
  dropped: Object.freeze({ otherTenant: 0, invalid: 0 }),
}) as TrackingSelection;

/**
 * A JS string literal for an ID that has already passed its anchored pattern.
 * `JSON.stringify` is belt to the pattern's braces: the pattern is what makes
 * this safe, this is what makes it obvious.
 */
function jsLiteral(id: string): string {
  return JSON.stringify(id);
}

function tagsForProvider(provider: TrackingProviderId, id: string): TrackingTag[] {
  switch (provider) {
    case "ga4":
      return [
        {
          key: "ga4-lib",
          provider,
          src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`,
          loading: "async",
        },
        {
          key: "ga4-config",
          provider,
          code:
            `window.dataLayer=window.dataLayer||[];` +
            `function gtag(){dataLayer.push(arguments);}` +
            `gtag('js',new Date());` +
            `gtag('config',${jsLiteral(id)});`,
        },
      ];
    case "gtm":
      // The canonical container loader. The <noscript> iframe half of Google's
      // snippet is deliberately NOT emitted: it needs www.googletagmanager.com
      // in `frame-src`, and a visitor with JavaScript switched off cannot run
      // any of these providers anyway, so widening the frame policy for every
      // tenant would buy nothing.
      return [
        {
          key: "gtm-loader",
          provider,
          code:
            `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
            `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';` +
            `j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;` +
            `f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${jsLiteral(id)});`,
        },
      ];
    case "metaPixel":
      return [
        {
          key: "meta-pixel",
          provider,
          code:
            `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?` +
            `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;` +
            `n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;` +
            `t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}` +
            `(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
            `fbq('init',${jsLiteral(id)});fbq('track','PageView');`,
        },
      ];
    case "plausible":
      return [
        {
          key: "plausible",
          provider,
          src: "https://plausible.io/js/script.js",
          loading: "defer",
          attrs: { "data-domain": id },
        },
      ];
    default:
      return [];
  }
}

/**
 * THE ONLY ROAD TO THE DOM.
 *
 * Given whatever the read path loaded, decide what may be emitted while
 * rendering `tenantId`. Fails closed in every direction:
 *
 *   • no config, or a config owned by another tenant → nothing;
 *   • an empty / whitespace / unresolved `tenantId` → nothing, because a
 *     request whose tenant could not be resolved is not a tenant storefront;
 *   • a stored value that no longer passes its provider's pattern → nothing for
 *     that provider, counted as `invalid` so the drop is explainable.
 *
 * The tenant comparison is exact: no case folding, no trimming. A near-miss id
 * is a different tenant, and treating it as the same one is the failure mode
 * this whole function exists to prevent.
 */
export function selectTrackingForRender(
  config: OwnedTrackingConfig | null | undefined,
  opts: { tenantId: string },
): TrackingSelection {
  const requested = typeof opts.tenantId === "string" ? opts.tenantId : "";
  if (!config || typeof config !== "object") return EMPTY_TRACKING_SELECTION;

  const owner = typeof config.tenantId === "string" ? config.tenantId : "";
  const providerCount = Object.keys(config.providers ?? {}).length;
  if (!requested || !owner || owner !== requested) {
    return { tags: [], dropped: { otherTenant: providerCount, invalid: 0 } };
  }

  const tags: TrackingTag[] = [];
  let invalid = 0;
  for (const id of TRACKING_PROVIDER_IDS) {
    const stored = config.providers?.[id];
    if (typeof stored !== "string" || stored === "") continue;
    // Re-validate. Storage is not trust: this is the last gate before markup.
    if (!TRACKING_PROVIDERS[id].pattern.test(stored)) {
      invalid += 1;
      continue;
    }
    tags.push(...tagsForProvider(id, stored));
  }
  return { tags, dropped: { otherTenant: 0, invalid } };
}

export function trackingSelectionDroppedAnything(selection: TrackingSelection): boolean {
  return selection.dropped.otherTenant > 0 || selection.dropped.invalid > 0;
}

/** Which providers a config has connected, for the admin list. */
export function connectedProviders(config: TenantTrackingConfig): TrackingProviderId[] {
  return TRACKING_PROVIDER_IDS.filter((id) => typeof config[id] === "string" && config[id] !== "");
}
