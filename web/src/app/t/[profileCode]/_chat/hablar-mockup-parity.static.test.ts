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

test("composer send is circular; front-door sites use composerPhrase", () => {
  const composer = read("MiniChatComposer.tsx");
  assert.match(composer, /borderRadius:\s*"50%"/);
  const col = read("MiniChatPanelColumn.tsx");
  assert.match(col, /guestComposerPlaceholder/);
  assert.match(col, /frontDoorChrome/);
  assert.match(col, /agencyPublicSurface/);
  // C13-1: offer posture (incl. preview inquiryId) keeps brief phrase, not reply.
  const ph = read("guest-composer-placeholder.ts");
  assert.match(ph, /composerPhrase/);
  assert.match(ph, /composerPhraseAgency/);
  assert.match(ph, /offerPreview/);
  assert.match(ph, /offer_pending/);
  assert.match(ph, /composerReply/);
  const hook = read("use-guest-dock-journey.ts");
  assert.match(hook, /usesFrontDoorJourneyChrome/);
  assert.match(hook, /frontDoorChrome/);
  assert.match(hook, /isHub/);
  const chromeHelpers = read("guest-journey-chrome.ts");
  assert.match(chromeHelpers, /usesFrontDoorJourneyChrome/);
  assert.match(chromeHelpers, /agencyPublicSurface/);
  assert.match(chromeHelpers, /opts\?\.isHub/);
  assert.doesNotMatch(chromeHelpers, /dockIntake === "agency"/);
  const colHub = read("MiniChatPanelColumn.tsx");
  assert.match(colHub, /isHub,/);
  const agencyMount = readFileSync(
    join(HERE, "../../../(public)/_chat/AgencyChatLauncherMount.tsx"),
    "utf8",
  );
  assert.match(agencyMount, /agencyPublicSurface/);
  assert.match(agencyMount, /const agencyPublicSurface = !isHub/);
});

test("offer posture uses sticky service chip, not browse ask strip", () => {
  const col = read("MiniChatPanelColumn.tsx");
  assert.match(col, /GuestComposerOfferingStrip/);
  const strip = read("GuestComposerOfferingStrip.tsx");
  assert.match(strip, /StickyOfferingChip/);
  assert.match(strip, /offerPosture/);
  assert.match(strip, /stickyTitleFromThread/);
  assert.match(strip, /v5\?\.offers/);
  assert.match(strip, /clearService/);
  assert.match(strip, /offeringDraftPrefix/);
  const picker = read("OfferingQuickPicker.tsx");
  assert.match(picker, /data-hablar-sticky-offering/);
  assert.match(picker, /clearLabel/);
  const journey = read("use-guest-dock-journey.ts");
  assert.match(journey, /railReady/);
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

test("agency public surface Items label resolves to front-door Browse", () => {
  const flags = readFileSync(
    join(HERE, "../../../../lib/inquiry/guest-dock-flags.ts"),
    "utf8",
  );
  assert.match(flags, /resolveGuestDockItemsLabel/);
  assert.match(flags, /agencyPublicSurface/);
  // Request locale (not words.locale) so fr → Parcourir.
  assert.match(flags, /Pass request locale so fr/);
  assert.match(flags, /locale,/);
  const helper = readFileSync(
    join(HERE, "../../../../lib/inquiry/guest-dock-items-label.ts"),
    "utf8",
  );
  assert.match(helper, /agencyPublicSurface/);
  assert.match(helper, /Browse/);
  assert.match(helper, /Parcourir/);
  assert.match(helper, /requestBrowseLocale/);
  assert.doesNotMatch(helper, /dockIntake === "agency"/);
});
