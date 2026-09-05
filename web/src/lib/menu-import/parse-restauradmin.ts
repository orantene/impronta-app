/**
 * parse-restauradmin.ts — a real restaurant's menu export, into our offerings.
 *
 * Pure. No Supabase, no network, no `server-only`, so the whole mapping is
 * testable against the real 84 KB file rather than against a fixture someone
 * wrote to match the code. Every defect an importer actually ships is a mapping
 * defect, and mapping is pure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO THINGS THAT LOOK LIKE DATA AND ARE ACTUALLY BUGS IF YOU GET THEM WRONG.
 *
 * 1. A TIER'S NAME LIVES ON THE CATEGORY, NOT THE PRODUCT.
 *    A product carries `prices: { pican_2: 3000000, pican_5: 5000000 }`. Those
 *    keys are meaningless alone. The label is on its CATEGORY:
 *    `priceTypes: { pican_2: { name: "1 come 2 pican" } }`. Skip the join and
 *    you ship 24 products whose variants are labelled "pican_2" — which reads
 *    as data, not as a defect, so nobody reports it.
 *
 * 2. PRICES ARE ALREADY IN MINOR UNITS.
 *    A milanesa sandwich is `1000000`. As minor units that is 10,000.00 ARS,
 *    about seven dollars — a sandwich. Read as major units it is 1,000,000 ARS,
 *    about seven hundred dollars. So `amount_cents` takes the value VERBATIM and
 *    multiplying by 100 would price the entire menu a hundred times high.
 *
 *    This is inferred from plausibility, not stated by the export, so it is on
 *    the phase-boundary QA list: check one real price against the printed menu.
 *    Everything else here is provable from the file; this one is a judgement and
 *    is flagged as such rather than buried.
 */

export type ImportedText = { es: string; en: string };

export type ImportedVariant = {
  /** The tier key as exported — kept for idempotency, never shown. */
  sourceKey: string;
  /** Resolved from the CATEGORY's priceTypes. Falls back to the key, loudly. */
  label: string;
  amountCents: number;
  /** True when the category had no name for this tier and we fell back. */
  labelMissing: boolean;
};

export type ImportedAddOn = {
  sourceId: string;
  label: ImportedText;
  amountCents: number;
};

export type ImportedItem = {
  /** `restauradmin:<product-id>` — the idempotency key. */
  sourceId: string;
  title: ImportedText;
  description: ImportedText;
  /** The category's own name, used as the offering's `category`. */
  category: string;
  /** Null when the product has no single base price (every price is a tier). */
  amountCents: number | null;
  currency: string;
  imageUrl: string | null;
  variants: ImportedVariant[];
  addOns: ImportedAddOn[];
};

export type ImportRefusal = {
  sourceId: string;
  /** Named, never a code, because this list is shown to an operator. */
  reason:
    | "no_category"
    | "no_name"
    | "no_price"
    | "negative_price"
    | "disabled";
  detail: string;
};

export type ImportedMenu = {
  currency: string;
  defaultLocale: string;
  items: ImportedItem[];
  /** Everything deliberately not imported, with a reason an operator can act on. */
  refused: ImportRefusal[];
  counts: {
    categories: number;
    productsSeen: number;
    imported: number;
    refused: number;
    withVariants: number;
    withAddOns: number;
    withImage: number;
    tierLabelsMissing: number;
  };
};

const DEFAULT_CURRENCY = "USD";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function text(node: unknown, key: "name" | "description", locale: string): string {
  if (!node || typeof node !== "object") return "";
  const byLocale = (node as Record<string, unknown>)[locale];
  if (typeof byLocale === "string") return byLocale.trim();
  if (byLocale && typeof byLocale === "object") {
    return str((byLocale as Record<string, unknown>)[key]);
  }
  return "";
}

function cents(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  // VERBATIM. See the header: the export is already in minor units.
  return Math.round(v);
}

/**
 * Parse a restauradmin `menu_v2` export.
 *
 * Never throws on shape. A malformed product is REFUSED BY NAME rather than
 * skipped silently or crashing the run: an importer that drops three of 117
 * without saying which is worse than one that imports none, because the operator
 * cannot tell which three.
 */
