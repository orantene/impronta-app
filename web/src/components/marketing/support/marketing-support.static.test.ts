import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

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
  const allow = readFileSync(
    join(here, "../../../lib/saas/surface-allow-list.ts"),
    "utf8",
  );
  assert.match(allow, /\/api\/ai\/guest-support-chat/);
  assert.match(allow, /MARKETING_API_PREFIXES/);
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
