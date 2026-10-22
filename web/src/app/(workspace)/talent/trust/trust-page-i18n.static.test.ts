// TUL-1815: the talent Trust signals page (Confianza) was English-only.
// Static guard: the page routes every user-facing string through _trust-copy.ts
// (en + es) and carries no hard-coded English JSX text.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { trustCopy } from "./_trust-copy";

const dir = join(process.cwd(), "src/app/(workspace)/talent/trust");
const page = readFileSync(join(dir, "page.tsx"), "utf8");

test("page reads the request locale and the copy table", () => {
  assert.match(page, /getRequestLocale\(\)/);
  assert.match(page, /trustCopy\(locale\)/);
});

test("page has no hard-coded English JSX text or label props", () => {
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // Text nodes between tags that contain letters and are not {expressions}.
  const textNodes = [...code.matchAll(/>([^<>{}]*[A-Za-z]{3,}[^<>{}]*)</g)]
    .map((m) => m[1].trim())
    .filter(Boolean)
    // generics / arrow fragments in TS code, not JSX text
    .filter((t) => !/[;=()]/.test(t));
  assert.deepEqual(textNodes, []);
  assert.doesNotMatch(code, /(aria-label|title|placeholder|alt)=["'][^"']*[A-Za-z]{3}/);
  for (const phrase of [
    "Trust signals",
    "Back to profile",
    "Self-serve",
    "Settings",
    "ID verified",
  ]) {
    assert.ok(!code.includes(phrase), `hard-coded English left in page: ${phrase}`);
  }
});

test("TUL-1819: shell-hosted, working CTAs only, no roadmap copy", () => {
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // Only ID verification is actionable; it links via next/link to Settings.
  assert.match(code, /kind: "id-verified", selfActionable: true/);
  assert.match(code, /kind: "background-check", selfActionable: false/);
  assert.match(code, /kind: "union", selfActionable: false/);
  assert.equal((code.match(/selfActionable: true/g) ?? []).length, 1);
  assert.match(code, /SETTINGS_HREF = "\/talent\/settings"/);
  assert.doesNotMatch(code, /<a\s+href=/);
  assert.doesNotMatch(code, /style=\{\{/);
  for (const loc of ["en", "es"]) {
    const c = trustCopy(loc);
    const all = JSON.stringify(c);
    assert.doesNotMatch(all, /sprint|rolling out|rollout|próximo sprint|Próximamente|Coming soon/i);
    assert.ok(!("rolloutBold" in c));
  }
  assert.doesNotMatch(trustCopy("es").touchpoints["background-check"].ctaLabel, /Solicitar/);
  assert.doesNotMatch(trustCopy("es").touchpoints.union.ctaLabel, /Subir/);
  // The shell hosts this page: the talent shell publishes it to the router body.
  const root = join(process.cwd(), "src/components/admin/shell");
  const canon = readFileSync(join(root, "canonical-routes.ts"), "utf8");
  assert.match(canon, /export function pathIsTalentShellHosted/);
  const client = readFileSync(join(root, "admin-shell-client.tsx"), "utf8");
  assert.match(client, /<TalentHostedRoute route=\{children\}>/);
  assert.match(client, /!pathIsTalentShellHosted\(pathname\)/);
  const talent = readFileSync(join(root, "internal/talent.tsx"), "utf8");
  assert.match(talent, /useCanonicalRouteChildren\(\)/);
});

test("page only uses copy keys that exist in both es and en", () => {
  const en = trustCopy("en") as unknown as Record<string, unknown>;
  const es = trustCopy("es-MX") as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  const used = new Set([...page.matchAll(/\bc\.([A-Za-z]+)/g)].map((m) => m[1]));
  assert.ok(used.size > 8);
  for (const k of used) {
    assert.ok(k in en, `en missing ${k}`);
    assert.ok(k in es, `es missing ${k}`);
  }
});

test("every touchpoint has es and en copy, es differs, no em dashes", () => {
  const en = trustCopy("en");
  const es = trustCopy("es");
  const kinds = Object.keys(en.touchpoints);
  assert.equal(kinds.length, 7);
  assert.deepEqual(Object.keys(es.touchpoints).sort(), kinds.sort());
  for (const k of kinds as (keyof typeof en.touchpoints)[]) {
    for (const f of ["label", "description", "ctaLabel"] as const) {
      assert.ok(es.touchpoints[k][f].length > 0, `${k}.${f} es empty`);
      assert.notEqual(es.touchpoints[k][f], en.touchpoints[k][f], `${k}.${f} es is English`);
      assert.ok(!es.touchpoints[k][f].includes("—") && !en.touchpoints[k][f].includes("—"));
    }
  }
  for (const [key, v] of Object.entries(es)) {
    if (typeof v === "string") assert.ok(!v.includes("—"), key);
  }
  assert.equal(es.title, "Señales de confianza");
  assert.equal(es.signalsEarned(2, 7), "2 de 7 señales obtenidas");
  assert.equal(en.signalsEarned(2, 7), "2 of 7 signals earned");
  assert.equal(trustCopy(undefined).title, "Trust signals");
});
