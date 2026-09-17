import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * `/ticket/<code>` is a TENANT page: it paints the venue's tokens, never the
 * dashboard's `admin-*` palette, and every control on it does something.
 * Pinned statically because a dead `href="#"` and a stray `bg-admin-brand`
 * both render fine and fail only in front of a guest.
 */
const DIR = join(process.cwd(), "src/app/(public)/ticket/[code]");
const client = readFileSync(join(DIR, "ticket-client.tsx"), "utf8");
const page = readFileSync(join(DIR, "page.tsx"), "utf8");

test("the ticket page uses no admin-* colour class", () => {
  for (const [name, src] of [["ticket-client.tsx", client], ["page.tsx", page]] as const) {
    const hits = src.match(/\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline)-admin-[\w-]+/g) ?? [];
    assert.deepEqual(hits, [], `${name} paints the dashboard palette: ${hits.join(", ")}`);
  }
  assert.match(client, /--token-color-ink/, "ink is the venue's token");
  assert.match(client, /--token-color-primary/, "the primary action is the venue's token");
  assert.match(client, /--site-heading-font/, "headings use the venue's heading font");
});

test("no dead CTAs: every href is real and every button has a handler", () => {
  assert.doesNotMatch(client, /href=["']#["']/, "no href=\"#\"");
  assert.doesNotMatch(client, /href=\{?["']javascript:/, "no javascript: hrefs");
  // Every <button> carries an onClick (or is a submit inside a form, which this page has none of).
  const buttons = client.match(/<button\b[^>]*>/g) ?? [];
  assert.ok(buttons.length >= 5, "the action row renders buttons");
  for (const b of buttons) assert.match(b, /onClick=/, `a button without a handler: ${b.slice(0, 80)}`);
  // Save image is the hosted PNG the e-mail embeds; Share falls back to WhatsApp.
  assert.match(page, /\/api\/tickets\/\$\{encodeURIComponent\(ticket\.code\)\}\/qr`/, "the hosted QR route (no static extension, 58f9c27d9)");
  assert.match(client, /href=\{m\.qrPngHref\}[^>]*download=/);
  assert.match(client, /whatsappHref/);
  assert.match(client, /navigator\.share/);
  assert.match(client, /window\.print\(\)/);
  assert.match(client, /navigator\.clipboard\.writeText/);
});

test("no wallet passes are offered", () => {
  // The header comment names them as excluded; the code must not.
  const code = (client + page).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /wallet|passkit|\.pkpass/i);
});

test("the journey's hooks survive the rebuild", () => {
  for (const id of ["ticket-transfer", "ticket-resend", "ticket-lookup"]) {
    assert.match(client, new RegExp(`data-testid="${id}"`), `${id} stays`);
  }
  assert.match(client, /data-ticket-qr=""/);
  // The E08 board's hooks (main 4e3430403 / c1ecc2f6b) survive the redesign.
  assert.match(client, /data-ticket-page/);
  assert.match(client, /data-ticket-state=\{m\.status\}/, "the state attribute carries the admission's own status word");
  assert.match(page, /if \(!facts\) notFound\(\);/, "a failed facts read refuses the page");
  assert.match(client, /role="alert"/);
  assert.match(client, /role="status"/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
});

test("refunds: the button renders only when open, every refusal reason has a sentence", () => {
  assert.match(client, /m\.refundOpen \?/, "the button is conditional on the switch");
  assert.match(client, /ticketRefundRequest\(\{ code: m\.code \}\)/);
  for (const reason of ["refunds_closed", "already_used", "not_valid", "event_cancelled", "nothing_to_refund", "already_requested"]) {
    assert.match(page, new RegExp(`dashboard\\.visit\\.ticket\\.refundReason\\.${reason}`), `${reason} has copy`);
  }
  // Every sentence the page names exists in en and es.
  const en = JSON.parse(readFileSync(join(process.cwd(), "messages/en.json"), "utf8"));
  const es = JSON.parse(readFileSync(join(process.cwd(), "messages/es.json"), "utf8"));
  const keys = [...page.matchAll(/tr\("(dashboard\.visit\.ticket\.[\w.]+)"\)/g)].map((m) => m[1]);
  assert.ok(keys.length > 30, "the page reads its copy through tr()");
  const resolve = (cat: Record<string, unknown>, key: string) => key.split(".").reduce<unknown>((n, k) => (n && typeof n === "object" ? (n as Record<string, unknown>)[k] : undefined), cat);
  for (const k of keys) {
    assert.equal(typeof resolve(en, k), "string", `${k} in en`);
    assert.equal(typeof resolve(es, k), "string", `${k} in es`);
  }
});
