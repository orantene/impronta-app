/**
 * The card chat's quick-question chips fill the composer (never send), with the
 * service name when a context card is set, and focus it. Rendered through the
 * real CardDockAskFooter (the merged dock draws it above the composer) with a
 * stateful draft and the same fill-and-focus handler the dock column passes.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://example.test/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
for (const k of ["HTMLElement", "HTMLTextAreaElement", "Element", "Node", "Event", "CustomEvent"]) g[k] = (dom.window as never)[k];
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CardDockAskFooter } from "./CardDockChatExtras";
import { clearPendingOffering, setPendingOffering } from "./pending-offering-store";
import { createTranslator } from "@/i18n/messages";
/* eslint-enable import/first */

const es = createTranslator("es");
let sent = 0;

function Harness() {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <CardDockAskFooter
        t={es}
        threadEmpty
        onPick={(q) => {
          setDraft(q);
          textareaRef.current?.focus();
        }}
      />
      <textarea ref={textareaRef} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button type="button" data-send="" onClick={() => void sent++}>
        send
      </button>
    </>
  );
}

function mount() {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Harness />));
  return { host, unmount: () => act(() => { root.unmount(); host.remove(); }) };
}

test("a chip fills the composer, focuses it and sends nothing", () => {
  clearPendingOffering();
  const { host, unmount } = mount();
  const chip = host.querySelector<HTMLButtonElement>("[data-card-chat-chips] button")!;
  assert.ok(chip);
  act(() => chip.click());
  const ta = host.querySelector<HTMLTextAreaElement>("textarea")!;
  assert.equal(ta.value, es("public.guestChat.askQuickWhen"));
  assert.equal(dom.window.document.activeElement, ta, "the composer is focused");
  assert.equal(sent, 0, "nothing is sent");
  unmount();
});

test("with a context card the chips fill the composer too", () => {
  setPendingOffering({ offeringId: "o1", title: "Gel pedicure", askAbout: ["Gel pedicure"] } as never);
  const { host, unmount } = mount();
  const chips = host.querySelectorAll<HTMLButtonElement>("[data-card-chat-context] [data-card-chat-chips] button");
  assert.equal(chips.length, 3);
  act(() => chips[1]!.click());
  assert.equal(host.querySelector<HTMLTextAreaElement>("textarea")!.value, es("public.guestChat.askQuickDuration"));
  unmount();
  clearPendingOffering();
});
