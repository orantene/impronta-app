/** Share sheet in jsdom: copy-link success, rejection, and the execCommand fallback. */
import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://ana.example.com/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.fetch = async () => ({ ok: true }) as Response;

/* eslint-disable import/first -- jsdom globals before react-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";

import { PROMO_SHARE_LAYER } from "./layers";
import { PromoShareSheet } from "./promo-share-sheet";
/* eslint-enable import/first */

const doc = dom.window.document;

async function mountSheet(): Promise<HTMLElement> {
  doc.body.innerHTML = "";
  const host = doc.createElement("div");
  doc.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <PromoShareSheet
        open
        onClose={() => undefined}
        promoId="00000000-0000-4000-8000-0000000000a1"
        promoName="Verano"
        slug="verano"
        origin="https://ana.example.com"
        defaultLang="es"
        captions={{ es: "Mira {link}", en: "See {link}" }}
      />,
    );
  });
  return host;
}

function setClipboard(impl: ((t: string) => Promise<void>) | null): void {
  Object.defineProperty(dom.window.navigator, "clipboard", {
    value: impl ? { writeText: impl } : undefined,
    configurable: true,
  });
}

async function clickCopy(host: HTMLElement): Promise<void> {
  const btn = [...host.querySelectorAll("button")].find((b) => b.textContent === "Copiar enlace");
  assert.ok(btn, "copy link button");
  await act(async () => {
    btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
}

const status = (h: HTMLElement) => h.querySelector('[role="status"]')?.textContent ?? "";

test("layer class and readonly 16px link input", async () => {
  const host = await mountSheet();
  assert.ok((host.firstElementChild as HTMLElement).className.includes(PROMO_SHARE_LAYER));
  const input = host.querySelector("input[readonly]") as HTMLInputElement;
  assert.ok(input.className.includes("text-[16px]"));
  assert.match(input.value, /^https:\/\/ana\.example\.com\//);
});

test("clipboard resolves: full https link copied and Copiado shown", async () => {
  const copied: string[] = [];
  setClipboard(async (t) => void copied.push(t));
  const host = await mountSheet();
  await clickCopy(host);
  assert.equal(copied.length, 1);
  assert.match(copied[0], /^https:\/\/ana\.example\.com\/.*verano/);
  assert.equal(status(host), "Copiado");
});

test("clipboard rejects: manual-copy message and link input stay", async () => {
  setClipboard(async () => {
    throw new Error("denied");
  });
  (doc as unknown as { execCommand: () => boolean }).execCommand = () => false;
  const host = await mountSheet();
  await clickCopy(host);
  assert.match(status(host), /copia el enlace manualmente/);
  assert.ok(host.querySelector("input[readonly]"));
});

test("clipboard absent: execCommand fallback copies", async () => {
  setClipboard(null);
  let called = 0;
  (doc as unknown as { execCommand: () => boolean }).execCommand = () => {
    called += 1;
    return true;
  };
  const host = await mountSheet();
  await clickCopy(host);
  assert.equal(called, 1);
  assert.equal(status(host), "Copiado");
});
