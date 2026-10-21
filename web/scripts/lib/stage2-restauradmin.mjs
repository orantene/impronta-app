/**
 * RestaurAdmin menu exports v1 / v2 / v3 for the safe re-import cases (CAT-QA B2). Shape = what
 * web/src/lib/menu-import/parse-restauradmin.ts reads: config.currency.code, config.defaultLanguage, catalog.categories[]
 * (translations + priceTypes naming the tiers), catalog.products[] (categoryId, enabled, translations, prices in MINOR units, modifiers).
 *
 *   v1  six dishes, one with a "Queso extra" modifier and one with two size tiers
 *   v2  the same dishes with THREE price changes (Alambre, Sopes tier of 5, Agua de tamarindo)
 *   v3  v2 with ONE dish removed (Torta cubana)
 * Source ids are stable across versions (restauradmin:<id>), so a re-import must update in place, never duplicate.
 * All dishes are non-alcoholic and the files carry no credentials. Import is MANUAL (Settings > Menu import, paste or upload); the
 * seed never imports. Import into T2 or a fresh workspace: the names differ from T1's seeded catalog on purpose.
 */

const cat = (id, es, en, priceTypes = {}) => ({ id, translations: { es: { name: es }, en: { name: en } }, priceTypes });
const prod = (id, categoryId, es, en, descEs, descEn, prices, modifiers = []) => ({
  id, enabled: true, categoryId, translations: { es: { name: es, description: descEs }, en: { name: en, description: descEn } }, prices, modifiers,
});

const CATEGORIES = [
  cat("cat-antojitos", "Antojitos", "Snacks"),
  cat("cat-sopes", "Sopes", "Sopes", { ped3: { name: { es: "Orden de 3", en: "Order of 3" } }, ped5: { name: { es: "Orden de 5", en: "Order of 5" } } }),
  cat("cat-bebidas", "Bebidas", "Drinks"),
];

function products({ alambre, ped5, tamarindo, withTorta }) {
  const list = [
    prod("p-alambre", "cat-antojitos", "Alambre mixto", "Mixed alambre", "Res, tocino, queso y pimiento.", "Beef, bacon, cheese and pepper.", { default: alambre },
      [{ id: "m-queso", name: { es: "Queso extra", en: "Extra cheese" }, price: 1500, priceAction: "add" }]),
    ...(withTorta ? [prod("p-torta", "cat-antojitos", "Torta cubana", "Cuban sandwich", "Pierna, jamón y salchicha.", "Pork leg, ham and sausage.", { default: 9800 })] : []),
    prod("p-quesadilla", "cat-antojitos", "Quesadilla de flor", "Squash blossom quesadilla", "Flor de calabaza y queso Oaxaca.", "Squash blossom and Oaxaca cheese.", { default: 7200 }),
    prod("p-sopes", "cat-sopes", "Sopes de frijol", "Bean sopes", "Frijol, crema y queso fresco.", "Beans, cream and fresh cheese.", { ped3: 6500, ped5: ped5 }),
    prod("p-tamarindo", "cat-bebidas", "Agua de tamarindo", "Tamarind water", "Agua fresca de tamarindo.", "Fresh tamarind water.", { default: tamarindo }),
    prod("p-atole", "cat-bebidas", "Atole de vainilla", "Vanilla atole", "Atole caliente de vainilla.", "Warm vanilla atole.", { default: 3800 }),
  ];
  return list;
}

const doc = (p) => ({ config: { currency: { code: "MXN" }, defaultLanguage: "es" }, catalog: { categories: CATEGORIES, products: p } });

export const exportV1 = () => doc(products({ alambre: 14500, ped5: 9500, tamarindo: 4000, withTorta: true }));
export const exportV2 = () => doc(products({ alambre: 15500, ped5: 10000, tamarindo: 4500, withTorta: true }));
export const exportV3 = () => doc(products({ alambre: 15500, ped5: 10000, tamarindo: 4500, withTorta: false }));

export const EXPORT_FILES = {
  "docs/fixtures/restauradmin-export-v1.json": exportV1,
  "docs/fixtures/restauradmin-export-v2.json": exportV2,
  "docs/fixtures/restauradmin-export-v3.json": exportV3,
};
