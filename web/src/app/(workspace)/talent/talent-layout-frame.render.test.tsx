/**
 * TUL-1274: the talent layout's degraded branches must not remount the shell.
 *
 * (c) every TalentLayoutInner return is the same TalentLayoutFrame wrapper;
 * (d) a panel opened inside the shell stays open across a refresh with new
 *     props, including one where the layout's profile read missed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/talent/settings" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals before react-dom */
import { act, Profiler, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { TALENT_PAGES_ALL } from "@/components/admin/shell/internal/state/fixtures";
import { pickTalentFrameContent, TalentLayoutFrame, type TalentLayoutFrameMode } from "./_talent-layout-frame";
/* eslint-enable import/first */

const INNER = readFileSync(path.join(process.cwd(), "src/app/(workspace)/talent/_talent-layout-inner.tsx"), "utf8");

test("(c) every TalentLayoutInner branch returns the same TalentLayoutFrame wrapper", () => {
  const body = INNER.slice(INNER.indexOf("export async function TalentLayoutInner"));
  const returns = [...body.matchAll(/\breturn\s*(\(\s*)?(<[^\s>]*)/g)].map((m) => m[2]);
  assert.ok(returns.length >= 4, `expected the 4 branch returns, saw ${returns.length}`);
  for (const r of returns) assert.equal(r, "<TalentLayoutFrame", `a branch returns ${r} instead of the frame`);
  assert.doesNotMatch(body, /return\s*<>\{children\}<\/>/, "a bare fragment return remounts the shell on refresh");
  assert.match(body, /<TalentLayoutFrame mode="degraded">\{children\}<\/TalentLayoutFrame>/);
  assert.match(body, /<TalentLayoutFrame mode="shell">/);
  assert.doesNotMatch(body, /<TalentLayoutFrame[^>]*\bkey=/, "a key on the frame would remount it");
});

test("pickTalentFrameContent: degraded keeps the last shell, otherwise the new content", () => {
  assert.equal(pickTalentFrameContent("degraded", "bare", "shell"), "shell");
  assert.equal(pickTalentFrameContent("degraded", "bare", null), "bare", "first load: bare page as before");
  assert.equal(pickTalentFrameContent("shell", "new", "old"), "new");
  assert.equal(pickTalentFrameContent("passthrough", "redirect", "shell"), "redirect");
});

let mounts = 0;
function Shell({ version, children }: { version: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mountId] = useState(() => ++mounts);
  return (
    <div data-shell={version} data-mount={mountId}>
      <button type="button" data-open-panel onClick={() => setOpen(true)}>open</button>
      {open ? <section data-panel>Facturación</section> : null}
      {children}
    </div>
  );
}

test("(d) an open panel survives a refresh with new props and a degraded refresh", () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  const page = <p data-page>Ajustes</p>;
  const render = (mode: TalentLayoutFrameMode, version: number) =>
    act(() => {
      root.render(
        <TalentLayoutFrame mode={mode}>
          {mode === "shell" ? <Shell version={version}>{page}</Shell> : page}
        </TalentLayoutFrame>,
      );
    });

  render("shell", 1);
  act(() => {
    (host.querySelector("[data-open-panel]") as HTMLButtonElement).click();
  });
  assert.ok(host.querySelector("[data-panel]"), "panel opened");
  const mountId = host.querySelector("[data-shell]")?.getAttribute("data-mount");

  // A refresh with fresh bridge data: same tree, new props.
  render("shell", 2);
  assert.ok(host.querySelector("[data-panel]"), "panel still open after a refresh");
  assert.equal(host.querySelector("[data-shell]")?.getAttribute("data-shell"), "2", "new props applied");

  // A refresh where the layout's profile read missed: the shell stays mounted.
  render("degraded", 3);
  assert.ok(host.querySelector("[data-panel]"), "panel still open after a degraded refresh");
  assert.equal(host.querySelector("[data-shell]")?.getAttribute("data-mount"), mountId, "shell never remounted");
  assert.ok(host.querySelector("[data-page]"), "page still rendered");

  act(() => root.unmount());
});

test("first load that misses the profile still renders the bare page", () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <TalentLayoutFrame mode="degraded">
        <p data-page>Ajustes</p>
      </TalentLayoutFrame>,
    );
  });
  assert.ok(host.querySelector("[data-page]"));
  assert.equal(host.querySelector("[data-shell]"), null);
  act(() => root.unmount());
});

/**
 * Coordinator QA on #4061 (d3927b5): direct entry into /talent/profile and
 * /talent/today was reported stuck on the shell skeleton. Pin that the frame
 * itself never holds a direct entry: for every talent route key, the first
 * render shows that page (never a skeleton), and the frame commits exactly
 * once (no state update while the page hydrates). With shell data absent
 * (profile read miss) the bare page renders on the first commit too.
 */
for (const key of TALENT_PAGES_ALL) {
  test(`direct entry /talent ${key}: the frame renders the page on the first commit, with and without shell data`, () => {
    for (const mode of ["shell", "degraded", "passthrough"] as const) {
      const host = dom.window.document.createElement("div");
      dom.window.document.body.appendChild(host);
      const root = createRoot(host);
      const phases: string[] = [];
      const page = <main data-talent-page={key}>{key}</main>;
      act(() => {
        root.render(
          <Profiler id="frame" onRender={(_id, phase) => phases.push(phase)}>
            <TalentLayoutFrame mode={mode}>
              {mode === "shell" ? <Shell version={1}>{page}</Shell> : page}
            </TalentLayoutFrame>
          </Profiler>,
        );
      });
      assert.equal(host.querySelector("[data-talent-page]")?.getAttribute("data-talent-page"), key, `${mode}: page rendered`);
      assert.equal(host.textContent?.includes("Cargando tu espacio"), false, `${mode}: no skeleton`);
      assert.deepEqual(phases, ["mount"], `${mode}: one commit, no re-render on mount`);
      act(() => root.unmount());
      host.remove();
    }
  });
}
