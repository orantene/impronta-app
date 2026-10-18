import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const thread = readFileSync("src/components/support/SupportThreadView.tsx", "utf8");
const header = readFileSync("src/components/support/SupportThreadHeader.tsx", "utf8");
const home = readFileSync("src/components/support/SupportPanelHome.tsx", "utf8");

test("TUL-942: the in-bubble talk-to-human button is skipped when an offer card exists", () => {
  assert.match(thread, /hasOfferCard/);
  assert.match(thread, /humanPlacement === "bubble" && m\.id === lastAiId/);
  assert.match(thread, /humanPlacement === "footer"/);
});

test("TUL-943: the No button stays after escalation and just dismisses the row", () => {
  assert.match(thread, /canOfferHuman\(ticket\) \? onRequestHuman : \(\) => setAcked/);
});

test("TUL-948: the thinking bubble goes through shouldShowThinking", () => {
  assert.match(thread, /shouldShowThinking\(thinking, messages\)/);
});

test("TUL-944: the thread header title and status may wrap instead of ellipsis", () => {
  assert.match(header, /WebkitLineClamp: 2/);
  assert.doesNotMatch(header, /whiteSpace: "nowrap"/);
});

test("TUL-949: the ask box is a form so Enter on any mobile keyboard submits", () => {
  assert.match(home, /<form[\s\S]*onSubmit=/);
  assert.match(home, /enterKeyHint="send"/);
});

const launcher = readFileSync("src/components/support/SupportLauncher.tsx", "utf8");
const geometry = readFileSync("src/components/support/support-panel-geometry.ts", "utf8");