export function parseRestauradminMenu(raw: unknown): ImportedMenu {
  const doc = (raw ?? {}) as Record<string, unknown>;
  const config = (doc.config ?? {}) as Record<string, unknown>;
  const currencyNode = (config.currency ?? {}) as Record<string, unknown>;
  const currency = str(currencyNode.code) || DEFAULT_CURRENCY;
  const defaultLocale = str(config.defaultLanguage) || "es";

  const catalog = (doc.catalog ?? {}) as Record<string, unknown>;
  const rawCategories = Array.isArray(catalog.categories) ? catalog.categories : [];
  const rawProducts = Array.isArray(catalog.products) ? catalog.products : [];

  // Category id -> its own name, and its tier labels. THE JOIN THAT MATTERS.
  const categoryName = new Map<string, ImportedText>();
  const tierLabels = new Map<string, Map<string, ImportedText>>();

  // CATEGORIES NEST. `cat-escabeches` carries its own `categories[]`, and 25 of
  // El Paisa's 117 products reference a CHILD id that is absent from the top
  // level. Walking only the top level loses 21% of the menu — which surfaced
  // only because an unknown category is REFUSED BY NAME here rather than
  // skipped. A parser that dropped them would have reported 92 of 117 as a
  // clean import.
  const walk = (nodes: unknown[], parentLabel: string | null) => {
    for (const c of nodes) {
      const cat = (c ?? {}) as Record<string, unknown>;
      const id = str(cat.id);
      if (!id) continue;
      const own = {
        es: text(cat.translations, "name", "es") || str((cat.translations as never)?.["es"]),
        en: text(cat.translations, "name", "en") || str((cat.translations as never)?.["en"]),
      };
      // A child keeps its parent's context: "Animales" alone is ambiguous on a
      // board, and splitting Escabeches into three unrelated sections loses the
      // grouping the printed menu actually has. No em dash, per house style.
      const label = parentLabel
        ? { es: `${parentLabel} / ${own.es || id}`, en: `${parentLabel} / ${own.en || own.es || id}` }
        : own;
      registerCategory(id, label, cat);
      const children = Array.isArray(cat.categories) ? cat.categories : [];
      if (children.length > 0) walk(children, own.es || own.en || id);
    }
  };

  const registerCategory = (
    id: string,
    label: ImportedText,
    cat: Record<string, unknown>,
  ) => {
    categoryName.set(id, label);

    const types = (cat.priceTypes ?? {}) as Record<string, unknown>;
    const labels = new Map<string, ImportedText>();
    for (const [key, node] of Object.entries(types)) {
      const n = (node ?? {}) as Record<string, unknown>;
      const name = n.name;
      if (typeof name === "string") labels.set(key, { es: name.trim(), en: name.trim() });
      else if (name && typeof name === "object") {
        labels.set(key, {
          es: str((name as Record<string, unknown>).es),
          en: str((name as Record<string, unknown>).en),
        });
      }
    }
    tierLabels.set(id, labels);
  };

  walk(rawCategories, null);

  const items: ImportedItem[] = [];
  const refused: ImportRefusal[] = [];
  let tierLabelsMissing = 0;

  for (const p of rawProducts) {
    const prod = (p ?? {}) as Record<string, unknown>;
    const id = str(prod.id);
    const sourceId = `restauradmin:${id}`;

    const titleEs = text(prod.translations, "name", "es");
    const titleEn = text(prod.translations, "name", "en");
    const categoryId = str(prod.categoryId);

    if (prod.enabled === false || prod.disabled === true) {
      refused.push({ sourceId, reason: "disabled", detail: titleEs || id });
      continue;
    }
    if (!categoryId || !categoryName.has(categoryId)) {
      refused.push({ sourceId, reason: "no_category", detail: `${titleEs || id} references ${categoryId || "no category"}` });
      continue;
    }
    if (!titleEs && !titleEn) {
      refused.push({ sourceId, reason: "no_name", detail: id });
      continue;
    }

    const prices = (prod.prices ?? {}) as Record<string, unknown>;
    const entries = Object.entries(prices).filter(([, v]) => cents(v) !== null);
    if (entries.length === 0) {
      refused.push({ sourceId, reason: "no_price", detail: titleEs || titleEn || id });
      continue;
    }
    if (entries.some(([, v]) => (cents(v) as number) < 0)) {
      refused.push({ sourceId, reason: "negative_price", detail: titleEs || titleEn || id });
      continue;
    }

    const labels = tierLabels.get(categoryId) ?? new Map<string, ImportedText>();
    const isSingle = entries.length === 1;
    // A lone "default" tier is a plain price, not a variant of one.
    const base = isSingle ? (cents(entries[0]![1]) as number) : null;

    const variants: ImportedVariant[] = isSingle
      ? []
      : entries.map(([key, value]) => {
          const label = labels.get(key);
          const resolved = label?.es || label?.en || "";
          if (!resolved) tierLabelsMissing += 1;
          return {
            sourceKey: key,
            label: resolved || key,
            amountCents: cents(value) as number,
            labelMissing: !resolved,
          };
        });

    const rawMods = Array.isArray(prod.modifiers) ? prod.modifiers : [];
    const addOns: ImportedAddOn[] = [];
    for (const m of rawMods) {
      const mod = (m ?? {}) as Record<string, unknown>;
      const amount = cents(mod.price);
      // `priceAction: add` is the only action we can express as an add-on; a
      // subtract or override is not an add-on and is left out rather than
      // silently turned into one.
      if (amount === null || amount < 0 || str(mod.priceAction) !== "add") continue;
      addOns.push({
        sourceId: str(mod.id),
        label: {
          es: text(mod.name, "name", "es") || str((mod.name as never)?.["es"]),
          en: text(mod.name, "name", "en") || str((mod.name as never)?.["en"]),
        },
        amountCents: amount,
      });
    }

    const catName = categoryName.get(categoryId)!;
    items.push({
      sourceId,
      title: { es: titleEs || titleEn, en: titleEn || titleEs },
      description: {
        es: text(prod.translations, "description", "es"),
        en: text(prod.translations, "description", "en"),
      },
      category: catName.es || catName.en || categoryId,
      amountCents: base,
      currency,
      imageUrl: str(prod.imageUrl) || null,
      variants,
      addOns,
    });
  }

  return {
    currency,
    defaultLocale,
    items,
    refused,
    counts: {
      categories: categoryName.size,
      productsSeen: rawProducts.length,
      imported: items.length,
      refused: refused.length,
      withVariants: items.filter((i) => i.variants.length > 0).length,
      withAddOns: items.filter((i) => i.addOns.length > 0).length,
      withImage: items.filter((i) => i.imageUrl).length,
      tierLabelsMissing,
    },
  };
}
