import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { translateDashboardText } from "./dashboard-i18n";
import { PAGE_META } from "./state";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");
const webRoot = join(here, "../../../../..");
const es = JSON.parse(readFileSync(join(webRoot, "messages/es.json"), "utf8")) as Record<string, unknown>;
const en = JSON.parse(readFileSync(join(webRoot, "messages/en.json"), "utf8")) as Record<string, unknown>;

function at(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], obj);
}

function* strings(o: unknown, prefix = ""): Generator<[string, string]> {
  if (typeof o === "string") yield [prefix, o];
  else if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) yield* strings(v, prefix ? `${prefix}.${k}` : k);
  }
}

// TUL-702: the sidebar tooltips on a Spanish workspace were English.
test("every sidebar tooltip has a Spanish row", () => {
  const missing: string[] = [];
  for (const [page, meta] of Object.entries(PAGE_META)) {
    const d = (meta as { description?: string }).description;
    if (d && translateDashboardText(d, "es") === d) missing.push(`${page}: ${d}`);
  }
  assert.deepEqual(missing, []);
});

// TUL-702 / TUL-704: a Spanish word written without its accent reads as a typo.
test("es.json has no unaccented Spanish markers", () => {
  const rx =
    /(?<![\p{L}\d_{])(?:[A-Za-z]+(?:cion|sion)|aqui|asi|despues|todavia|tambien|ademas|numero|pagina|paginas|telefono|dia|dias|sesion|version|catalogo|busqueda|duracion|ubicacion|politica|envian)(?![\p{L}\d_}])/iu;
  const bad = [...strings(es)].filter(([, v]) => rx.test(v)).map(([k, v]) => `${k}: ${v.slice(0, 70)}`);
  assert.deepEqual(bad, []);
});

test("workspace settings speak Spanish: no tenants, slots or dev text", () => {
  const scoped = [...strings(at(es, "dashboard.adminWorkspace.appointments"))]
    .concat([...strings(at(es, "dashboard.adminCalendar.resources"))]);
  for (const [k, v] of scoped) {
    assert.doesNotMatch(v, /\b(tenants?|slots?)\b/i, k);
    assert.doesNotMatch(v, /no está construid[ao]/i, k);
  }
  assert.equal(at(es, "dashboard.adminCalendar.resources.dragOff"), "Para reprogramar, abre la cita en Citas y clases.");
});

test("the Industria y palabras card follows the dashboard language", () => {
  const card = readFileSync(join(here, "../../../words/IndustrySettingsCard.tsx"), "utf8");
  assert.doesNotMatch(card, /locale = "en"/);
  assert.match(card, /useDashboardText/);
  assert.doesNotMatch(card, /Other business queda/);
});

test("the upsell chip and the trust pill have a Spanish branch", () => {
  const cards = read("primitives/cards.tsx");
  assert.match(cards, /más con/);
  // The trust pill words moved from inline ES literals to message keys.
  for (const k of ["Healthy", "Watchful", "Review"]) {
    const key = `dashboard.adminDrawers.trustHealthWord${k}`;
    assert.match(cards, new RegExp(key.replaceAll(".", "\\.")));
    const esWord = at(es, key);
    assert.equal(typeof esWord, "string");
    assert.notEqual(esWord, at(en, key));
  }
});

test("the registration plan line names the tier in the page language", () => {
  assert.equal(at(es, "dashboard.adminWorkspace.registration.tier.free"), "Gratis");
  assert.equal(at(en, "dashboard.adminWorkspace.registration.tier.free"), "Free");
  const src = readFileSync(join(here, "../../../admin/registration/RegistrationSettingsClient.tsx"), "utf8");
  assert.match(src, /tierName\(planLabel\)/);
});

// TUL-721: an independent Profesional must not read agency wording.
test("booking terms have solo wording in Spanish and English", () => {
  for (const key of ["refundFallbackSolo", "instantBookHintSolo"]) {
    const esText = at(es, `dashboard.talentBookingTerms.${key}`) as string;
    assert.ok(esText, key);
    assert.doesNotMatch(esText, /agenc/i);
    assert.doesNotMatch(at(en, `dashboard.talentBookingTerms.${key}`) as string, /agency/i);
  }
  assert.doesNotMatch(at(es, "dashboard.talentBookingTerms.instantBookHint") as string, /Agency/);
});

test("the Depósito card and drawer branch on having no agencies", () => {
  const card = readFileSync(
    join(here, "../../../../app/(workspace)/[tenantSlug]/talent/settings/CommercialBookingTermsCard.tsx"),
    "utf8",
  );
  assert.match(card, /solo \? "dashboard\.talentBookingTerms\.refundFallbackSolo"/);
  const page = read("talent/pages/SettingsPage.tsx");
  assert.match(page, /solo=\{\(bridgeTalentAgencies \?\? \[\]\)\.length === 0\}/);
  const drawer = read("drawers/profile-shell/profile-shell-modules/profile-commercial-terms.tsx");
  assert.match(drawer, /solo \? "Each offer sets its own refund terms\."/);
  assert.equal(
    translateDashboardText("Each offer sets its own refund terms.", "es"),
    "Cada oferta define sus propios términos de reembolso.",
  );
});

test("field visibility offers no Agency audience to an independent Profesional", () => {
  const forms = read("primitives/forms.tsx");
  assert.match(forms, /solo \? \["public", "private"\]/);
  assert.match(forms, /has\("agency"\) && !solo/);
});

// TUL-721: the passkey card was fully English on the Spanish admin.
test("the passkey card follows the dashboard language", () => {
  const card = read("modern-features.tsx");
  assert.match(card, /useDashboardText/);
  for (const en of ["Sign in with passkey", "Set up a passkey", "Remove passkey", "Sign in to test"]) {
    assert.match(card, new RegExp(`copy\\.t\\(.*${en}`), en);
    assert.notEqual(translateDashboardText(en, "es"), en, en);
  }
});

// TUL-721: the Clientes button said the feminine "Agregar clienta".
test("Add client reads as the inclusive Agregar cliente", () => {
  for (const en of ["Add client", "Add a client", "Add a new client"]) {
    assert.doesNotMatch(translateDashboardText(en, "es"), /clienta/i, en);
  }
});
