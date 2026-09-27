/**
 * hablar-mockup-parity.static.test.ts — front-door brief DoR wiring for the
 * guest Hablar dock (Jorg Beauty / OFERTA). Checked against the files.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(HERE, name), "utf8");

test("panel wires journey chrome (header + progress + nav)", () => {
  const col = read("MiniChatPanelColumn.tsx");
  assert.match(col, /useGuestDockJourney/);
  assert.match(col, /GuestDockChrome/);
  assert.match(col, /journeyLabel=\{journeyLabel\}/);
  const journey = read("use-guest-dock-journey.ts");
  assert.match(journey, /resolveGuestJourneyChrome/);
  const chrome = read("GuestDockChrome.tsx");
  const headerIdx = chrome.indexOf("<GuestPanelHeader");
  const progressIdx = chrome.indexOf("<GuestJourneyProgress");
  const navIdx = chrome.indexOf("<GuestDockNav");
  assert.ok(headerIdx > 0 && progressIdx > headerIdx && navIdx > progressIdx);
});

test("header paints OFERTA journey status and hides new-request chrome", () => {
  const header = read("GuestPanelHeader.tsx");
  assert.match(header, /journeyLabel/);
  assert.match(header, /data-guest-journey-status/);
  assert.match(header, /textTransform:\s*"uppercase"/);
  assert.match(header, /!journeyMode && onOpenDetails/);
});

test("dock nav active tab is accent outline, not white fill", () => {
  const nav = read("GuestDockNav.tsx");
  assert.match(nav, /inset 0 0 0 1\.5px/);
  assert.doesNotMatch(nav, /background:\s*isActive\s*\?\s*"#fff"/);
});

test("composer send is circular; talent sites use composerPhrase", () => {
  const composer = read("MiniChatComposer.tsx");
  assert.match(composer, /borderRadius:\s*"50%"/);
  const col = read("MiniChatPanelColumn.tsx");
  assert.match(col, /composerPhrase/);
});

test("dev offer preview mounts GuestHablarOfferPreview for OFERTA visual proof", () => {
  const col = read("MiniChatPanelColumn.tsx");
  assert.match(col, /useGuestDockJourney/);
  assert.match(col, /GuestHablarOfferPreview/);
  const journey = read("use-guest-dock-journey.ts");
  assert.match(journey, /useHablarOfferPreview/);
  assert.match(journey, /headerJourneyOffer/);
  const preview = read("GuestHablarOfferPreview.tsx");
  assert.match(preview, /hablar_preview/);
  assert.match(preview, /ClientOfferCard/);
  assert.match(preview, /NODE_ENV/);
});

test("guest bubbles use lavender palette token, not accent fill", () => {
  const bubble = read("MiniChatMessageBubble.tsx");
  assert.match(bubble, /C\.guestBubble/);
  assert.doesNotMatch(bubble, /mine \? accent :/);
  const styles = read("mini-chat-styles.ts");
  assert.match(styles, /guestBubble:\s*"#f8eef1"/);
});

test("beauty intake has four brief segs including service + message", () => {
  const rail = read("guest-intake-rail.ts");
  assert.match(rail, /beauty:\s*\["day",\s*"hour",\s*"service",\s*"message"\]/);
});
