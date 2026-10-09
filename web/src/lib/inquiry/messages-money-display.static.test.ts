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
  // TUL-281 follow-up: the messages-v5 module (view-models carry currencyCode).
  "src/components/messages-v5",
  "src/lib/messages-v5",
];

/** Rules marked `v5` only apply under these two folders. */
const V5_SCOPES = ["src/components/messages-v5/", "src/lib/messages-v5/"];

type Rule = { id: string; re: RegExp; why: string; v5?: boolean };

const RULES: Rule[] = [
  { id: "usd-only-helper", re: /\bformatCentsUSD\b|\bformatEurCents\b/, why: "USD/EUR-only helper" },
  { id: "order-money-helper", re: /\bformatOrderMoney\b/, why: "formatOrderMoney renders '850.00 MXN'; use formatRecordMoney(cents, record currency)", v5: true },
  { id: "commission-formatter", re: /from\s+["']@\/lib\/bookings\/commission["']/, why: "bookings/commission formatters are USD-first; use formatRecordMoney", v5: true },
  { id: "usd-fallback", re: /\?\?\s*["']USD["']/, why: "literal USD fallback; use PLATFORM_FALLBACK_CURRENCY (offer-currency.ts)", v5: true },
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
export function scanSource(src: string, v5 = false): [string, number][] {
  const hits: [string, number][] = [];
  src.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (/^\s*(\*|\/\*)/.test(line)) return; // doc comments may quote the banned forms
    for (const r of RULES) if ((!r.v5 || v5) && r.re.test(code)) hits.push([r.id, i + 1]);
  });
  return hits;
}

const files = SCOPES.flatMap((s) => walk(join(WEB_ROOT, s)));
const rel = (f: string) => relative(WEB_ROOT, f);
const isV5 = (f: string) => V5_SCOPES.some((d) => rel(f).startsWith(d));

describe("messages sheets: money goes through the shared formatter", () => {
  it("scans a real amount of code (floor, so it cannot pass vacuously)", () => {
    assert.ok(files.length >= 160, `only ${files.length} files scanned`);
    assert.ok(files.filter(isV5).length >= 100, "messages-v5 folders were not scanned");
    assert.ok(files.some((f) => f.endsWith("ItemsPicker.tsx")) && files.some((f) => f.endsWith("context-view.ts")));
    const v5Money = files.filter((f) => isV5(f) && /formatRecordMoney/.test(readFileSync(f, "utf8")));
    assert.ok(v5Money.length >= 9, `only ${v5Money.length} messages-v5 files use formatRecordMoney`);
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
      "order-money-helper": "const a = formatOrderMoney(x, c);",
      "commission-formatter": 'import { formatCents } from "@/lib/bookings/commission";',
      "usd-fallback": 'const c = p.currency ?? "USD";',
    };
    for (const r of RULES) {
      const hits = scanSource(bad[r.id] ?? "", true).map((h) => h[0]);
      assert.ok(hits.includes(r.id), `rule ${r.id} did not flag: ${bad[r.id]}`);
      if (r.v5) assert.ok(!scanSource(bad[r.id] ?? "", false).some((h) => h[0] === r.id), `v5-only rule ${r.id} leaked outside messages-v5`);
    }
    assert.deepEqual(scanSource("const s = formatOfferMoney(n, offer.currencyCode);\nconst d = x ?? \"USD\";"), []);
    assert.deepEqual(scanSource("const s = formatRecordMoney(n, offer.currencyCode ?? PLATFORM_FALLBACK_CURRENCY);", true), []);
    assert.deepEqual(scanSource(" * a $5,000 offer, never `$${n}`"), []);
  });

  it("no banned form outside the allow-list", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const [rule, line] of scanSource(src, isV5(f))) {
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
      assert.ok(scanSource(src, V5_SCOPES.some((d) => a.file.startsWith(d))).some(([r]) => r === a.rule), `${a.file} no longer trips ${a.rule}; drop the entry`);
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
    // OfferDraftLineItem owns the picker row; editor passes the offer currency through.
    const m11 = readFileSync(join(WEB_ROOT, "src/components/admin/shell/internal/messages/shared/machinery-11.tsx"), "utf8");
    const line = readFileSync(join(WEB_ROOT, "src/components/admin/shell/internal/messages/shared/offer-draft-line-item.tsx"), "utf8");
    assert.match(m11, /currencyCode=\{snapshot\.currencyCode\}/);
    assert.match(line, /currency=\{currencyCode\}/);
  });

  it("messages-v5: one chain, the view-models carry currencyCode, no USD-only helper is left", () => {
    const read = (f: string) => readFileSync(join(WEB_ROOT, f), "utf8");
    assert.match(read("src/lib/messages-v5/record-money.ts"), /export function formatRecordMoney[\s\S]{0,400}formatOfferMoney\(/);
    // Loaders: the offer row, the cancel preview and the refundable transaction carry the record's currency.
    const sheets = read("src/lib/messaging/sheets.ts");
    assert.match(sheets, /currencyCode: string;/);
    assert.match(sheets, /deposit_amount_cents, currency_code"\)/);
    assert.match(read("src/lib/messaging/money.ts"), /from\("orders"\)\.select\("currency"\)\.eq\("id", resolved\.orderId\)/);
    assert.match(read("src/lib/messages-v5/confirm-view.ts"), /currencyCode: offer\.currencyCode/);
    // Sheets: required currency prop, wired from the record (offer / cancel preview / refundable transaction).
    assert.match(read("src/components/messages-v5/screens/sheets/PaymentRequest.view.tsx"), /readonly currencyCode: string;/);
    assert.match(read("src/components/messages-v5/screens/sheets/PaymentRequest.tsx"), /currencyCode=\{recordCurrency\(offer\?\.currencyCode\)\}/);
    assert.match(read("src/components/messages-v5/screens/sheets/CancelRefund.view.tsx"), /readonly currencyCode: string;/);
    assert.match(read("src/components/messages-v5/screens/sheets/CancelRefund.tsx"), /recordCurrency\(mode === "cancel" \? previewOk\?\.currency : refundCurrency\)/);
    assert.match(read("src/components/messages-v5/screens/sheets/ItemsPicker.tsx"), /formatRecordMoney\(cents, currency \?\? totalCurrency\)/);
    assert.match(read("src/lib/messages-v5/context-view.ts"), /readonly currencyCode: string;/);
    // The unused USD-only fixtures helper is gone.
    assert.doesNotMatch(read("src/components/admin/shell/internal/state/fixtures.ts"), /export function fmtMoney/);
  });
});
