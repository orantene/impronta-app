/**
 * event_program — every state renders under its own testid, the public page
 * gets NOTHING for an off / unconfigured program while the editor gets a
 * placeholder, no image means no image column, the night chips only exist
 * with more than one group, TBA rows say so, `+1` marks the crossing, and
 * the "now" marker follows the clock handed in.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

import type { PublicEventProgram, PublicScheduleItem } from "@/app/(public)/_events/event-program-actions";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { EventProgramIsland } from "./event-program-island";
/* eslint-enable import/first */

const EVENT = "22222222-2222-4222-8222-222222222222";
const ZONE = "America/Cancun";
const NIGHT_A = { sessionId: "night-a", label: "sáb 21 nov", startsAt: "2026-11-22T01:00:00.000Z" };
const NIGHT_B = { sessionId: "night-b", label: "dom 22 nov", startsAt: "2026-11-23T01:00:00.000Z" };

function item(overrides: Partial<PublicScheduleItem> & { id: string }): PublicScheduleItem {
  return {
    kind: "set", title: overrides.id, subtitle: null, description: null, startsAt: null, endsAt: null, timeTba: false,
    sessionId: null, spaceId: null, performer: null, coverUrl: null,
    links: { href: null, label: null, instagram: null, website: null }, sponsor: null, tags: [], sortOrder: 0,
    ...overrides,
  };
}

function program(overrides: Partial<Extract<PublicEventProgram, { enabled: true }>> = {}): PublicEventProgram {
  return {
    enabled: true, heading: "Programa", setTimesPublic: true, groupBy: "day", zone: ZONE,
    nights: [NIGHT_A], spaces: [],
    items: [
      item({ id: "doors", kind: "doors", title: "Puertas", sessionId: "night-a", startsAt: "2026-11-22T01:00:00.000Z" }),
      item({ id: "set1", title: "Opening set", sessionId: "night-a", startsAt: "2026-11-22T02:00:00.000Z", endsAt: "2026-11-22T03:00:00.000Z", performer: { name: "DJ Ana", tba: false, profileHref: "/t/ana", heroUrl: null, instagram: null }, coverUrl: "https://cdn.example/ana.jpg", description: "Warm-up." }),
      item({ id: "late", title: "Closing set", sessionId: "night-a", startsAt: "2026-11-22T06:30:00.000Z", performer: { name: "Marco", tba: false, profileHref: null, heroUrl: null, instagram: null } }),
      item({ id: "tba", title: "Secret guest", sessionId: "night-a", timeTba: true, performer: { name: "", tba: true, profileHref: null, heroUrl: null, instagram: null } }),
    ],
    ...overrides,
  };
}

function mount(element: React.ReactElement, body: (host: HTMLElement, root: Root) => void): void {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(element));
  try {
    body(host as unknown as HTMLElement, root);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
}

const state = (host: HTMLElement) => host.querySelector("[data-event-program]")?.getAttribute("data-event-program");

test("not_configured: hidden and empty on the public page, a placeholder in the editor", () => {
  mount(<EventProgramIsland eventId="" />, (host) => {
    assert.equal(state(host), "not_configured");
    const root = host.querySelector('[data-testid="event-program-not_configured"]');
    assert.ok(root?.hasAttribute("hidden"), "the public root is hidden");
    assert.equal(root?.textContent, "", "no sentence for a guest");
  });
  mount(<EventProgramIsland eventId="" editor />, (host) => {
    assert.equal(state(host), "not_configured");
    assert.match(host.querySelector(".ep-status")?.textContent ?? "", /not set up yet/);
  });
});

test("loading: a configured block with no preload says it is loading", () => {
  // The action import is dynamic and never resolves under jsdom in this tick,
  // so the first paint is the loading state.
  mount(<EventProgramIsland eventId={EVENT} />, (host) => {
    assert.equal(state(host), "loading");
    assert.ok(host.querySelector('[data-testid="event-program-loading"]'));
  });
});

test("disabled: enabled=false renders nothing public, a placeholder in the editor (es)", () => {
  mount(<EventProgramIsland eventId={EVENT} preload={{ enabled: false }} />, (host) => {
    assert.equal(state(host), "disabled");
    assert.ok(host.querySelector('[data-testid="event-program-disabled"]')?.hasAttribute("hidden"));
    assert.equal(host.querySelectorAll("style").length, 0, "a hidden root ships no sheet");
  });
  mount(<EventProgramIsland eventId={EVENT} editor locale="es" preload={{ enabled: false }} />, (host) => {
    assert.match(host.querySelector(".ep-status")?.textContent ?? "", /apagado/);
  });
});

test("empty: an enabled program with no item after the filter", () => {
  mount(<EventProgramIsland eventId={EVENT} preload={program()} filterKinds={["workshop"]} />, (host) => {
    assert.equal(state(host), "empty");
    assert.ok(host.querySelector('[data-testid="event-program-empty"]'));
  });
});

