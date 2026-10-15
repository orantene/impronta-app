/** Share preview in jsdom: loading -> error -> retry -> loaded, plus the paid-only print button. */
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

import { PromoShareSheet } from "./promo-share-sheet";
import { SharePreview, withRetryParam } from "./share-preview";
/* eslint-enable import/first */

const doc = dom.window.document;

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  doc.body.innerHTML = "";
  const host = doc.createElement("div");
  doc.body.appendChild(host);
  await act(async () => { createRoot(host).render(node); });
  return host;
}
const box = (h: HTMLElement) => h.firstElementChild as HTMLElement;
const state = (h: HTMLElement) => box(h).getAttribute("data-preview-state");

test("withRetryParam only busts the cache after a retry", () => {
  assert.equal(withRetryParam("/a", 0), "/a");
  assert.equal(withRetryParam("/a", 2), "/a?r=2");
  assert.equal(withRetryParam("/a?x=1", 1), "/a?x=1&r=1");
});

test("preview: loading -> error -> retry -> loaded without changing the box ratio", async () => {
  const host = await mount(<SharePreview src="/api/x/story" alt="Historia" format="story" lang="es" />);
  assert.equal(state(host), "loading");
  assert.ok(host.querySelector("[data-preview-skeleton]"));
  assert.ok(box(host).className.includes("aspect-[9/16]"));
  const ratio = box(host).className;

  await act(async () => { host.querySelector("img")?.dispatchEvent(new dom.window.Event("error")); });
  assert.equal(state(host), "error");
  assert.equal(host.querySelector("img"), null);
  assert.ok(host.textContent?.includes("Vista previa no disponible"));
  assert.equal(box(host).className, ratio);

  const retry = [...host.querySelectorAll("button")].find((b) => b.textContent === "Reintentar");
  assert.ok(retry);
  await act(async () => { retry.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  assert.equal(state(host), "loading");
  assert.equal(host.querySelector("img")?.getAttribute("src"), "/api/x/story?r=1");

  await act(async () => { host.querySelector("img")?.dispatchEvent(new dom.window.Event("load")); });
  assert.equal(state(host), "loaded");
  assert.equal(host.querySelector("[data-preview-skeleton]"), null);
});

test("preview: post is square and EN copy is used", async () => {
  const host = await mount(<SharePreview src="/api/x/post" alt="Post" format="post" lang="en" />);
  assert.ok(box(host).className.includes("aspect-square"));
  await act(async () => { host.querySelector("img")?.dispatchEvent(new dom.window.Event("error")); });
  assert.ok(host.textContent?.includes("Preview unavailable"));
});

test("share sheet: the printable card button is hidden unless printEnabled", async () => {
  const base = {
    open: true, onClose: () => undefined, promoId: "00000000-0000-4000-8000-0000000000a1", promoName: "Verano",
    slug: "verano", origin: "https://ana.example.com", defaultLang: "es" as const, captions: { es: "{link}", en: "{link}" },
  };
  const off = await mount(<PromoShareSheet {...base} />);
  assert.ok(![...off.querySelectorAll("a")].some((a) => a.textContent === "Tarjeta para imprimir"));
  const on = await mount(<PromoShareSheet {...base} printEnabled />);
  assert.ok([...on.querySelectorAll("a")].some((a) => a.textContent === "Tarjeta para imprimir"));
});
