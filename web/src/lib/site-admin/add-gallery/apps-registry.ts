/**
 * Apps registry — the ONE list of interactive mini-tools the talent builder's
 * "Apps" gallery tab offers. Adding an app is one entry here (plus the builder
 * node kind it inserts, wired at the usual four layers); the gallery items, the
 * card thumbnail lookup and the surface gating all derive from this list.
 *
 * Surface gating is not done here: the tab is offered only on surfaces whose
 * `galleryPolicy.allowedTabs` lists "apps" (talent page, theme template), so
 * the agency Studio gallery never sees any entry.
 */
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node/types";
import { THEME_DEMOS, type ThemeDemoProfession } from "@/lib/talent-site/theme-catalog/theme-demos";

/**
 * App Library model: apps belong to TRADES, never to a design. `recommendedDesigns`
 * is a suggestion for the library UI only; no design ships an app as its default.
 */
export interface AppLibraryMeta {
  name: { en: string; es: string };
  pitch: { en: string; es: string };
  /** Trades the app is for (theme-demo profession keys). */
  trades: ReadonlyArray<ThemeDemoProfession>;
  /** Design slugs that show the app off well (hint, not a binding). */
  recommendedDesigns: ReadonlyArray<string>;
  /** Premium library flag the plan system reads later. False today. */
  premium: boolean;
}

export interface AppRegistryEntry extends AppLibraryMeta {
  /** Gallery item id (stable, prefixed `app-`). */
  id: string;
  /** The builder node kind inserted on click / drop. */
  nativeKind: BuilderNodeKind;
  /** English source strings; Spanish lives in the editor ES catalog. */
  label: string;
  description: string;
  /** Gallery icon key. */
  icon: string;
  /** Key resolved by the card's thumbnail component. */
  thumbnail: string;
  searchTerms: ReadonlyArray<string>;
}

export const APP_REGISTRY: ReadonlyArray<AppRegistryEntry> = [
  {
    id: "app-nail-designer",
    nativeKind: "app_nail_designer",
    label: "Nail Designer",
    description:
      "Visitors design a manicure nail by nail and send it with their booking request. Drop it in and it works, nothing to set up.",
    icon: "interactive",
    thumbnail: "nail-designer",
    name: { en: "Nail Designer", es: "Diseñador de uñas" },
    pitch: {
      en: "Clients design their manicure nail by nail and send it with their booking.",
      es: "Tus clientas diseñan su manicura uña por uña y la envían con su reserva.",
    },
    trades: ["nails"],
    recommendedDesigns: ["maison-v2"],
    premium: false,
    searchTerms: ["nails", "manicure", "polish", "design", "app", "uñas", "manicura", "esmalte"],
  },
];

/** Demo trades the theme-demo list does not carry (the reference demos sit outside it). */
const DEMO_TRADE_OVERRIDES: Readonly<Record<string, ReadonlyArray<ThemeDemoProfession>>> = {
  // Alba, the Maison v2 reference demo (content.json trade: Nail Artist).
  "TAL-93020": ["nails"],
};

/** Trades of a demo profile code (empty when unknown). */
export function tradesForDemoCode(profileCode: string): ReadonlyArray<ThemeDemoProfession> {
  return DEMO_TRADE_OVERRIDES[profileCode] ?? THEME_DEMOS.find((d) => d.profileCode === profileCode)?.professions ?? [];
}

export function appsForTrade(trade: string): AppRegistryEntry[] {
  return APP_REGISTRY.filter((a) => (a.trades as ReadonlyArray<string>).includes(trade));
}

/** Apps for a demo by its trades (never by its design). */
export function appsForDemo(demo: { profileCode: string }): AppRegistryEntry[] {
  const trades = tradesForDemoCode(demo.profileCode);
  return APP_REGISTRY.filter((a) => a.trades.some((t) => trades.includes(t)));
}

export function appsForDesign(slug: string): AppRegistryEntry[] {
  return APP_REGISTRY.filter((a) => a.recommendedDesigns.includes(slug));
}

/** Library entry as the talent theme gallery reads it (same object as the builder entry). */
export type AppLibraryEntry = AppRegistryEntry;

/** Apps recommended for any of these trades (theme gallery demo cards). De-duplicated. */
export function appsForProfessions(professions: ReadonlyArray<string>): AppRegistryEntry[] {
  const seen = new Set<string>();
  const out: AppRegistryEntry[] = [];
  for (const p of professions) for (const app of appsForTrade(p)) if (!seen.has(app.id)) { seen.add(app.id); out.push(app); }
  return out;
}

/** Every app in the library (alias of the builder registry). */
export const APP_LIBRARY: ReadonlyArray<AppRegistryEntry> = APP_REGISTRY;
