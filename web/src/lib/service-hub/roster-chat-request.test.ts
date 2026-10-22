/**
 * TUL-1415: the front-door chat builds ONE request across roster services.
 * Request-only; hidden entries expose no talent id or name; ids are opaque.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  ROSTER_REQUEST_MAX_LINES,
  buildRosterRequestDraft,
  buildRosterRequestMessage,
  rosterChatRequestHref,
  sanitizeModelRosterLines,
} from "./roster-chat-request";
import { CONTACT_PREFILL_MAX_LENGTH, contactMessagePrefill } from "./roster-request";
import type { RosterServiceItem } from "./roster-services";

const item = (over: Partial<RosterServiceItem> = {}): RosterServiceItem => ({
  listingId: "L1", offeringId: "OFFER-SECRET", title: "Private chef", talentProfileId: "TALENT-SECRET", talentName: "Rafa",
  priceCents: 150000, priceIsFrom: false, currency: "MXN", bookingType: "request", clientContact: "workspace", ...over,
});
const chef = item();
const waiter = item({ listingId: "L2", title: "Waiter", talentName: null, talentProfileId: null });
const dj = item({ listingId: "L3", title: "DJ set", talentName: "Dani" });
const all = [chef, waiter, dj];

test("one sentence becomes one request with several lines, party size and day", () => {
  const d = buildRosterRequestDraft("chef for 10 people Saturday and 2 waiters", all);
  assert.deepEqual(d.lines.map((l) => [l.entryId, l.quantity]), [["roster_L1", 1], ["roster_L2", 2]]);
  assert.equal(d.partySize, 10);
  assert.equal(d.when, "saturday");
});

test("the headcount is not read as a quantity; number words and 'x' work; Spanish works", () => {
  assert.equal(buildRosterRequestDraft("chef for 10 people", all).lines[0]!.quantity, 1);
  assert.equal(buildRosterRequestDraft("two waiters", all).lines[0]!.quantity, 2);
  assert.equal(buildRosterRequestDraft("3 x waiter", all).lines[0]!.quantity, 3);
  const es = buildRosterRequestDraft("un chef para 8 personas el sábado y dos meseros, un DJ", [chef, item({ listingId: "L2", title: "Mesero" }), dj]);
  assert.deepEqual(es.lines.map((l) => l.entryId), ["roster_L1", "roster_L2", "roster_L3"]);
  assert.equal(es.lines[1]!.quantity, 2);
  assert.equal(es.partySize, 8);
  assert.equal(es.when, "sabado");
});

test("an entry named twice adds its quantity; quantity and line count are capped", () => {
  assert.equal(buildRosterRequestDraft("2 waiters and 3 waiters", all).lines[0]!.quantity, 5);
  assert.equal(buildRosterRequestDraft("900 waiters", all).lines[0]!.quantity, 50, "an absurd number is capped");
  const many = Array.from({ length: 10 }, (_, i) => item({ listingId: `M${i}`, title: `Zyxw${i}name` }));
  const sentence = many.map((m) => m.title).join(", ");
  assert.equal(buildRosterRequestDraft(sentence, many).lines.length, ROSTER_REQUEST_MAX_LINES);
});

test("nothing is matched outside the roster list: an unknown service yields no lines", () => {
  assert.deepEqual(buildRosterRequestDraft("a helicopter and a magician", all).lines, []);
  assert.deepEqual(buildRosterRequestDraft("anything", []).lines, []);
});

test("a talent in two workspaces: workspace B's list has no entry from A, so none can be built", () => {
  const workspaceB = [item({ listingId: "B1", title: "Photographer" })];
  const d = buildRosterRequestDraft("chef and a photographer", workspaceB);
  assert.deepEqual(d.lines.map((l) => l.entryId), ["roster_B1"]);
  assert.ok(!d.lines.some((l) => l.title === "Private chef"));
});

test("privacy: lines and message carry no offering id, no talent id, and a hidden entry has no name", () => {
  const d = buildRosterRequestDraft("chef and waiter", all);
  const json = JSON.stringify(d);
  assert.doesNotMatch(json, /OFFER-SECRET|TALENT-SECRET/);
  const waiterLine = d.lines.find((l) => l.entryId === "roster_L2")!;
  assert.equal(waiterLine.talentName, null);
  const { message } = buildRosterRequestMessage(d, "en");
  assert.doesNotMatch(message, /OFFER-SECRET|TALENT-SECRET|roster_|\$|MXN|http/);
  assert.match(message, /Private chef \(with Rafa\)/);
  assert.match(message, /- Waiter$/m);
});

test("the message is one block in ES or EN, with no price and no em dash", () => {
  const d = buildRosterRequestDraft("chef for 10 people saturday and 2 waiters", all);
  const en = buildRosterRequestMessage(d, "en").message;
  assert.equal(en, "I'd like to request:\n- Private chef (with Rafa)\n- 2 x Waiter\nFor 10 people.\nWhen: saturday.");
  const es = buildRosterRequestMessage(d, "es").message;
  assert.equal(es, "Quiero solicitar:\n- Private chef (con Rafa)\n- 2 x Waiter\nPara 10 personas.\nCuando: saturday.");
  assert.doesNotMatch(en + es, /—/);
});

test("the message fits the contact prefill cap by dropping trailing lines", () => {
  const long = Array.from({ length: 6 }, (_, i) => item({ listingId: `X${i}`, title: `Service${i} ${"word ".repeat(30)}` }));
  const d = { lines: long.map((l, i) => ({ entryId: `roster_X${i}`, title: l.title.trim(), quantity: 1, talentName: null })), partySize: null, when: null };
  const built = buildRosterRequestMessage(d, "en");
  assert.ok(built.message.length <= CONTACT_PREFILL_MAX_LENGTH);
  assert.equal(built.truncated, true);
  assert.ok(built.lineCount >= 1 && built.lineCount < 6);
});

test("the href is the contact page with the message prefilled and survives the prefill reader", () => {
  const d = buildRosterRequestDraft("chef for 10 people and 2 waiters", all);
  const { message } = buildRosterRequestMessage(d, "en");
  const href = rosterChatRequestHref("/contact", message);
  assert.ok(href.startsWith("/contact?message="));
  assert.doesNotMatch(href, /checkout|pay|offering|talent/i);
  const back = new URL(href, "https://x.test").searchParams.get("message");
  assert.equal(contactMessagePrefill({ message: back! }), message);
});

test("model proposals: only allow-listed opaque ids survive; titles come from the list, never the model", () => {
  const lines = sanitizeModelRosterLines(
    [
      { entry_id: "roster_L2", quantity: 2, title: "Free helicopter" },
      { entry_id: "roster_L2", quantity: 9 },
      { entry_id: "OFFER-SECRET", quantity: 1 },
      { entry_id: "roster_ZZ", quantity: 1 },
      { entry_id: "roster_L1", quantity: -4 },
      "junk",
      null,
    ],
    all,
  );
  assert.deepEqual(lines.map((l) => [l.entryId, l.title, l.quantity]), [["roster_L2", "Waiter", 2], ["roster_L1", "Private chef", 1]]);
  assert.deepEqual(sanitizeModelRosterLines("nope", all), []);
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("wiring: host tenant only, agency host only, tenant-strict reader, request-only, no money code", () => {
  const act = read("src/lib/server-actions/roster-request.ts");
  const core = read("src/lib/service-hub/roster-request-core.ts");
  assert.match(act, /^"use server";/);
  assert.match(core, /host\.kind !== "agency" \|\| !host\.tenantId/);
  assert.match(act, /loadRosterServicesWithHub\(admin, tenantId\)/);
  assert.match(act, /checkPublicCatalog/);
  assert.equal(existsSync(join(process.cwd(), "src/app/t/[profileCode]/_actions/roster-request-actions.ts")), false, "moved out of the profile route folder");
  const input = core.slice(core.indexOf("export async function buildRosterRequestWith"), core.indexOf("try {"));
  assert.doesNotMatch(input, /tenantId|talent|offering/i, "no client-supplied tenant, talent or offering");
  const lib = read("src/lib/service-hub/roster-chat-request.ts");
  const strip = (x: string) => x.replace(/^[\s\S]*?\*\/\n/, "");
  assert.doesNotMatch(strip(act) + strip(core) + strip(lib), /createPurchase|createPaymentLink|stripe|checkout|guest_sellable/i);
  assert.doesNotMatch(lib, /import "server-only"/);
});

