/**
 * TUL-889: the slim Tulala legal strip on every public site, never in admin.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { TulalaLegalStrip } from "@/components/talent-site/tulala-legal-strip";
import { ProfileFooterSocket } from "@/app/t/[profileCode]/_shared/ProfileFooterSocket";
import { buildLegalStripModel } from "./legal-strip";

const ORIGIN = "https://tulala.digital";
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const hrefOf = (html: string, key: string) =>
  html.match(new RegExp(`data-legal-link="${key}" href="([^"]*)"`))?.[1]?.replace(/&amp;/g, "&");

test("talent site strip, Spanish: labels and existing routes", () => {
  const html = renderToStaticMarkup(
    <TulalaLegalStrip locale="es" marketingOrigin={ORIGIN} profileCode="TAL-1" siteHost="alba.tulala.digital" />,
  );
  for (const label of ["Hecho con Tulala", "Privacidad", "Términos", "Cookies", "Reportar"]) assert.ok(html.includes(label), label);
  assert.equal(hrefOf(html, "credit"), ORIGIN);
  assert.equal(hrefOf(html, "privacy"), `${ORIGIN}/es/legal/privacy`);
  assert.equal(hrefOf(html, "terms"), `${ORIGIN}/es/legal/terms`);
  assert.equal(hrefOf(html, "cookies"), `${ORIGIN}/es/legal/cookies`);
  assert.equal(hrefOf(html, "report"), `${ORIGIN}/es/contact?source=report&host=alba.tulala.digital&code=TAL-1`);
  assert.equal(count(html, /data-tulala-legal-strip/g), 1);
});

test("talent site strip, English labels and /legal routes", () => {
  const html = renderToStaticMarkup(<TulalaLegalStrip locale="en" marketingOrigin={ORIGIN} />);
  for (const label of ["Made with Tulala", "Privacy", "Terms", "Cookies", "Report"]) assert.ok(html.includes(label), label);
  assert.equal(hrefOf(html, "privacy"), `${ORIGIN}/legal/privacy`);
  assert.equal(hrefOf(html, "report"), `${ORIGIN}/contact?source=report`);
  assert.equal(html.includes("Hecho con"), false);
});

test("marketing origin follows the env-correct origin", () => {
  const m = buildLegalStripModel({ locale: "en", marketingOrigin: "https://staging.tulala.digital/" });
  assert.equal(m.credit.href, "https://staging.tulala.digital");
  for (const l of m.links) assert.ok(l.href.startsWith("https://staging.tulala.digital/"), l.href);
  assert.equal(buildLegalStripModel({ locale: "en", marketingOrigin: "garbage" }).credit.href, ORIGIN);
});

test("strip is muted, token-styled, 44px targets, no hex, not hideable", () => {
  const html = renderToStaticMarkup(<TulalaLegalStrip locale="es" marketingOrigin={ORIGIN} />);
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(html.replace(/href="[^"]*"/g, "")), false);
  assert.match(html, /min-height:44px/);
  assert.match(html, /font-size:12\.5px/);
  const src = readFileSync(join(process.cwd(), "src/lib/talent-site/legal-strip.ts"), "utf8");
  assert.equal(/whitelabel|showCredit|plan/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), false);
});

test("languages render only with 2+ entries", () => {
  const two = [
    { locale: "es", label: "Español", href: "/", current: true },
    { locale: "en", label: "English", href: "/en", current: false },
  ];
  assert.equal(buildLegalStripModel({ locale: "es", languages: two }).languages.length, 2);
  assert.equal(buildLegalStripModel({ locale: "es", languages: [two[0]!] }).languages.length, 0);
});

test("hub profile /t/<code>: one strip, Spanish labels, even when whitelabel", () => {
  const tokens = { surface: "var(--pp-bg)", ink: "var(--pp-ink)", line: "var(--pp-line)" };
  const html = renderToStaticMarkup(
    <ProfileFooterSocket locale="es" whitelabel tokens={tokens} profileCode="TAL-9" />,
  );
  assert.equal(count(html, /data-tulala-legal-strip/g), 1);
  assert.ok(html.includes("Hecho con Tulala"));
  assert.ok(html.includes("Reportar"));
  assert.match(html, /code=TAL-9/);
  assert.equal(count(html, /data-tulala-socket/g), 0, "no old socket band (no double footer)");
});

test("published talent site and builder canvas mount the strip, not the old socket", () => {
  const root = join(process.cwd(), "src/lib/talent-site/server");
  for (const f of ["render-max-site-document.tsx", "talent-builder-canvas.server.tsx"]) {
    const src = readFileSync(join(root, f), "utf8");
    assert.equal(count(src, /<TulalaLegalStrip\b/g), 1, f);
    assert.equal(src.includes("<TalentSiteSocket"), false, f);
  }
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

test("admin workspaces never mount the strip", () => {
  const roots = ["src/app/(workspace)", "src/app/admin", "src/components/admin"].map((r) => join(process.cwd(), r));
  for (const r of roots) {
    for (const f of walk(r)) {
      const src = readFileSync(f, "utf8");
      assert.equal(/TulalaLegalStrip|ProfileFooterSocket/.test(src), false, f);
    }
  }
});

test("talent policy links lead the strip when the talent has them, absent otherwise", () => {
  const siteLinks = [
    { key: "booking-policy", href: "/politicas" },
    { key: "privacy", href: "/privacidad" },
  ];
  const es = renderToStaticMarkup(
    <TulalaLegalStrip locale="es" marketingOrigin={ORIGIN} talentLinks={siteLinks} />,
  );
  assert.ok(es.includes("Políticas de reserva"));
  assert.equal(hrefOf(es, "booking-policy"), "/politicas");
  assert.equal(hrefOf(es, "talent-privacy"), "/privacidad");
  const order = ["credit", "booking-policy", "talent-privacy", "privacy", "terms", "cookies", "report"].map((k) =>
    es.indexOf(`data-legal-link="${k}"`),
  );
  assert.deepEqual([...order].sort((a, b) => a - b), order, "talent links before Tulala's");
  assert.ok(order.every((i) => i >= 0));
  const en = buildLegalStripModel({ locale: "en", talentLinks: siteLinks });
  assert.equal(en.links[0]!.label, "Booking policies");
  assert.deepEqual(en.links.slice(0, 2).map((l) => l.key), ["booking-policy", "talent-privacy"]);
  const none = renderToStaticMarkup(<TulalaLegalStrip locale="es" marketingOrigin={ORIGIN} />);
  assert.equal(none.includes("Políticas de reserva"), false);
  assert.equal(none.includes('data-legal-link="booking-policy"'), false);
  assert.equal(buildLegalStripModel({ locale: "es", talentLinks: [{ key: "booking-policy", href: " " }] }).links.length, 4);
});
