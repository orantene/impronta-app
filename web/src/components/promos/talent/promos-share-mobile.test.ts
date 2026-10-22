import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canUseNativeShare, shareNative } from "@/lib/promos/share/native-share";

// TUL-938 (QA build 9): Compartir did nothing at 390px. Phones open the native share sheet from the
// tap; otherwise the in-page sheet shows Copy link with an "Enlace copiado" / "Link copied" confirmation.

const g = globalThis as Record<string, unknown>;
function setEnv(opts: { phone: boolean; share?: (d: unknown) => Promise<void> }) {
  g.window = { matchMedia: () => ({ matches: opts.phone }) };
  Object.defineProperty(globalThis, "navigator", { value: opts.share ? { share: opts.share } : {}, configurable: true });
}

test("phone with navigator.share uses the native sheet", async () => {
  const seen: unknown[] = [];
  setEnv({ phone: true, share: async (d) => void seen.push(d) });
  assert.equal(canUseNativeShare(), true);
  assert.equal(await shareNative({ title: "T", text: "T", url: "https://x.test/p/a" }), "shared");
  assert.equal(seen.length, 1);
});

test("wide screen or no navigator.share falls back to the in-page sheet", async () => {
  setEnv({ phone: false, share: async () => undefined });
  assert.equal(await shareNative({ title: "T", text: "T", url: "u" }), "unavailable");
  setEnv({ phone: true });
  assert.equal(await shareNative({ title: "T", text: "T", url: "u" }), "unavailable");
});

test("cancel is quiet, other errors report failed so the caller opens the fallback", async () => {
  setEnv({ phone: true, share: async () => { throw Object.assign(new Error("x"), { name: "AbortError" }); } });
  assert.equal(await shareNative({ title: "T", text: "T", url: "u" }), "cancelled");
  setEnv({ phone: true, share: async () => { throw new Error("NotAllowedError"); } });
  assert.equal(await shareNative({ title: "T", text: "T", url: "u" }), "failed");
});

test("wiring: page shares natively from the tap, sheets are portaled, tappable, 44px, bilingual", () => {
  const read = (p: string) => readFileSync(join(__dirname, "../../..", p), "utf8");
  const page = read("components/promos/talent/PromosPage.tsx");
  assert.match(page, /canUseNativeShare\(\)/);
  assert.match(page, /r === "shared"\) logShare\(it\.id, "link"\)/);
  assert.doesNotMatch(page, /r === "cancelled"\) logShare/);
  assert.match(page, /r === "failed" \|\| r === "unavailable"\) setShareId/);
  const sheet = read("components/promos/share/promo-share-sheet.tsx");
  const svc = read("components/talent/services/ServiceShareSheet.tsx");
  for (const src of [sheet, svc]) {
    assert.match(src, /createPortal\(/);
    assert.match(src, /pointerEvents: "auto"/);
  }
  assert.match(sheet, /linkCopied: "Enlace copiado"/);
  assert.match(sheet, /linkCopied: "Link copied"/);
  assert.match(svc, /copied: "Enlace copiado"/);
  assert.match(svc, /min-h-11/);
  for (const src of [sheet, svc, page]) assert.doesNotMatch(src, /—/);
});
