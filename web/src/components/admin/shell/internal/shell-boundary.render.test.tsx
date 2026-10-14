/**
 * TUL-635 — ShellBoundary must contain ordinary render errors in its fallback
 * and hand Next's redirect / not-found errors back from getDerivedStateFromError
 * (throwing in render crashed notFound() pages under the admin shell).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://qa.example/admin",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.MutationObserver = dom.window.MutationObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before these load */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./shell-error-boundary";
/* eslint-enable import/first */

function digestError(digest: string) {
  return Object.assign(new Error(digest), { digest });
}

test("getDerivedStateFromError rethrows NEXT_REDIRECT and NEXT_HTTP_ERROR_FALLBACK errors", () => {
  for (const d of ["NEXT_REDIRECT;replace;/x;307;", "NEXT_HTTP_ERROR_FALLBACK;404"]) {
    const err = digestError(d);
    assert.throws(() => ErrorBoundary.getDerivedStateFromError(err), (e) => e === err);
  }
});

test("getDerivedStateFromError contains an ordinary error", () => {
  const err = new Error("boom");
  assert.deepEqual(ErrorBoundary.getDerivedStateFromError(err), { caught: err });
});

test("ordinary render error shows the fallback", async () => {
  const origError = console.error;
  console.error = () => {};
  const Bomb = (): never => {
    throw new Error("panel exploded");
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
  });
  console.error = origError;
  assert.match(host.textContent ?? "", /Something broke/);
  assert.match(host.textContent ?? "", /panel exploded/);
  await act(async () => root.unmount());
});
