/**
 * TUL-146 "English on Spanish screens": sign-up copy, profile and settings,
 * the support panel, the Guide, services, and the browser tab title.
 *
 * Every new key must exist in BOTH catalogs and read as Spanish, the support
 * panel must carry its accents, and the pure helpers must map the English the
 * server persists into the reader's language.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DRAWER_HELP } from "@/components/admin/shell/internal/help-registry";
import { displaySupportPreview, displayTicketSubject } from "@/components/support/support-display";
import { BRAND_TAGLINE_ES, brandTaglineFor, defaultTabTitle } from "@/lib/brand/tagline";
import {
  CURRENCY_LABELS,
  CURRENCY_LABELS_ES,
  DEFAULT_CURRENCY_OPTIONS,
  currencyLabel,
} from "@/lib/billing/currencies";
import { ADHOC_GUIDE_NODES } from "@/lib/guide/adhoc-nodes";
import { createTranslator } from "./messages";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "../..");

type Json = { [k: string]: Json | string };
const en = JSON.parse(readFileSync(join(WEB, "messages/en.json"), "utf8")) as Json;
const es = JSON.parse(readFileSync(join(WEB, "messages/es.json"), "utf8")) as Json;

function at(tree: Json, path: string): string | undefined {
  let cur: Json | string | undefined = tree;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in cur) cur = cur[part];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

const NEW_KEYS = [
  "dashboard.adminSupport.directMessageSubject",
  "dashboard.adminSupport.supportRequestSubject",
  "dashboard.talentBookingTerms.loading",
  "dashboard.adminHelp.categories.support",
  ...[
    "awaiting-client", "archived-work", "day-detail", "my-profile", "tenant-summary", "identity",
    "activation-checklist", "tenant-switcher", "storefront-visibility", "talent-activity",
    "talent-today-pulse", "talent-booking-detail", "talent-limits", "talent-travel", "talent-links",
    "talent-reviews", "talent-documents", "talent-media-kit", "talent-notifications",
    "talent-verification", "talent-voice-reply", "talent-chat-archive", "talent-share-card",
    "payout-method-failure", "subscription-lifecycle", "notification-detail", "ai-draft-assist",
    "ai-search-explain", "support-ticket", "support.live-chat", "support.start-ticket", "support.guide-tab",
  ].map((id) => `dashboard.adminHelp.drawerLabels.${id}`),
];

test("every new key exists in en and es, and the Spanish differs from the English", () => {
  for (const key of NEW_KEYS) {
    const e = at(en, key);
    const s = at(es, key);
    assert.ok(e, `en missing ${key}`);
    assert.ok(s, `es missing ${key}`);
  }
  for (const key of [
    "dashboard.adminSupport.directMessageSubject",
    "dashboard.adminSupport.supportRequestSubject",
    "dashboard.talentBookingTerms.loading",
    "dashboard.adminHelp.categories.support",
  ]) {
    assert.notEqual(at(es, key), at(en, key), `${key} is still English in es`);
  }
});

test("the Guide has a Spanish title for every registry and support node", () => {
  const ids = [...Object.keys(DRAWER_HELP), ...Object.keys(ADHOC_GUIDE_NODES)];
  const missingLabel = ids.filter((id) => !at(es, `dashboard.adminHelp.drawerLabels.${id}`));
  const missingTopic = ids.filter((id) => !at(es, `dashboard.adminHelp.topics.${id}.purpose`));
  assert.deepEqual(missingLabel, [], "Guide nodes with no Spanish title");
  assert.deepEqual(missingTopic, [], "Guide nodes with no Spanish purpose line");
});

test("the Guide's registry-only support articles read in Spanish", () => {
  const t = createTranslator("es");
  assert.equal(t("dashboard.adminHelp.drawerLabels.support.live-chat"), "Chat en vivo");
  assert.equal(t("dashboard.adminHelp.categories.support"), "Soporte");
  assert.match(t("dashboard.adminHelp.topics.support.guide-tab.purpose"), /manual integrado/);
});

test("the Spanish support panel carries its accents and question marks", () => {
  const panel = (es.dashboard as Json).adminSupport as Json;
  const accentless =
    /\b(Conversacion|Como|Sin titulo|Mios|Todavia|Telefono|Categoria|Tambien|Manana|Actualizacion|Anade|numero|Facturacion|ultimos|rapido|Cuentanos|subio|pequeno|aqui|Recibiras|despues|respondera|llamara|articulos)\b/;
  const offenders = Object.entries(panel)
    .filter(([, v]) => typeof v === "string" && accentless.test(v as string))
    .map(([k, v]) => `${k}: ${v as string}`);
  assert.deepEqual(offenders, []);
  const t = createTranslator("es");
  assert.equal(t("dashboard.adminSupport.askPlaceholder"), "¿Cómo podemos ayudarte?");
  assert.equal(t("dashboard.adminSupport.segMine"), "Míos");
  assert.equal(t("dashboard.adminSupport.prefMorning"), "Mañana");
});

test("sign-up copy has no English product words left in Spanish", () => {
  const register = ((es.public as Json).auth as Json).register as Json;
  for (const [key, value] of Object.entries(register)) {
    if (typeof value !== "string") continue;
    assert.ok(!/workspace|roster/i.test(value), `register.${key} still has English: ${value}`);
  }
});

test("Spanish catalog additions have no em dashes", () => {
  for (const key of NEW_KEYS) {
    assert.ok(!/[—–]/.test(at(es, key) ?? ""), `dash in ${key}`);
  }
});

test("the persisted English ticket subjects and cards display in the reader's language", () => {
  const t = createTranslator("es");
  assert.equal(displayTicketSubject("Direct message", t), "Mensaje directo");
  assert.equal(displayTicketSubject("Support request", t), "Solicitud de soporte");
  assert.equal(displayTicketSubject("", t), "Sin título");
  assert.equal(displayTicketSubject("Mi cita no aparece", t), "Mi cita no aparece");
  assert.match(displaySupportPreview("Your ticket is with Orlando.", t), /^Tu ticket está con Orlando$/);
  assert.equal(
    displaySupportPreview("Requester asked to keep this ticket open.", t),
    "Mantendremos este ticket abierto.",
  );
  assert.equal(
    displaySupportPreview("Orlando will call you at +52 55 1234 5678.", t),
    "Orlando te llamará al +52 55 1234 5678.",
  );
  assert.equal(displaySupportPreview("Want Orlando to take a look?", t), "¿Quieres que Orlando lo mire?");
  assert.equal(displaySupportPreview("Gracias, ya quedó", t), "Gracias, ya quedó");
  // English readers keep English.
  const tEn = createTranslator("en");
  assert.equal(displayTicketSubject("Direct message", tEn), "Direct message");
});

test("the browser tab title follows the reader's language", () => {
  assert.equal(brandTaglineFor("es"), BRAND_TAGLINE_ES);
  assert.equal(defaultTabTitle("es"), "Tulala · Vende lo que haces, no lo que envías");
  assert.equal(defaultTabTitle("en"), "Tulala · Sell what you do, not what you ship");
  assert.equal(defaultTabTitle(undefined), "Tulala · Sell what you do, not what you ship");
  const layout = readFileSync(join(WEB, "src/app/layout.tsx"), "utf8");
  assert.match(layout, /buildBaseMetadata\(await getRequestLocale\(\)\)/);
});

test("the currency picker names every currency in Spanish", () => {
  for (const code of DEFAULT_CURRENCY_OPTIONS) {
    assert.ok(CURRENCY_LABELS_ES[code], `no Spanish label for ${code}`);
    assert.ok(CURRENCY_LABELS_ES[code].startsWith(`${code} · `));
    assert.equal(currencyLabel(code, false), CURRENCY_LABELS[code]);
    assert.equal(currencyLabel(code, true), CURRENCY_LABELS_ES[code]);
  }
  assert.equal(CURRENCY_LABELS_ES.MXN, "MXN · $ · Peso mexicano");
  assert.ok(!/Mexican/.test(Object.values(CURRENCY_LABELS_ES).join(" ")));
});

test("the admin shell is given the request locale on the server", () => {
  const layout = readFileSync(join(WEB, "src/app/(workspace)/[tenantSlug]/admin/layout.tsx"), "utf8");
  assert.match(layout, /<DashboardLocaleProvider locale=\{requestLocale\}>/);
});
