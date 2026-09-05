import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";

const here = dirname(fileURLToPath(import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) out.push(full);
  }
  return out;
}

const files = walk(here);

test("nothing under marketing/support imports the browser supabase client or realtime", () => {
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.equal(
      src.includes("@/lib/supabase/client") || src.includes("createBrowserClient"),
      false,
      `${file} must not import the browser supabase client`,
    );
    assert.equal(
      /from ["']@supabase\/supabase-js["']/.test(src) && src.includes("realtime"),
      false,
      `${file} must not subscribe to realtime`,
    );
    assert.equal(src.includes(".channel("), false, `${file} must not open a realtime channel`);
    assert.equal(src.includes("useHqSupportRealtime"), false, `${file} must not use HQ realtime`);
  }
});

test("MarketingSupportPanel never imports SupportIdeaForm", () => {
  const panel = readFileSync(join(here, "MarketingSupportPanel.tsx"), "utf8");
  assert.equal(panel.includes("SupportIdeaForm"), false);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.equal(src.includes("SupportIdeaForm"), false, `${file} must not import SupportIdeaForm`);
  }
});

test("new marketing support components have no inline style color/background", () => {
  const styleColor = /style=\{\{[^}]*(?:color|background)[^}]*\}\}/;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.equal(
      styleColor.test(src),
      false,
      `${file} has an inline color/background style; use classes`,
    );
  }
});

test("guest AI fetch path is allow-listed on the marketing host", () => {
  const panel = readFileSync(join(here, "MarketingSupportPanel.tsx"), "utf8");
  assert.match(panel, /\/api\/ai\/guest-support-chat/);
  // Assert the BEHAVIOUR, not the source text. This previously read
  // surface-allow-list.ts as a file and grepped it for the path and the
  // constant name — which reddened on a clean refactor the moment that file
  // was decomposed and the constant moved to a sibling module. The invariant
  // was never "this string appears in that file"; it is "the marketing host
  // may reach this path". Ask the gate.
  assert.equal(
    isPathAllowedForHostKind("marketing", "/api/ai/guest-support-chat"),
    true,
    "the marketing host must be allowed to reach the guest AI endpoint",
  );
  // Anti-vacuity: prove the gate actually discriminates, so a function that
  // returned true for everything could not satisfy the assertion above.
  // NOT asserted against another host kind — agency hosts reach this endpoint
  // too, which I only learned by running it rather than reasoning about it.
  assert.equal(
    isPathAllowedForHostKind("marketing", "/api/ai/not-a-real-endpoint"),
    false,
    "the gate must refuse a path it does not know",
  );
});

test("contact card is offered after AI or system fail-open replies", () => {
  const panel = readFileSync(join(here, "MarketingSupportPanel.tsx"), "utf8");
  assert.match(panel, /hasMachineReply/);
  assert.match(panel, /authorKind === "system"/);
  assert.match(panel, /appendGuestContactCardAction/);
});

test("guest support path never reads GUEST_CHAT_CAPTCHA_WIDGET_READY", () => {
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.equal(
      src.includes("GUEST_CHAT_CAPTCHA_WIDGET_READY"),
      false,
      `${file} must not read the captcha flag`,
    );
  }
  const actions = readFileSync(join(here, "../../../lib/support/guest-actions.ts"), "utf8");
  const route = readFileSync(
    join(here, "../../../app/api/ai/guest-support-chat/route.ts"),
    "utf8",
  );
  assert.equal(actions.includes("GUEST_CHAT_CAPTCHA_WIDGET_READY"), false);
  assert.equal(route.includes("GUEST_CHAT_CAPTCHA_WIDGET_READY"), false);
});

// The panel must speak ONE language, the page's.
//
// Production QA on the English /support page, after visiting /es/support once
// in the same session, got an English conversation containing a Spanish card:
// "Tu ticket esta con Orlando". The panel's own copy comes from the page locale
// handed down by the server; SupportCardRenderer called useT(), which reads the
// DASHBOARD locale from a cookie. Two locale sources in one panel, and the
// cookie won for the half a guest notices least and trusts most.
test("the panel hands its own locale to the cards it renders", () => {
  const panel = readFileSync(join(here, "MarketingSupportPanel.tsx"), "utf8");
  const idx = panel.indexOf("<SupportCardRenderer");
  assert.ok(idx > -1, "panel no longer renders support cards");
  const tag = panel.slice(idx, panel.indexOf("/>", idx));
  assert.match(
    tag,
    /locale=\{locale\}/,
    "SupportCardRenderer is rendered without a locale, so it falls back to the dashboard cookie",
  );
});
