/**
 * The catalog subtrees a browser bundle may read through `createTranslator` /
 * `getMessageStringArray` WITHOUT the full catalogs.
 *
 * Client code used to import `messages/{en,es,fr}.json` whole (2.7 MB), so every
 * public talent page shipped the entire dashboard copy before first paint. The
 * browser build now aliases `@/i18n/messages` to `messages.client.ts`, which
 * reads these subtrees from a payload the root layout inlines (about 100 KB per
 * locale). Dashboard code that goes through `useT` registers the full catalogs
 * itself (see `use-t.ts`), so only those routes pay for them.
 *
 * Adding a `t("ns.sub…")` call in a client component that uses
 * `createTranslator` directly: add `ns.sub` here. `client-subtrees.static.test.ts`
 * fails CI when a key's subtree is missing, which would otherwise render the raw
 * key in the browser and a hydration mismatch.
 */
export const CLIENT_MESSAGE_SUBTREES = [
  "admin.account",
  "admin.payouts",
  "admin.roster",
  "admin.talent",
  "dashboard.adminProfilePages",
  "dashboard.adminSupport",
  "dashboard.adminTabs",
  "dashboard.clientHub",
  "dashboard.clientNav",
  "dashboard.mediaField",
  "dashboard.mediaLibrary",
  "dashboard.mediaPickerLock",
  "public.auth",
  "public.bookPage",
  "public.clientAccount",
  "public.consent",
  "public.directory",
  "public.inquiryDrawer",
  "public.instantBook",
  "public.onboarding",
  "public.guestChat",
  "public.profileCta",
  "public.slotPicker",
  "public.thread",
] as const;

type Catalog = Record<string, unknown>;

const hasString = (v: unknown): boolean => typeof v === "string";
const hasStringArray = (v: unknown): boolean => Array.isArray(v) && v.some(hasString);

/**
 * TUL-1156: the part of `fallback` that `base` cannot answer. The browser translator walks
 * locale, default, en per key, and an `es` catalog that has every key never reaches the
 * fallbacks, so inlining the fallback catalogs whole only doubled the HTML. Strings and string
 * arrays count as answered when `base` has one at the same path. Returns `{}` when nothing is missing.
 */
export function missingFrom(base: Catalog, fallback: Catalog): Catalog {
  const out: Catalog = {};
  for (const [key, value] of Object.entries(fallback)) {
    const have = base[key];
    if (typeof value === "string") {
      if (!hasString(have)) out[key] = value;
    } else if (Array.isArray(value)) {
      if (!hasStringArray(have)) out[key] = value;
    } else if (value && typeof value === "object") {
      const sub = missingFrom(have && typeof have === "object" && !Array.isArray(have) ? (have as Catalog) : {}, value as Catalog);
      if (Object.keys(sub).length > 0) out[key] = sub;
    } else if (!(key in base)) {
      out[key] = value;
    }
  }
  return out;
}

/** The listed subtrees of one catalog, nested the same way. */
export function pickClientSubtrees(catalog: Catalog): Catalog {
  const out: Record<string, Record<string, unknown>> = {};
  for (const path of CLIENT_MESSAGE_SUBTREES) {
    const [ns, sub] = path.split(".");
    const node = (catalog[ns] as Catalog | undefined)?.[sub];
    if (node === undefined) continue;
    (out[ns] ??= {})[sub] = node;
  }
  return out;
}

