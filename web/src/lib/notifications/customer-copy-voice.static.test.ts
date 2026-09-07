/**
 * GUARD — copy a BUSINESS tenant's customer receives must not speak
 * agency-world, and must not use em dashes.
 *
 * WHY: this platform began as a talent agency product, so its customer-facing
 * copy inherited agency vocabulary. A diner who books a table at a restaurant
 * and is told "the agency has prepared an offer" or "the talent you worked
 * with" is reading about a business that is not the one they contacted. Six
 * such strings were live in EN and ES on 2026-09-05.
 *
 * Em dashes are excluded separately: they are a house style choice, and they
 * render inconsistently across mail clients that fall back to a different font.
 *
 * SCOPE is deliberately the templateIds a customer audience can receive
 * (clientOrGuest, transactionPayer, refundedClient, reviewInvitee). Staff- and
 * talent-facing copy may say "roster" and "talent" freely — those readers ARE
 * the agency.
 *
 * PLACEHOLDERS ARE STRIPPED before checking: `{talent}` is a token that
 * interpolates to a person's name, so it is never read by anyone. Checking the
 * raw string flags it and produces a false positive; that mistake cost a pass
 * of this audit before the rule was written down.
 *
 * Run: npx tsx --test src/lib/notifications/customer-copy-voice.static.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** templateIds reachable by a customer audience. */
const CUSTOMER_TEMPLATE_IDS = new Set([
  "client.inquiry_received",
  "client.reply_ready",
  "client.offer_ready",
  "client.booking_confirmed",
  "client.booking_cancelled",
  "client.booking_day_of_reminder",
  "client.payment_receipt",
  "client.deposit_received",
  "client.payment_refunded",
  "client.partial_refund",
  "payment.invoice_issued.client",
  "inquiry.cancelled",
  "review.request_invite",
  "review.request_reminder",
]);

const AGENCY_WORDS = /\b(talent|talento|casting|roster|agency|agencia|elenco)\w*\b/i;
const PLACEHOLDER = /\{[^}]*\}/g;
const COPY_DIR = "src/lib/notifications/email-copy";

function copyBlocks(): Array<{ file: string; key: string; field: string; value: string }> {
  const out: Array<{ file: string; key: string; field: string; value: string }> = [];
  for (const file of readdirSync(COPY_DIR).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(COPY_DIR, file), "utf8");
    const keyRe = /"([a-z_.]+)":\s*\{/g;
    let km: RegExpExecArray | null;
    while ((km = keyRe.exec(src))) {
      if (!CUSTOMER_TEMPLATE_IDS.has(km[1])) continue;
      let depth = 1;
      let i = km.index + km[0].length;
      const start = i;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        i++;
      }
      const block = src.slice(start, i);
      const fieldRe = /(\w+):\s*\n?\s*"([^"]*)"/g;
      let fm: RegExpExecArray | null;
      while ((fm = fieldRe.exec(block))) {
        out.push({ file, key: km[1], field: fm[1], value: fm[2] });
      }
    }
  }
  return out;
}

test("customer-facing copy speaks no agency-world vocabulary", () => {
  const blocks = copyBlocks();
  assert.ok(blocks.length > 20, `expected to find customer copy, found ${blocks.length} strings`);

  const offenders = blocks
    .filter((b) => AGENCY_WORDS.test(b.value.replace(PLACEHOLDER, "")))
    .map((b) => `${b.file} ${b.key}.${b.field}: ${b.value}`);

  assert.deepEqual(
    offenders,
    [],
    `Copy a business tenant's customer receives must not say talent / casting / roster / agency.\n  ${offenders.join("\n  ")}\n\n` +
      `Rewrite it in the business's own voice ("we", "the person who took care of you"). ` +
      `Staff- and talent-facing copy is out of scope and may use these words.`,
  );
});

test("customer-facing copy uses no em dashes", () => {
  const offenders = copyBlocks()
    .filter((b) => b.value.includes("—"))
    .map((b) => `${b.file} ${b.key}.${b.field}: ${b.value}`);

  assert.deepEqual(
    offenders,
    [],
    `Em dashes are not house style in customer email.\n  ${offenders.join("\n  ")}`,
  );
});

test("the guard strips placeholders — {talent} is a token, not a word anyone reads", () => {
  // Pins the rule itself: a raw-string check would flag this and send someone
  // rewriting copy that reads correctly to every recipient.
  const rendered = "A {talent} le encantaría tu opinión".replace(PLACEHOLDER, "");
  assert.equal(AGENCY_WORDS.test(rendered), false);
  assert.equal(AGENCY_WORDS.test("El talento con quien trabajaste"), true);
});

/**
 * Customer-facing copy that lives OUTSIDE email-copy, as literal strings in
 * source. The guest acknowledgement is written into the visitor's own thread
 * the moment they submit, so it is the FIRST thing a customer reads from a
 * business — and it sat outside this guard entirely, which is how an em dash
 * survived the 2026-09-05 audit and was caught by a human reading the panel.
 */
const LITERAL_COPY_FILES = ["src/lib/inquiry/guest-auto-ack.ts"];

test("customer copy written as literal source strings obeys the same rules", () => {
  const offenders: string[] = [];
  for (const file of LITERAL_COPY_FILES) {
    const src = readFileSync(file, "utf8");
    src.split("\n").forEach((line, i) => {
      // Only the strings we actually send: assignments to `body`, which is the
      // acknowledgement text. Comments are checked too — an example carrying an
      // em dash is what the next edit copies.
      if (!/body\s*=|e\.g\./.test(line)) return;
      if (line.includes("—")) offenders.push(`${file}:${i + 1} em dash: ${line.trim()}`);
      if (AGENCY_WORDS.test(line.replace(PLACEHOLDER, "").replace(/\$\{[^}]*\}/g, "")))
        offenders.push(`${file}:${i + 1} agency word: ${line.trim()}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `Customer-facing copy in source must follow the same rules as email-copy.\n  ${offenders.join("\n  ")}`,
  );
});
