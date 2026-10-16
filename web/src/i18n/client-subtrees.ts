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

