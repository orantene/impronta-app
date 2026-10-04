/**
 * AUD-040 / AUD-040b / AUD-041 — guest dock chip strip, composer, talent voice.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createTranslator } from "@/i18n/messages";
import type { InquiryReceiptData } from "@/lib/inquiry/guest-chat-contract";

import { bodySentence, resolveReceiptAgencyName } from "./InquiryReceiptCard";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(HERE, name), "utf8");
const WEB = join(HERE, "../../../../..");
const messages = (loc: string) =>
  JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8")) as {
    public: { guestChat: Record<string, string> };
  };

test("AUD-040: chip rail hides scrollbar, keeps scroll-snap, fades the right edge", () => {
  const css = read("guest-composer.module.css");
  assert.match(css, /\.offeringRail\s*\{[^}]*scrollbar-width:\s*none/);
  assert.match(css, /\.offeringRail::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  assert.match(css, /scroll-snap-type:\s*x/);
  assert.match(css, /mask-image:\s*linear-gradient\(to right/);
  assert.match(css, /\.offeringChip\s*\{[^}]*scroll-snap-align:\s*start/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  const picker = read("OfferingQuickPicker.tsx");
  assert.match(picker, /composerCss\.offeringRail/);
  assert.match(picker, /composerCss\.offeringChip/);
  assert.match(picker, /overflowX:\s*"auto"/);
  // White composer surface, not the grey sunken band.
  assert.match(picker, /background:\s*C\.surface,/);
  assert.doesNotMatch(picker, /background:\s*C\.surfaceFaint/);
});

test("AUD-040: chip names are the locale-resolved offering titles the services block shows", () => {
  const mount = read("TalentProfileChatLauncherMount.tsx");
  // Same loader + locale as the Max-site services_catalog (loadServicesCatalogSources).
  assert.match(mount, /loadPublicOfferingsForProfile\(talentProfileId, locale \?\? "en"\)/);
  assert.match(mount, /title: o\.title,/);
  const picker = read("OfferingQuickPicker.tsx");
  assert.match(picker, /\{o\.title\}/);
});

test("AUD-040b: send is neutral grey when empty, solid brand with text; 42px pill", () => {
  const composer = read("MiniChatComposer.tsx");
  assert.match(composer, /data-send-state=\{sendDisabled \? "disabled" : "ready"\}/);
  assert.match(composer, /background:\s*C\.surfaceCool/);
  assert.match(composer, /opacity:\s*1,/);
  assert.doesNotMatch(composer, /opacity:\s*sendDisabled/);
  assert.match(composer, /height:\s*42,\s*\n\s*width:\s*42/);
  assert.match(composer, /minHeight:\s*42/);
  assert.match(composer, /borderRadius:\s*21/);
  assert.match(composer, /composerCss\.composerInput/);
  const css = read("guest-composer.module.css");
  assert.match(css, /\.composerInput::placeholder\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis/);
});

test("AUD-040b: talent-site placeholder is short in EN and ES", () => {
  assert.equal(messages("es").public.guestChat.composerPhrase, "Escribe tu mensaje…");
  assert.equal(messages("en").public.guestChat.composerPhrase, "Type your message…");
});

test("AUD-041: 'lo está viendo' carries its accent", () => {
  const es = messages("es").public.guestChat;
  assert.equal(es.stripCoordinatorWorking, "{actor} lo está viendo");
  assert.equal(messages("en").public.guestChat.stripCoordinatorWorking, "{actor} is on it");
});

const receipt = (over: Partial<InquiryReceiptData> = {}): InquiryReceiptData =>
  ({
    receivedAt: null,
    owningPartyCount: 1,
    agencyName: "Tulala",
    coordinator: { displayName: "orantene+jorgbeauty" },
    contactEmail: "ana@example.com",
    typicalReplyLabel: null,
    ...over,
  }) as unknown as InquiryReceiptData;

test("AUD-041: talent site receipt names the talent, never the hub", () => {
  const t = createTranslator("es");
  const name = resolveReceiptAgencyName(receipt(), "Jorg Beauty", true);
  assert.equal(name, "Jorg Beauty");
  const line = bodySentence(receipt(), name, t, true);
  assert.equal(line, "Jorg Beauty te responderá a ana@example.com");
  assert.equal(/Tulala/.test(line), false);
  const en = bodySentence(receipt(), name, createTranslator("en"), true);
  assert.equal(en, "Jorg Beauty will reply to ana@example.com");
});

test("AUD-041: agency docks keep the receipt agency + coordinator", () => {
  const r = receipt({ agencyName: "Impronta", coordinator: { displayName: "Maya" } as never });
  const name = resolveReceiptAgencyName(r, "Impronta Talk", false);
  assert.equal(name, "Impronta");
  assert.equal(bodySentence(r, name, createTranslator("en"), false), "Maya will reply to ana@example.com");
  const body = read("GuestConversationBody.tsx");
  assert.match(body, /omitPlatformBrand=\{Boolean\(brand\.omitPlatformBrand\)\}/);
});