test("TUL-982: the compact launcher sits above the tab bar, not at 62% of the viewport", () => {
  assert.doesNotMatch(launcher, /"62%"/);
  assert.match(launcher, /SUPPORT_LAUNCHER_COMPACT_BOTTOM/);
  assert.match(geometry, /65px \+ 12px \+ env\(safe-area-inset-bottom/);
});

test("TUL-982: the shell's phone rule clears the nav plus the safe-area inset without --tulala-mobile-nav-h", () => {
  const css = readFileSync("src/components/admin/shell/internal/messages-mobile-css.ts", "utf8");
  const rule = css.match(/\[data-tulala-support-launcher\] \{[^}]*\}/)?.[0] ?? "";
  assert.match(rule, /bottom: calc\(65px \+ 12px \+ env\(safe-area-inset-bottom, 0px\)\) !important/);
  // The variable lives on .tulala-shell; the launcher is a sibling, so it never resolves there.
  assert.doesNotMatch(rule, /--tulala-mobile-nav-h/);
  assert.match(geometry, /calc\(65px \+ 12px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});

test("TUL-947: the launcher lifts above the offline banner and hides with the keyboard", () => {
  assert.match(geometry, /data-tulala-offline-banner/);
  assert.match(geometry, /input:focus, textarea:focus/);
  assert.match(launcher, /SUPPORT_LAUNCHER_COMPACT_CSS/);
});

test("TUL-916: the panel close button has its own accessible name, not 'Cerrar'", () => {
  const panel = readFileSync("src/components/support/SupportPanel.tsx", "utf8");
  assert.match(panel, /aria-label=\{t\("dashboard\.adminSupport\.closeAria"\)\}/);
  assert.match(home, /aria-label=\{t\("dashboard\.adminSupport\.closeAria"\)\}/);
  const es = JSON.parse(readFileSync("messages/es.json", "utf8")).dashboard.adminSupport;
  assert.equal(es.closeAria, "Cerrar soporte");
});

test("TUL-904/907: More sheet 'Get help' closes the sheet and opens the Guide home (support panel); sheet is mobile-only", () => {
  const more = readFileSync("src/components/talent/studio/MoreScreen.tsx", "utf8");
  assert.match(more, /onClose\(\);\s*openGuideHome\(\)/);
  assert.match(more, /min-\[721px\]:hidden/);
  assert.match(more, /min-h-\[44px\]/);
});

test("TUL-600: the new-ticket form lets you pick screenshots and uploads them after create", () => {
  const forms = readFileSync("src/components/support/SupportPanelForms.tsx", "utf8");
  assert.match(forms, /type="file"/);
  assert.match(forms, /uploadStagedAttachments\(r\.ticketId, files/);
  assert.match(forms, /dashboard\.adminSupport\.attachAria/);
  for (const l of ["en", "es", "fr"]) {
    const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard.adminSupport;
    assert.ok(m.fieldAttachments, `${l} fieldAttachments`);
  }
});

test("TUL-907/995: the talent name chip opens the profile and the More sheet carries the language switch", () => {
  const bar = readFileSync("src/components/admin/shell/internal/page-modules/MobileTopBar.tsx", "utf8");
  assert.match(bar, /href="\/talent\/profile"[\s\S]*setTalentPage\("profile"/);
  assert.doesNotMatch(bar, /disabled=\{inTalent\}/);
  const more = readFileSync("src/components/talent/studio/MoreScreen.tsx", "utf8");
  assert.match(more, /<DashboardLocaleToggle/);
  for (const l of ["en", "es", "fr"]) {
    const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard.mobile;
    assert.ok(m.talentPillAria, `${l} talentPillAria`);
  }
});

test("TUL-949: the thread composer sends on Enter, Shift+Enter is a newline, IME composition never sends", () => {
  const forms = readFileSync("src/components/support/SupportPanelForms.tsx", "utf8");
  assert.match(forms, /e\.key === "Enter" && !e\.shiftKey && !e\.nativeEvent\.isComposing/);
  assert.match(forms, /enterKeyHint="send"/);
});

test("TUL-982: on the talent surface the phone has no floating support circle (More > Get help instead)", () => {
  const shell = readFileSync("src/components/support/SupportLauncherShell.tsx", "utf8");
  // The server contract decides too: a hybrid owner on /talent can have state.surface "workspace".
  assert.match(shell, /hideFloatingOnCompact=\{contract\.surface === "talent" \|\| state\.surface === "talent"\}/);
  assert.match(launcher, /!\(compact && hideFloatingOnCompact\)/);
});

test("TUL-600: the Tickets tab has a new-ticket button that opens the new-ticket form", () => {
  const panel = readFileSync("src/components/support/SupportPanel.tsx", "utf8");
  assert.match(panel, /onNew=\{\(\) => setView\("new"\)\}/);
  assert.match(panel, /onClick=\{onNew\}/);
});

test("TUL-982: where the phone hides the floating circle, CSS hides it before hydration too", () => {
  assert.match(geometry, /SUPPORT_LAUNCHER_HIDE_COMPACT_CSS[\s\S]*display: none !important/);
  assert.match(launcher, /hideFloatingOnCompact \? SUPPORT_LAUNCHER_HIDE_COMPACT_CSS : ""/);
});

test("TUL-943: Si and No render side by side in the same branch, gated by the one showHelpfulRow check", () => {
  assert.match(thread, /!showHelpfulRow\(ticket, Boolean\(acked\[m\.id\]\)\) \? null/);
  const yes = thread.indexOf('t("dashboard.adminSupport.yesHelped")');
  const no = thread.indexOf('t("dashboard.adminSupport.noHelped")');
  assert.ok(yes > 0 && no > yes, "both buttons present, Si before No");
  assert.equal(thread.slice(yes, no).includes("<>"), false, "no branch boundary between the two buttons");
  assert.equal(thread.slice(yes, no).includes(") : ("), false);
  assert.equal(thread.match(/dashboard\.adminSupport\.yesHelped/g)?.length, 1);
  assert.equal(thread.match(/dashboard\.adminSupport\.noHelped/g)?.length, 1);
});

test("TUL-942: the footer escalate button is gated by placement 'footer' and the bubble one by the newest AI bubble", () => {
  assert.equal(thread.match(/dashboard\.adminSupport\.talkToHuman/g)?.length, 2);
  assert.match(thread, /humanPlacement === "footer" && ticket\?\.handledBy === "ai"/);
  assert.match(thread, /hasAiAnswer: tone !== "hq" && lastAiId != null/);
});

test("TUL-949: Enter in the thread composer calls send() and blocks the newline; Shift+Enter falls through", () => {
  const forms = readFileSync("src/components/support/SupportPanelForms.tsx", "utf8");
  assert.match(
    forms,
    /if \(e\.key === "Enter" && !e\.shiftKey && !e\.nativeEvent\.isComposing\) \{\s*e\.preventDefault\(\);\s*void send\(\);/,
  );
  assert.match(forms, /<textarea[\s\S]*?rows=\{1\}/);
});

test("TUL-949: the home question box is a single input inside a form with a type=submit button (Enter submits natively)", () => {
  const formAt = home.indexOf("<form");
  const submitAt = home.indexOf('type="submit"');
  assert.ok(formAt > 0 && submitAt > formAt);
  assert.match(home, /onSubmit=\{\(e\) => \{\s*e\.preventDefault\(\);\s*onSubmit\(\);/);
  assert.doesNotMatch(home.slice(formAt, home.indexOf("</form>")), /<textarea/);
});

test("TUL-947: at 390 the support launcher sits above the connection-lost banner and paints over it", () => {
  const banner = readFileSync("src/components/admin/offline-banner.tsx", "utf8");
  const bannerBottom = Number(banner.match(/bottom: calc\((\d+)px \+ env\(safe-area-inset-bottom/)?.[1]);
  const launcherBottom = Number(
    geometry.match(/data-tulala-offline-banner\]\) button\[data-tulala-support-launcher=""\] \{\s*bottom: calc\((\d+)px/)?.[1],
  );
  assert.ok(bannerBottom > 0 && launcherBottom > bannerBottom, `launcher ${launcherBottom}px must clear banner ${bannerBottom}px`);
  const bannerZ = Number(banner.match(/zIndex: (\d+)/)?.[1]);
  const launcherZ = Number(launcher.match(/zIndex: (\d+)/)?.[1]);
  assert.ok(launcherZ > bannerZ, `launcher z ${launcherZ} must be above banner z ${bannerZ}`);
});

test("TUL-916: 'Cerrar tu cuenta' (row) and the support panel close button announce different names", () => {
  const settings = readFileSync("src/components/admin/shell/internal/talent/pages/SettingsPage.tsx", "utf8");
  assert.match(settings, /label: tx\("Close your account"\)/);
  const presenceEs = readFileSync("src/components/talent/studio/presence-es-text.ts", "utf8");
  assert.match(presenceEs, /"Close your account": "Cerrar tu cuenta"/);
  const es = JSON.parse(readFileSync("messages/es.json", "utf8")).dashboard.adminSupport;
  const en = JSON.parse(readFileSync("messages/en.json", "utf8")).dashboard.adminSupport;
  assert.notEqual(es.closeAria, "Cerrar tu cuenta");
  assert.notEqual(es.closeAria, "Cerrar");
  assert.notEqual(en.closeAria, "Close your account");
  assert.notEqual(en.closeAria, "Close");
});
