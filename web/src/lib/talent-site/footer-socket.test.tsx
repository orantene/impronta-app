/**
 * Global Tulala footer socket: one strip on every design, tokens only,
 * whitelabel-aware, correct links, no double credit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { TalentSiteSocket } from "@/components/talent-site/talent-site-socket";
import { BUILTIN_DESIGNS, BUILTIN_LOOKS } from "@/lib/talent-site/theme-catalog/builtins";
import { MAISON_BUILTIN_DESIGN, MAISON_BUILTIN_LOOKS } from "@/lib/talent-site/theme-catalog/maison/builtins";
import { COLLECTION_DESIGNS } from "@/lib/talent-site/theme-catalog/collection/designs";
import { FOLIO_BUILTIN_LOOKS } from "@/lib/talent-site/theme-catalog/collection/folio-looks";
import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";
import {
  buildSocketModel,
  headerShowsLanguageSwitch,
  shortTalentName,
  socketLockedHint,
  stripDesignCredits,
  TULALA_LEGAL_PRIVACY_URL,
  localizedLegalUrl,
  TULALA_LEGAL_TERMS_URL,
} from "./footer-socket";

const DESIGNS = [...BUILTIN_DESIGNS, MAISON_BUILTIN_DESIGN, ...COLLECTION_DESIGNS];
const LOOKS = [...BUILTIN_LOOKS, ...MAISON_BUILTIN_LOOKS, ...FOLIO_BUILTIN_LOOKS];

function model(over: Partial<Parameters<typeof buildSocketModel>[0]> = {}) {
  return buildSocketModel({
    locale: "es",
    publicPathPrefix: "",
    supportedLocales: ["es"],
    showCredit: true,
    whitelabel: false,
    consentTooling: false,
    ...over,
  });
}

function html(over: Partial<Parameters<typeof buildSocketModel>[0]> = {}, hint?: string): string {
  return renderToStaticMarkup(<TalentSiteSocket model={model(over)} hint={hint} />);
}

test("the catalog under test covers 5 builtins + Maison + 6 collection designs", () => {
  assert.equal(DESIGNS.length, 12);
  assert.equal(new Set(DESIGNS.map((d) => d.slug)).size, 12);
});

for (const d of DESIGNS) {
  test(`socket renders for design ${d.slug} with its own footer above it`, () => {
    const payload = d.buildPayload();
    assert.ok(payload.shellTree.length > 0, `${d.slug} has a shell`);
    const out = html();
    assert.match(out, /data-tulala-socket/);
    assert.match(out, /Políticas de reserva/);
    assert.match(out, /Sitio creado con\s*<a[^>]*>Tulala\.digital/);
    // No design keeps its own credit once the socket strips it at render time.
    assert.equal(JSON.stringify(stripDesignCredits(payload.shellTree)).toLowerCase().includes("hecho con tulala"), false);
    assert.equal(JSON.stringify(stripDesignCredits(payload.shellTree)).toLowerCase().includes("made with tulala"), false);
  });
}

test("colours are tokens only: no hex, rgb or hsl literals in the strip", () => {
  const out = html({ supportedLocales: ["es", "en"], switcherHrefs: { es: "/", en: "/en" } }, "x");
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(out.replace(/href="[^"]*"/g, "")), false);
  assert.equal(/\b(rgb|rgba|hsl|hsla|oklch)\(/i.test(out), false);
  const vars = new Set([...out.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  const allowed = new Set([
    "--token-color-background",
    "--token-color-surface-raised",
    "--token-color-ink",
    "--token-color-line",
    "--site-body-font",
    "--ts-bg",
    "--ts-ink",
    "--ts-line",
    "--ts-muted",
  ]);
  for (const v of vars) assert.ok(allowed.has(v as string), `unexpected var ${v}`);
  assert.match(out, /color-mix\(in srgb,var\(--ts-ink\) 82%,var\(--ts-bg\)\)/);
  assert.equal(out.includes("ink-muted"), false);
});

function mix(ink: string, bg: string, inkPct: number): string {
  const c = (h: string) => {
    const x = h.trim().replace(/^#/, "");
    const f = x.length === 3 ? x.split("").map((ch) => ch + ch).join("") : x;
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
  };
  const a = c(ink);
  const b = c(bg);
  return (
    "#" +
    a
      .map((v, i) => Math.round((v * inkPct) / 100 + (b[i]! * (100 - inkPct)) / 100).toString(16).padStart(2, "0"))
      .join("")
  );
}

test("ink and derived muted ink reach 4.5:1 on every look's strip surface", () => {
  let checked = 0;
  for (const look of LOOKS) {
    const t = look.buildPayload().tokens;
    const ink = t["color.ink"];
    const bg = t["color.background"];
    if (!ink || !bg) continue;
    for (const surface of [bg, t["color.surface-raised"] ?? bg]) {
      const muted = mix(ink, surface, 82);
      const rInk = contrastRatio(ink, surface);
      const rMuted = contrastRatio(muted, surface);
      assert.ok(rInk !== null && rInk >= 4.5, `${look.slug} ink ${rInk}`);
      assert.ok(rMuted !== null && rMuted >= 4.5, `${look.slug} muted ${rMuted}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 20, `checked ${checked}`);
});

test("whitelabel hides the credit but keeps the Tulala document links", () => {
  const out = html({ whitelabel: true });
  assert.equal(out.includes("Sitio creado con"), false);
  assert.equal(out.includes("data-socket-credit"), false);
  assert.ok(out.includes(localizedLegalUrl(TULALA_LEGAL_TERMS_URL, "es")));
  assert.ok(out.includes(localizedLegalUrl(TULALA_LEGAL_PRIVACY_URL, "es")));
});

test("a plan that removes the badge hides the credit too", () => {
  assert.equal(html({ showCredit: false }).includes("Sitio creado con"), false);
  assert.equal(html({ showCredit: true, locale: "en" }).includes("Site made with"), true);
});

test("links: talent policies on the talent host, Tulala documents off-host", () => {
  const m = model();
  const by = Object.fromEntries([...m.siteLinks, ...m.tulalaLinks].map((l) => [l.key, l]));
  assert.equal(by["booking-policy"]!.href, "/politicas");
  assert.equal(by["privacy"]!.href, "/privacidad");
  assert.equal(by["tulala-terms"]!.href, "https://tulala.digital/es/legal/terms");
  assert.equal(by["tulala-privacy"]!.href, "https://tulala.digital/es/legal/privacy");
  assert.equal(by["tulala-terms"]!.external, true);
  assert.equal(model({ publicPathPrefix: "/t/site/jor/" }).siteLinks[0]!.href, "/t/site/jor/politicas");
  assert.match(html(), /rel="noopener"/);
});

test("privacy choices only with the consent-tooling flag; default off", () => {
  assert.equal(html().includes("opciones de privacidad"), false);
  assert.match(html({ consentTooling: true }), /Tus opciones de privacidad/);
  assert.match(html({ consentTooling: true, locale: "en" }), /Your privacy choices/);
});

test("language switch only with 2+ languages", () => {
  assert.equal(html().includes("data-socket-languages"), false);
  assert.equal(
    html({ supportedLocales: ["es"], switcherHrefs: { es: "/" } }).includes("data-socket-languages"),
    false,
  );
  const two = html({ supportedLocales: ["es", "en"], switcherHrefs: { es: "/", en: "/en" } });
  assert.match(two, /data-socket-languages/);
  assert.match(two, /href="\/en"/);
  assert.match(two, /aria-current="true"/);
});

test("builder canvas shows the locked hint in EN and ES", () => {
  assert.equal(socketLockedHint("es"), "Barra de Tulala, se ve igual en todos los diseños");
  assert.equal(socketLockedHint("en"), "Tulala bar, looks the same on every design");
  assert.match(html({}, socketLockedHint("es")), /data-socket-locked/);
});

test("no em dashes in the socket copy", () => {
  const out = html({ consentTooling: true, supportedLocales: ["es", "en"], switcherHrefs: { es: "/", en: "/en" } });
  assert.equal(out.includes("—"), false);
});

test("layout: stacked on phone, one row from 768px, room for the dock", () => {
  const out = html();
  assert.match(out, /@media \(min-width:768px\)/);
  assert.match(out, /grid-auto-flow:column/);
  assert.match(out, /padding-bottom:132px/);
});

test("Maison v2 credit is hidden at render time, not by a payload edit", () => {
  const maison = DESIGNS.find((d) => d.slug === "maison-v2")!;
  const tree = maison.buildPayload().shellTree;
  // Release 2.7's rich footer already dropped the design-level credit; stripDesignCredits still
  // covers sites seeded before it (a stored credit paragraph is hidden at render time).
  const legacy = [{ kind: "paragraph", props: { text: "Hecho con Tulala" } }];
  assert.ok(JSON.stringify(legacy).includes("Hecho con Tulala"));
  assert.equal(JSON.stringify(stripDesignCredits(legacy)).includes("Hecho con Tulala"), false);
  assert.equal(JSON.stringify(stripDesignCredits(tree)).includes("Hecho con Tulala"), false);
});

test("renderers wire the socket and the old badge div is gone", () => {
  const root = join(process.cwd(), "src");
  const render = readFileSync(join(root, "lib/talent-site/server/render-max-site.tsx"), "utf8");
  const canvas = readFileSync(join(root, "lib/talent-site/server/talent-builder-canvas.server.tsx"), "utf8");
  const stmt = readFileSync(join(root, "lib/site-admin/builder-node/statement-footer-block.tsx"), "utf8");
  assert.match(render, /<TalentSiteSocket/);
  assert.equal(render.includes("data-talent-max-site-badge"), false);
  assert.match(canvas, /shellSocket/);
  assert.equal(stmt.includes("Hecho con Tulala"), false);
});

// ── Desktop parity round: the strip matches the mockup's `.bstrip` ───────────

test("the first group carries the talent's name, not 'Este sitio'", () => {
  assert.match(html({ talentName: "Alba" }), /<span class="tulala-socket__label">Alba<\/span>/);
  assert.match(html({}), /Este sitio/);
  assert.match(html({ locale: "en" }), /This site/);
  // A long display name is shortened to its first word.
  assert.equal(shortTalentName("Valeria Gómez Ramírez de la Torre"), "Valeria");
  assert.equal(shortTalentName("  "), null);
  assert.equal(shortTalentName("Jorg Beauty"), "Jorg Beauty");
});

test("the Tulala group has Cookies, pointing at the platform cookies page", () => {
  const m = model();
  assert.deepEqual(m.tulalaLinks.map((l) => l.key), ["tulala-terms", "tulala-privacy", "tulala-cookies"]);
  const cookies = m.tulalaLinks.find((l) => l.key === "tulala-cookies")!;
  assert.equal(cookies.label, "Cookies");
  assert.equal(cookies.href, "https://tulala.digital/es/legal/cookies");
  assert.equal(cookies.external, true);
  assert.match(html(), /data-socket-link="tulala-cookies"/);
});

test("the credit reads 'Sitio creado con Tulala.digital' (EN 'Site made with'), linked, on the right, whitelabel-aware", () => {
  const es = html({ locale: "es" });
  assert.match(es, /data-socket-credit[^>]*>Sitio creado con<a href="https:\/\/tulala\.digital"[^>]*>Tulala\.digital<\/a>/);
  assert.match(html({ locale: "en" }), />Site made with<a href="https:\/\/tulala\.digital"[^>]*>Tulala\.digital</);
  assert.equal(html({ whitelabel: true }).includes("data-socket-credit"), false);
  assert.equal(html({ showCredit: false }).includes("data-socket-credit"), false);
  assert.ok(!html().includes("Hecho con Tulala"));
  assert.match(html(), /\.tulala-socket__credit\{margin-left:auto;text-align:right\}/);
});

test("the language group is dropped when the header already has a language switch, kept otherwise", () => {
  const two = { supportedLocales: ["es", "en"], switcherHrefs: { es: "/", en: "/en" } };
  assert.match(html(two), /data-socket-languages/);
  assert.equal(html({ ...two, headerHasLanguageSwitch: true }).includes("data-socket-languages"), false);
  assert.equal(html({ ...two, headerHasLanguageSwitch: true }).includes("Idioma"), false);
  const withSwitch = [{ kind: "section", props: { sectionProps: { regions: { left: [], center: [], right: [{ type: "cta" }, { type: "language" }] } } } }];
  const without = [{ kind: "section", props: { sectionProps: { regions: { right: [{ type: "cta" }] } } } }];
  assert.equal(headerShowsLanguageSwitch(withSwitch), true);
  assert.equal(headerShowsLanguageSwitch(without), false);
  assert.equal(headerShowsLanguageSwitch([]), false);
});

test("legal links: Spanish sites link /es/legal, English sites keep /legal", () => {
  assert.equal(localizedLegalUrl("https://tulala.digital/legal/terms", "es"), "https://tulala.digital/es/legal/terms");
  assert.equal(localizedLegalUrl("https://tulala.digital/legal/terms", "en"), "https://tulala.digital/legal/terms");
});