test("ready: heading, rows in order, performer link, cover only when there is one, TBA last with its sentence, +1 on the crossing", () => {
  mount(<EventProgramIsland eventId={EVENT} preload={program()} locale="es" />, (host) => {
    assert.equal(state(host), "ready");
    assert.equal(host.querySelector(".ep-heading")?.textContent, "Programa");
    const rows = Array.from(host.querySelectorAll('[data-testid="event-program-item"]'));
    assert.deepEqual(rows.map((r) => r.getAttribute("data-kind")), ["doors", "set", "set", "set"]);
    assert.equal(host.querySelectorAll('[data-testid="event-program-cover"]').length, 1, "one image, one img");
    assert.equal(rows[1]!.getAttribute("data-image"), "1");
    assert.equal(rows[2]!.getAttribute("data-image"), null, "no image means no image column, never a glyph");
    assert.equal(rows[1]!.querySelector(".ep-performer a")?.getAttribute("href"), "/t/ana");
    assert.equal(rows[2]!.querySelector(".ep-performer")?.textContent, "Marco");
    assert.equal(rows[2]!.querySelector('[data-testid="event-program-plus-day"]')?.textContent, "+1");
    assert.equal(rows[2]!.querySelector(".ep-time")?.textContent, "01:30+1");
    assert.equal(rows[3]!.getAttribute("data-tba"), "1");
    assert.match(rows[3]!.querySelector(".ep-time-tba")?.textContent ?? "", /Hora por confirmar/);
    assert.match(rows[3]!.querySelector(".ep-performer")?.textContent ?? "", /por anunciar/);
    assert.equal(host.querySelector('[data-testid="event-program-nav"]'), null, "one group: no chips");
    assert.ok(host.querySelector(".ep-desc"), "descriptions on by default");
    // Editorial run-of-show: every row the same shape, a rail dot each, no box.
    assert.equal(host.querySelectorAll('[data-testid="event-program-dot"]').length, rows.length, "one rail dot per row");
    for (const r of rows) assert.equal(r.className, "ep-item", "no card class on a timeline row");
    assert.equal(host.querySelectorAll('[data-testid="event-program-kind"]').length, 0, "kind words are off by default");
    assert.equal(host.querySelector('[data-testid="event-program-eyebrow"]'), null, "no eyebrow unless authored");
  });
});

test("eyebrow renders when authored; showKind adds a small word, never a symbol", () => {
  mount(<EventProgramIsland eventId={EVENT} preload={program()} eyebrow="Run of show" showKind locale="es" />, (host) => {
    assert.equal(host.querySelector('[data-testid="event-program-eyebrow"]')?.textContent, "Run of show");
    const kinds = Array.from(host.querySelectorAll('[data-testid="event-program-kind"]')).map((k) => k.textContent);
    assert.deepEqual(kinds, ["Puertas", "Set", "Set", "Set"]);
    assert.doesNotMatch(host.innerHTML, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "no emoji in the markup");
  });
});

test("switches: showImages / showDescriptions / showTimes off, limit, heading override", () => {
  mount(<EventProgramIsland eventId={EVENT} preload={program()} showImages={false} showDescriptions={false} showTimes={false} limit={2} heading="El programa" />, (host) => {
    assert.equal(host.querySelector(".ep-heading")?.textContent, "El programa");
    assert.equal(host.querySelectorAll('[data-testid="event-program-item"]').length, 2);
    assert.equal(host.querySelectorAll('[data-testid="event-program-cover"]').length, 0);
    assert.equal(host.querySelectorAll(".ep-desc").length, 0);
    assert.equal(host.querySelectorAll(".ep-time-tba").length, 2, "times off: every row reads as TBA");
  });
});

test("night chips exist only with more than one group, and jump marks the chip", () => {
  const two = program({
    nights: [NIGHT_A, NIGHT_B],
    items: [
      item({ id: "a", sessionId: "night-a", startsAt: "2026-11-22T02:00:00.000Z" }),
      item({ id: "b", sessionId: "night-b", startsAt: "2026-11-23T02:00:00.000Z" }),
    ],
  });
  mount(<EventProgramIsland eventId={EVENT} preload={two} />, (host) => {
    const nav = host.querySelector('[data-testid="event-program-nav"]');
    assert.ok(nav, "two nights: chips");
    const chips = Array.from(nav!.querySelectorAll(".ep-chip"));
    assert.deepEqual(chips.map((c) => c.textContent), ["sáb 21 nov", "dom 22 nov"]);
    assert.equal(chips[0]!.getAttribute("data-on"), "1");
    act(() => { (chips[1] as HTMLButtonElement).click(); });
    assert.equal(nav!.querySelectorAll(".ep-chip")[1]!.getAttribute("data-on"), "1");
    assert.equal(host.querySelectorAll('[data-testid="event-program-group"]').length, 2);
    assert.equal(host.querySelector(".ep-shell")?.getAttribute("data-rail"), "1");
  });
  mount(<EventProgramIsland eventId={EVENT} preload={two} groupBy="none" />, (host) => {
    assert.equal(host.querySelector('[data-testid="event-program-nav"]'), null, "groupBy none: no chips");
  });
});

test("the now marker follows the clock and only ever sits on one row", () => {
  mount(<EventProgramIsland eventId={EVENT} preload={program()} nowMs={Date.parse("2026-11-22T02:30:00.000Z")} />, (host) => {
    const marked = host.querySelectorAll('[data-testid="event-program-now"]');
    assert.equal(marked.length, 1);
    assert.equal(marked[0]!.closest('[data-testid="event-program-item"]')?.getAttribute("data-kind"), "set");
    assert.equal(host.querySelector('[data-now="1"] .ep-title')?.textContent, "Opening set");
  });
  mount(<EventProgramIsland eventId={EVENT} preload={program()} nowMs={Date.parse("2026-11-20T00:00:00.000Z")} />, (host) => {
    assert.equal(host.querySelectorAll('[data-testid="event-program-now"]').length, 0);
  });
});

test("server render carries no now marker, whatever the wall clock", () => {
  const html = renderToStaticMarkup(<EventProgramIsland eventId={EVENT} preload={program()} />);
  assert.doesNotMatch(html, /event-program-now/);
  assert.match(html, /data-event-program="ready"/);
});
