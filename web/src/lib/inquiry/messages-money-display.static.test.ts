/**
 * TUL-281: every money display in the messages sheets goes through the ONE
 * shared formatter with the record's currency. This bans the USD-only /
 * hand-built forms in those folders, outside a tiny explicit allow-list.
 * Run: node --require ./scripts/register-server-only-test.cjs --import tsx --test src/lib/inquiry/messages-money-display.static.test.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

const SCOPES = [
  "src/components/admin/shell/internal/messages",
  "src/components/admin/offer",
  "src/app/(workspace)/[tenantSlug]/client/messages",
  "src/app/(workspace)/[tenantSlug]/talent/inbox",
];

type Rule = { id: string; re: RegExp; why: string };

const RULES: Rule[] = [
  { id: "usd-only-helper", re: /\bformatCentsUSD\b|\bformatEurCents\b/, why: "USD/EUR-only helper" },
  { id: "usd-literal", re: /[cC]urrency(?:Code)?\s*:\s*["']USD["']/, why: 'currency: "USD" literal' },
  { id: "bare-dollar-template", re: /\$\$\{/, why: "hand-built '$' + amount template" },
  { id: "intl-currency", re: /style\s*:\s*["']currency["']/, why: "inline Intl currency formatter" },
  { id: "symbol-glue", re: /\$\{\s*(?:currency|cur|sym|symbol)\s*\}\s*\$\{/, why: "currency symbol glued to an amount" },
  { id: "symbol-ternary", re: /===\s*["'](?:USD|EUR|GBP)["']\s*\?\s*["'][$€£]["']/, why: "hard-coded symbol ternary" },
  { id: "symbol-sniff", re: /\.match\(\s*\/\[[^\]]*[€£$][^\]]*\]\/\s*\)/, why: "currency sniffed from a formatted string" },
  { id: "locale-then-code", re: /toLocaleString\(\)\}?\s*\}?\s*\$\{[^}]*[cC]urrency/, why: "amount.toLocaleString() + currency code" },
];

/** Reviewed exceptions. `needle` must still appear in the file, so a stale entry fails. */
const ALLOW: { file: string; rule: string; needle: string; reason: string }[] = [
  {
    file: "src/components/admin/shell/internal/messages/shared/machinery-8.tsx",
    rule: "usd-literal",
    needle: 'budgetCurrency: "USD"',
    reason: "default of the NEW-inquiry form's currency picker (an input the user changes), not a displayed amount",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|static\.test|render\.test)\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Violations in one source text: `[ruleId, 1-based line]`. */
export function scanSource(src: string): [string, number][] {
  const hits: [string, number][] = [];
  src.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (/^\s*(\*|\/\*)/.test(line)) return; // doc comments may quote the banned forms
    for (const r of RULES) if (r.re.test(code)) hits.push([r.id, i + 1]);
  });
  return hits;
}

const files = SCOPES.flatMap((s) => walk(join(WEB_ROOT, s)));
const rel = (f: string) => relative(WEB_ROOT, f);

describe("messages sheets: money goes through the shared formatter", () => {
  it("scans a real amount of code (floor, so it cannot pass vacuously)", () => {
    assert.ok(files.length >= 50, `only ${files.length} files scanned`);
    assert.ok(files.some((f) => f.endsWith("machinery-10.tsx")));
    assert.ok(files.some((f) => f.endsWith("OfferTab.tsx")));
    assert.ok(files.some((f) => f.endsWith("offer-money-split.tsx")));
    const withMoney = files.filter((f) => /formatOfferMoney|fmtMoney/.test(readFileSync(f, "utf8")));
    assert.ok(withMoney.length >= 12, `only ${withMoney.length} files format money through the shared helpers`);
  });

  it("SELF-TEST: the scanner flags every banned form and passes clean code", () => {
    const bad: Record<string, string> = {
      "usd-only-helper": "const a = formatCentsUSD(x);",
      "usd-literal": 'const o = { currency: "USD", amount: 5 };',
      "bare-dollar-template": "const s = `$${n}`;",
      "intl-currency": 'new Intl.NumberFormat("en-US", { style: "currency", currency });',
      "symbol-glue": "const s = `${currency}${n}`;",
      "symbol-ternary": 'const g = currency === "USD" ? "$" : "£";',
      "symbol-sniff": 'const c = rate.match(/[€£$]/)?.[0];',
      "locale-then-code": "const s = `${n.toLocaleString()} ${it.currency}`;",
    };
    for (const r of RULES) {
      const hits = scanSource(bad[r.id] ?? "").map((h) => h[0]);
      assert.ok(hits.includes(r.id), `rule ${r.id} did not flag: ${bad[r.id]}`);
    }
    assert.deepEqual(scanSource("const s = formatOfferMoney(n, offer.currencyCode);\nconst d = x ?? \"USD\";"), []);
    assert.deepEqual(scanSource(" * a $5,000 offer, never `$${n}`"), []);
  });

  it("no banned form outside the allow-list", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const [rule, line] of scanSource(src)) {
        const allowed = ALLOW.some((a) => a.file === rel(f) && a.rule === rule && src.includes(a.needle));
        if (!allowed) {
          bad.push(`${rel(f)}:${line} ${rule} (${RULES.find((r) => r.id === rule)?.why})`);
        }
      }
    }
    assert.deepEqual(
      bad,
      [],
      "Route amounts through formatOfferMoney / fmtMoney with the record's currency (src/lib/inquiry/offer-currency.ts):\n" +
        bad.join("\n"),
    );
  });

  it("every allow-list entry is still needed", () => {
    assert.ok(ALLOW.length <= 3, "the allow-list is meant to stay tiny");
    for (const a of ALLOW) {
      const src = readFileSync(join(WEB_ROOT, a.file), "utf8");
      assert.ok(src.includes(a.needle), `stale allow-list entry: ${a.file} ${a.needle}`);
      assert.ok(scanSource(src).some(([r]) => r === a.rule), `${a.file} no longer trips ${a.rule}; drop the entry`);
      assert.ok(a.reason.length > 20);
    }
  });

  it("there is ONE formatter chain: fmtMoney -> formatOfferMoney -> formatDashboardMoney", () => {
    const m10 = readFileSync(join(WEB_ROOT, "src/components/admin/shell/internal/messages/shared/machinery-10.tsx"), "utf8");
    assert.match(m10, /export function fmtMoney[\s\S]{0,200}formatOfferMoney\(n, currency/);
    const m6 = readFileSync(join(WEB_ROOT, "src/components/admin/shell/internal/messages/shared/machinery-6.tsx"), "utf8");
    assert.match(m6, /export function formatCents[\s\S]{0,200}formatOfferMoney\(cents \/ 100, currency/);
    const lib = readFileSync(join(WEB_ROOT, "src/lib/inquiry/offer-currency.ts"), "utf8");
    assert.match(lib, /export function formatOfferMoney[\s\S]{0,700}formatDashboardMoney\(/);
  });

  it("line-service-picker prices in the service's currency and templates inherit the offer's", () => {
    const picker = readFileSync(join(WEB_ROOT, "src/components/admin/shell/internal/messages/shared/line-service-picker.tsx"), "utf8");
    assert.doesNotMatch(picker, /"USD"/);
    assert.match(picker, /formatOfferMoney\(it\.amountCents \/ 100, it\.currency\)/);
    assert.match(picker, /buildDefaultRateTemplates\(currency\)/);
    const m11 = readFileSync(join(WEB_ROOT, "src/components/admin/shell/internal/messages/shared/machinery-11.tsx"), "utf8");
    assert.match(m11, /currency=\{snapshot\.currencyCode\}/);
  });
});
