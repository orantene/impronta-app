/**
 * T1 catalog (La Cantina del Puerto). Cents are MXN. Rules:
 *   - every 2x1 / happy-hour / promo-deal story gets a NON-ALCOHOLIC item (attributes.deal = true, alcohol = false);
 *   - Margarita and the two beers exist only as gated "excluded" control items (attributes.alcohol = true, excluded_from_deals = true);
 *   - no public title says QA / test / E2E.
 * Columns that exist only in a held migration are built only when the live schema has them; otherwise the item is listed in `blocked`.
 */
import { addonOp, insert, offeringOp, poolOp, s2Id, variantOp } from "./stage2-ops.mjs";
import { T1_WS } from "./stage2-plan-t1.mjs";

const KITCHEN = () => s2Id("station:t1-kitchen");
const BAR = () => s2Id("station:t1-bar");
export const HELD = {
  posEnabled: { version: "20261231417300", file: "supabase/migrations/_pending_pm/20261231417300_talent_offerings_pos_enabled.sql", column: "talent_offerings.pos_enabled" },
};
const ALCOHOL = { alcohol: true, excluded_from_deals: true, control: true };
const DEAL = { deal: true, alcohol: false };

/** ctx.has("talent_offerings.pos_enabled") is true when the live schema carries the column. */
export function planT1Catalog(ctx = { has: () => false }) {
  const fx = "T1";
  const ws = T1_WS;
  const ops = [];
  const blocked = [];
  const item = (key, spec) => {
    const op = offeringOp(fx, key, ws, spec);
    ops.push(op);
    return op;
  };

  // Mains
  item("t1-hamburguesa", { title: "Hamburguesa clásica", titleEn: "Classic burger", description: "Carne de res, queso y verduras frescas.", descriptionEn: "Beef patty, cheese and fresh vegetables.", category: "Platos fuertes", cents: 12000, station: KITCHEN(), sort: 10 });
  ops.push(variantOp(fx, "t1-hamburguesa-grande", "t1-hamburguesa", { label: "Grande", cents: 15000 })); // Large +30
  ops.push(addonOp(fx, "t1-hamburguesa-queso", "t1-hamburguesa", { label: "Queso extra", cents: 1000, sort: 0 }));
  ops.push(addonOp(fx, "t1-hamburguesa-tocino", "t1-hamburguesa", { label: "Tocino", cents: 1500, sort: 1 }));
  item("t1-burrito", { title: "Burrito", titleEn: "Burrito", description: "Tortilla de harina con frijoles, arroz y carne.", descriptionEn: "Flour tortilla with beans, rice and meat.", category: "Platos fuertes", cents: 8000, station: KITCHEN(), sort: 20 });
  item("t1-entrada", { title: "Guacamole con totopos", titleEn: "Guacamole with chips", description: "Aguacate fresco, cebolla y cilantro.", descriptionEn: "Fresh avocado, onion and cilantro.", category: "Entradas", cents: 9500, station: KITCHEN(), sort: 5 });
  item("t1-tacos-exp", { kind: "package", title: "Experiencia de tacos", titleEn: "Taco experience", description: "Cinco tacos de la casa con salsas y bebida.", descriptionEn: "Five house tacos with salsas and a drink.", category: "Experiencias", cents: 24900, station: KITCHEN(), sort: 30 });

  // Bar: gated control items (alcohol) and their non-alcoholic counterparts for every 2x1 / happy-hour story.
  const pool = (key, units, offeringKey) => poolOp(fx, key, ws, { kind: "offering", subjectId: s2Id(`offering:${offeringKey}`), units });
  ops.push(pool("t1-margarita", 5, "t1-margarita"));
  item("t1-margarita", { title: "Margarita", titleEn: "Margarita", description: "Coctel de la casa.", descriptionEn: "House cocktail.", category: "Bar", cents: 9000, station: BAR(), sort: 40, attrs: ALCOHOL, poolId: s2Id("pool:t1-margarita"), stock: 5 });
  item("t1-cerveza-clara", { title: "Cerveza clara", titleEn: "Lager", description: "Botella fría.", descriptionEn: "Cold bottle.", category: "Bar", cents: 8000, station: BAR(), sort: 41, attrs: ALCOHOL });
  item("t1-cerveza-oscura", { title: "Cerveza oscura", titleEn: "Dark lager", description: "Botella fría.", descriptionEn: "Cold bottle.", category: "Bar", cents: 8000, station: BAR(), sort: 42, attrs: ALCOHOL });
  item("t1-limonada", { title: "Limonada mineral", titleEn: "Sparkling lemonade", description: "Limón fresco con agua mineral.", descriptionEn: "Fresh lemon with sparkling water.", category: "Bebidas sin alcohol", cents: 5500, station: BAR(), sort: 50, attrs: DEAL });
  item("t1-jamaica", { title: "Agua de jamaica", titleEn: "Hibiscus water", description: "Agua fresca de flor de jamaica.", descriptionEn: "Fresh hibiscus flower water.", category: "Bebidas sin alcohol", cents: 4500, station: BAR(), sort: 51, attrs: DEAL });

  // Sushi: 3 SKUs + 1 premium, 6- and 12-piece variants, one add-on.
  const sushi = [
    { key: "t1-sushi-california", title: "Rollo California", en: "California roll", six: 14000, twelve: 26000, sort: 60 },
    { key: "t1-sushi-philadelphia", title: "Rollo Philadelphia", en: "Philadelphia roll", six: 15500, twelve: 29000, sort: 61 },
    { key: "t1-sushi-vegetariano", title: "Rollo vegetariano", en: "Vegetarian roll", six: 13000, twelve: 24000, sort: 62 },
    { key: "t1-sushi-premium", title: "Rollo dragón premium", en: "Premium dragon roll", six: 22000, twelve: 41000, sort: 63, premium: true },
  ];
  for (const s of sushi) {
    item(s.key, { title: s.title, titleEn: s.en, description: "Arroz, alga y relleno fresco.", descriptionEn: "Rice, seaweed and fresh filling.", category: "Sushi", cents: s.six, station: KITCHEN(), sort: s.sort, attrs: s.premium ? { premium: true } : {} });
    ops.push(variantOp(fx, `${s.key}-6`, s.key, { label: "6 piezas", cents: s.six, sort: 0 }), variantOp(fx, `${s.key}-12`, s.key, { label: "12 piezas", cents: s.twelve, sort: 1 }));
  }
  ops.push(addonOp(fx, "t1-sushi-california-salsa", "t1-sushi-california", { label: "Salsa extra", cents: 1500 }));

  // Edge items.
  item("t1-opciones", { title: "Platillo por tamaño", titleEn: "Dish by size", description: "El precio depende del tamaño.", descriptionEn: "The price depends on the size.", category: "Platos fuertes", cents: null, station: KITCHEN(), sort: 70 });
  ops.push(variantOp(fx, "t1-opciones-chico", "t1-opciones", { label: "Chico", cents: 6000, sort: 0 }), variantOp(fx, "t1-opciones-grande", "t1-opciones", { label: "Grande", cents: 9000, sort: 1 }));
  ops.push(pool("t1-ultima", 1, "t1-ultima"));
  item("t1-ultima", { title: "Tarta del día", titleEn: "Tart of the day", description: "Solo queda una pieza.", descriptionEn: "Only one piece left.", category: "Postres", cents: 11000, station: KITCHEN(), sort: 80, poolId: s2Id("pool:t1-ultima"), stock: 1 });
  ops.push(pool("t1-agotado", 0, "t1-agotado"));
  item("t1-agotado", { title: "Flan napolitano", titleEn: "Flan", description: "Agotado por hoy.", descriptionEn: "Sold out today.", category: "Postres", cents: 7500, station: KITCHEN(), sort: 81, poolId: s2Id("pool:t1-agotado"), stock: 0 });
  item("t1-pizza", { title: "Pizza personal", titleEn: "Personal pizza", description: "Masa delgada con queso.", descriptionEn: "Thin crust with cheese.", category: "Platos fuertes", cents: 9000, station: KITCHEN(), sort: 71 });
  ops.push(variantOp(fx, "t1-pizza-regular", "t1-pizza", { label: "Regular", cents: 9000, sort: 0 }), variantOp(fx, "t1-pizza-chef", "t1-pizza", { label: "Especial del chef", cents: 12000, sort: 1, hidden: true }));
  item("t1-banquete", { title: "Banquete para grupos", titleEn: "Group banquet", description: "Cotización por persona.", descriptionEn: "Quoted per person.", category: "Experiencias", cents: null, visibility: "on_request", sort: 90 });
  item("t1-borrador", { title: "Platillo en desarrollo", titleEn: "Dish in development", description: "Aún no se publica.", descriptionEn: "Not published yet.", category: "Platos fuertes", cents: 10000, status: "draft", sort: 99 });
  if (ctx.has(HELD.posEnabled.column)) {
    item("t1-solo-linea", { title: "Platillo solo en línea", titleEn: "Online-only dish", description: "No se vende en caja.", descriptionEn: "Not sold at the counter.", category: "Platos fuertes", cents: 11500, station: KITCHEN(), sort: 72, extra: { pos_enabled: false } });
  } else {
    blocked.push({ item: "POS-off dish (talent_offerings.pos_enabled = false)", ...HELD.posEnabled });
  }

  // Reservation offering (venue A's rules point at it), a dinner menu, an event-backing package on a DRAFT event, and Dinner + Show.
  item("t1-menu-cena", { title: "Menú de cena", titleEn: "Dinner menu", description: "Entrada, plato fuerte y postre.", descriptionEn: "Starter, main and dessert.", category: "Combos", cents: 18000, station: KITCHEN(), sort: 110 });
  item("t1-show-evento", { kind: "package", title: "Show en vivo", titleEn: "Live show", description: "Música en vivo en el salón.", descriptionEn: "Live music in the dining room.", category: "Eventos", cents: 27000, sort: 120 });
  ops.push(insert(fx, "public.events", "event:t1-show", {
    id: s2Id("event:t1-show"), tenant_id: T1_WS, slug: "s2-cantina-show-en-vivo", title: "Show en vivo", description: "Música en vivo en el salón.",
    status: "draft", offering_id: s2Id("offering:t1-show-evento"), admission_kind: "ticket", doors_offset_minutes: 30,
  }));
  item("t1-cena-show", { kind: "package", title: "Cena + Show", titleEn: "Dinner + Show", description: "Menú de cena con entrada al show.", descriptionEn: "Dinner menu with a ticket to the show.", category: "Combos", cents: 45000, sort: 130 });
  ops.push(
    insert(fx, "public.offering_components", "component:t1-cena-show-cena", { id: s2Id("component:t1-cena-show-cena"), tenant_id: T1_WS, offering_id: s2Id("offering:t1-cena-show"), component_offering_id: s2Id("offering:t1-menu-cena"), qty: 1, required: true }),
    insert(fx, "public.offering_components", "component:t1-cena-show-show", { id: s2Id("component:t1-cena-show-show"), tenant_id: T1_WS, offering_id: s2Id("offering:t1-cena-show"), component_offering_id: s2Id("offering:t1-show-evento"), qty: 1, required: true }),
  );
  return { ops, blocked };
}
