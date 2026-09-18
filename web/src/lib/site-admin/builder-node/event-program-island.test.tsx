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
    media: { gallery: [], video: null },
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
      item({ id: "set1", title: "Opening set", sessionId: "night-a", startsAt: "2026-11-22T02:00:00.000Z", endsAt: "2026-11-22T03:00:00.000Z", performer: { name: "DJ Ana", tba: false, profileHref: "/t/ana", heroUrl: null, instagram: null, bio: null }, coverUrl: "https://cdn.example/ana.jpg", description: "Warm-up." }),
      item({ id: "late", title: "Closing set", sessionId: "night-a", startsAt: "2026-11-22T06:30:00.000Z", performer: { name: "Marco", tba: false, profileHref: null, heroUrl: null, instagram: null, bio: null } }),
      item({ id: "tba", title: "Secret guest", sessionId: "night-a", timeTba: true, performer: { name: "", tba: true, profileHref: null, heroUrl: null, instagram: null, bio: null } }),
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
  mount(<EventProgramIsland eventId={EVENT} preload={program()} locale="es" openDrawer={false} />, (host) => {
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
    for (const r of rows) assert.ok(r.classList.contains("ep-item") && !r.classList.contains("ep-card"), "no card class on a timeline row");
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

// ── Every layout is a real option ─────────────────────────────────────────

const LAYOUTS = ["timeline", "cards", "compact", "schedule", "lineup"] as const;

test("every layout renders the ready state under the same testids and names itself on the root", () => {
  for (const layout of LAYOUTS) {
    mount(<EventProgramIsland eventId={EVENT} preload={program()} layout={layout} />, (host) => {
      const root = host.querySelector('[data-testid="event-program-ready"]');
      assert.ok(root, `${layout}: ready root`);
      assert.equal(root!.getAttribute("data-layout"), layout);
      assert.ok(host.querySelectorAll('[data-testid="event-program-item"]').length >= 1, `${layout}: items`);
      assert.ok(host.querySelectorAll('[data-testid="event-program-performer"]').length >= 1, `${layout}: performers`);
      assert.doesNotMatch(host.innerHTML, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${layout}: no emoji`);
    });
  }
});

test("cards: a 16:10 cover when there is an image, a surface panel with the time otherwise; 2-line description", () => {
  mount(<EventProgramIsland eventId={EVENT} preload={program()} layout="cards" locale="es" />, (host) => {
    const cards = Array.from(host.querySelectorAll(".ep-card"));
    assert.equal(cards.length, 4);
    assert.equal(host.querySelectorAll('[data-testid="event-program-cover"]').length, 1);
    const panels = host.querySelectorAll('[data-testid="event-program-card-panel"]');
    assert.equal(panels.length, 3, "three cards without an image get the panel");
    assert.equal(panels[0]!.textContent, "20:00", "the panel shows the time large");
    assert.match(panels[2]!.textContent ?? "", /Hora por confirmar/);
    assert.ok(host.querySelector(".ep-desc-2"), "descriptions clamp to two lines");
    assert.equal(host.querySelectorAll(".ep-card-time").length, 1, "only the card with a cover shows the small time line; the panel already shows it large");
    assert.equal(host.querySelector('[data-testid="event-program-nav"]'), null, "one night: no chips");
  });
});

test("compact: one line per item, no images, no descriptions, performer at the right; no chips, headers instead", () => {
  const two = program({ nights: [NIGHT_A, NIGHT_B], items: [
    item({ id: "a", sessionId: "night-a", startsAt: "2026-11-22T02:00:00.000Z", coverUrl: "https://cdn.example/a.jpg", description: "long", performer: { name: "Ana", tba: false, profileHref: null, heroUrl: null, instagram: null, bio: null } }),
    item({ id: "b", sessionId: "night-b", startsAt: "2026-11-23T02:00:00.000Z" }),
  ] });
  mount(<EventProgramIsland eventId={EVENT} preload={two} layout="compact" />, (host) => {
    assert.equal(host.querySelectorAll(".ep-line").length, 2);
    assert.equal(host.querySelectorAll('[data-testid="event-program-cover"]').length, 0, "compact never shows an image");
    assert.equal(host.querySelectorAll(".ep-desc").length, 0);
    assert.equal(host.querySelector(".ep-line-performer")?.textContent, "Ana");
    assert.equal(host.querySelector('[data-testid="event-program-nav"]'), null, "compact uses headers, not chips");
    assert.equal(host.querySelectorAll(".ep-group-title").length, 2);
  });
});

test("schedule: a column per space, blocks spanning their slots, a phone list grouped by space with chips", () => {
  const staged = program({
    spaces: [{ id: "main", name: "Main", kind: "stage" }, { id: "patio", name: "Patio", kind: "space" }],
    items: [
      item({ id: "a", spaceId: "main", sessionId: "night-a", startsAt: "2026-11-22T01:00:00.000Z", endsAt: "2026-11-22T02:00:00.000Z" }),
      item({ id: "b", spaceId: "patio", sessionId: "night-a", startsAt: "2026-11-22T01:00:00.000Z" }),
      item({ id: "tba", sessionId: "night-a", timeTba: true }),
    ],
  });
  mount(<EventProgramIsland eventId={EVENT} preload={staged} layout="schedule" locale="es" />, (host) => {
    const grid = host.querySelector(".ep-grid") as HTMLElement | null;
    assert.ok(grid, "the grid renders");
    assert.equal(host.querySelector('[data-testid="event-program-schedule"]')?.getAttribute("data-columns"), "2");
    assert.deepEqual(Array.from(grid!.querySelectorAll(".ep-grid-head")).map((h) => h.textContent), ["Main", "Patio"]);
    assert.deepEqual(Array.from(grid!.querySelectorAll(".ep-grid-slot")).map((h) => h.textContent), ["20:00", "20:30"]);
    const blocks = Array.from(grid!.querySelectorAll(".ep-block")) as HTMLElement[];
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0]!.style.gridRow, "2 / span 2", "an hour spans two 30-minute rows");
    assert.equal(blocks[1]!.style.gridRow, "2 / span 1", "open-ended and last: one slot");
    assert.equal(host.querySelectorAll('[data-testid="event-program-cover"]').length, 0, "no images in the schedule");
    assert.equal(host.querySelectorAll(".ep-schedule-unplaced .ep-line").length, 1, "TBA listed apart");
    const phone = host.querySelector('[data-testid="event-program-schedule-phone"]');
    assert.equal(phone?.querySelectorAll(".ep-space-chips .ep-chip").length, 2, "space chips on phones");
    assert.equal(phone?.querySelectorAll(".ep-space .ep-line").length, 2, "compact rows grouped by space");
  });
});

test("lineup: only performers or covers make tiles; initials without an image; the tile links to the profile", () => {
  mount(<EventProgramIsland eventId={EVENT} preload={program()} layout="lineup" locale="es" openDrawer={false} />, (host) => {
    const tiles = Array.from(host.querySelectorAll(".ep-tile"));
    assert.equal(tiles.length, 3, "Doors has no face and makes no tile");
    assert.equal(host.querySelectorAll('[data-testid="event-program-cover"]').length, 1);
    const panels = Array.from(host.querySelectorAll('[data-testid="event-program-tile-panel"]'));
    assert.deepEqual(panels.map((p) => p.textContent), ["M", "AA"], "initials in place of a cover; the announced performer uses the TBA words");
    assert.equal(tiles[0]!.querySelector("a.ep-tile-link")?.getAttribute("href"), "/t/ana");
    assert.equal(tiles[1]!.querySelector("a.ep-tile-link"), null, "no profile, no link");
    assert.deepEqual(Array.from(host.querySelectorAll(".ep-tile-name")).map((n) => n.textContent), ["DJ Ana", "Marco", "Artista por anunciar"]);
    assert.deepEqual(Array.from(host.querySelectorAll('[data-testid="event-program-tile-title"]')).map((n) => n.textContent), ["Opening set", "Closing set", "Secret guest"], "the item title reads above the name");
  });
  mount(<EventProgramIsland eventId={EVENT} preload={program({ items: [item({ id: "doors", kind: "doors" })] })} layout="lineup" />, (host) => {
    assert.ok(host.querySelector('[data-testid="event-program-empty"]'), "no performer and no cover: the lineup is empty");
  });
});

// ── The item drawer ───────────────────────────────────────────────────────

const rich = () => program({
  spaces: [{ id: "main", name: "Main", kind: "stage" }],
  items: [
    item({
      id: "ws", kind: "workshop", title: "Taller de luz", sessionId: "night-a", spaceId: "main", startsAt: "2026-11-22T02:00:00.000Z", endsAt: "2026-11-22T03:00:00.000Z",
      description: "Una hora con la luz.", coverUrl: "https://cdn.example/ws.jpg",
      performer: { name: "DJ Ana", tba: false, profileHref: "/t/ana", heroUrl: null, instagram: "@ana", bio: "Cancun house.", },
      media: { gallery: ["https://cdn.example/g1.jpg", "https://cdn.example/g2.jpg"], video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      links: { href: "https://tickets.example/ws", label: null, instagram: null, website: "https://ana.example" },
      sponsor: { name: "Brand", logoUrl: null, url: "https://brand.example" },
    }),
    item({ id: "set", title: "Set", sessionId: "night-a", startsAt: "2026-11-22T04:00:00.000Z", links: { href: "https://x.example", label: "Buy the record", instagram: null, website: null } }),
  ],
});

test("drawer: a row is a dialog trigger; open shows hero, title, performer, bio, links, description, gallery, video, sponsor and CTA; Escape closes and focus returns", () => {
  mount(<EventProgramIsland eventId={EVENT} preload={rich()} locale="es" />, (host) => {
    const trigger = host.querySelector<HTMLButtonElement>('button[data-testid="event-program-item"]');
    assert.ok(trigger, "the row is a button");
    assert.equal(trigger!.getAttribute("aria-haspopup"), "dialog");
    assert.equal(trigger!.querySelector("a"), null, "no link inside the trigger");
    assert.equal(trigger!.querySelector('[data-testid="event-program-cta"]')?.textContent, "Reservar lugar", "an empty label on a workshop reads Reservar lugar, as a cue");
    assert.equal(host.querySelector('[data-testid="event-program-drawer"]'), null);
    trigger!.focus();
    act(() => { trigger!.click(); });
    const drawer = host.querySelector<HTMLElement>('[data-testid="event-program-drawer"]');
    assert.ok(drawer, "the drawer opened");
    assert.equal(drawer!.getAttribute("role"), "dialog");
    assert.equal(drawer!.getAttribute("aria-modal"), "true");
    assert.equal(dom.window.document.body.style.overflow, "hidden", "scroll locked");
    assert.equal(host.querySelector<HTMLImageElement>('[data-testid="event-program-drawer-hero"]')?.getAttribute("src"), "https://cdn.example/ws.jpg");
    assert.equal(drawer!.querySelector(".ep-sheet-title")?.textContent, "Taller de luz");
    assert.match(drawer!.querySelector(".ep-sheet-kicker")?.textContent ?? "", /21:00 - 22:00 · Main/);
    assert.equal(drawer!.querySelector(".ep-sheet-name")?.textContent, "DJ Ana");
    assert.equal(drawer!.querySelector(".ep-sheet-bio")?.textContent, "Cancun house.");
    const links = Array.from(drawer!.querySelectorAll(".ep-sheet-links a")).map((a) => [a.textContent, a.getAttribute("href")]);
    assert.deepEqual(links, [["Ver perfil", "/t/ana"], ["Instagram", "https://www.instagram.com/ana/"], ["Sitio web", "https://ana.example"]]);
    assert.equal(drawer!.querySelector(".ep-sheet-desc")?.textContent, "Una hora con la luz.");
    assert.equal(drawer!.querySelector('[data-testid="event-program-drawer-video"]')?.getAttribute("src"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    assert.match(drawer!.querySelector('[data-testid="event-program-drawer-sponsor"]')?.textContent ?? "", /Con el apoyo de Brand/);
    assert.equal(drawer!.querySelector('[data-testid="event-program-drawer-sponsor"] a')?.getAttribute("href"), "https://brand.example");
    const cta = drawer!.querySelector('[data-testid="event-program-drawer-cta"]');
    assert.equal(cta?.textContent, "Reservar lugar");
    assert.equal(cta?.getAttribute("href"), "https://tickets.example/ws");
    // Gallery: tapping a thumb swaps the hero.
    const thumbs = Array.from(drawer!.querySelectorAll<HTMLButtonElement>('[data-testid="event-program-drawer-thumb"]'));
    assert.equal(thumbs.length, 2);
    act(() => { thumbs[1]!.click(); });
    assert.equal(host.querySelector<HTMLImageElement>('[data-testid="event-program-drawer-hero"]')?.getAttribute("src"), "https://cdn.example/g2.jpg");
    assert.equal(host.querySelectorAll('[data-testid="event-program-drawer-thumb"]')[1]!.getAttribute("data-on"), "1");
    // Escape closes, scroll unlocks, focus returns to the trigger.
    act(() => { dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(host.querySelector('[data-testid="event-program-drawer"]'), null, "Escape closed it");
    assert.equal(dom.window.document.body.style.overflow, "", "scroll unlocked");
    assert.equal(dom.window.document.activeElement, trigger, "focus returned to the row");
  });
});

test("drawer: the scrim and the close button close it; authored CTA labels win; openDrawer=false keeps rows plain with real links", () => {
  mount(<EventProgramIsland eventId={EVENT} preload={rich()} layout="cards" />, (host) => {
    const triggers = host.querySelectorAll<HTMLButtonElement>('button[data-testid="event-program-item"]');
    assert.equal(triggers.length, 2, "cards are triggers too");
    act(() => { triggers[1]!.click(); });
    assert.equal(host.querySelector('[data-testid="event-program-drawer-cta"]')?.textContent, "Buy the record", "the authored label wins");
    act(() => { (host.querySelector('[data-testid="event-program-drawer-scrim"]') as HTMLElement).click(); });
    assert.equal(host.querySelector('[data-testid="event-program-drawer"]'), null, "the scrim closed it");
    act(() => { triggers[0]!.click(); });
    act(() => { (host.querySelector('[data-testid="event-program-drawer-close"]') as HTMLElement).click(); });
    assert.equal(host.querySelector('[data-testid="event-program-drawer"]'), null, "the close button closed it");
  });
  mount(<EventProgramIsland eventId={EVENT} preload={rich()} openDrawer={false} locale="en" />, (host) => {
    assert.equal(host.querySelector('button[data-testid="event-program-item"]'), null, "no trigger");
    assert.equal(host.querySelector('a[data-testid="event-program-cta"]')?.getAttribute("href"), "https://tickets.example/ws", "the CTA is a real link in the row");
    assert.equal(host.querySelector('a[data-testid="event-program-cta"]')?.textContent, "Reserve a spot");
    assert.equal(host.querySelector(".ep-performer a")?.getAttribute("href"), "/t/ana", "the profile link is back in the row");
  });
  mount(<EventProgramIsland eventId={EVENT} preload={rich()} showLinks={false} openDrawer={false} />, (host) => {
    assert.equal(host.querySelector('[data-testid="event-program-cta"]'), null, "showLinks=false hides the CTA");
  });
});

test("drawer: never in compact or schedule; lineup tiles open it", () => {
  for (const layout of ["compact", "schedule"] as const) {
    mount(<EventProgramIsland eventId={EVENT} preload={rich()} layout={layout} />, (host) => {
      assert.equal(host.querySelector('button[data-testid="event-program-item"]'), null, `${layout}: no trigger`);
      assert.equal(host.querySelector('[aria-haspopup="dialog"]'), null);
    });
  }
  mount(<EventProgramIsland eventId={EVENT} preload={rich()} layout="lineup" />, (host) => {
    const trigger = host.querySelector<HTMLButtonElement>(".ep-tile button.ep-trigger[aria-haspopup=\"dialog\"]");
    assert.ok(trigger, "the tile is a trigger");
    assert.equal(host.querySelector("a.ep-tile-link"), null, "the profile link moved into the drawer");
    act(() => { trigger!.click(); });
    assert.ok(host.querySelector('[data-testid="event-program-drawer"]'));
    assert.equal(host.querySelector('.ep-sheet-links a')?.getAttribute("href"), "/t/ana");
  });
});

test("space chips: groupBy=place with two spaces renders the chip row in every layout but schedule", () => {
  const staged = program({
    spaces: [{ id: "main", name: "Main", kind: "stage" }, { id: "patio", name: "Patio", kind: "space" }],
    items: [
      item({ id: "a", spaceId: "main", sessionId: "night-a", startsAt: "2026-11-22T01:00:00.000Z", performer: { name: "A", tba: false, profileHref: null, heroUrl: null, instagram: null, bio: null } }),
      item({ id: "b", spaceId: "patio", sessionId: "night-a", startsAt: "2026-11-22T01:00:00.000Z", performer: { name: "B", tba: false, profileHref: null, heroUrl: null, instagram: null, bio: null } }),
    ],
  });
  for (const layout of ["timeline", "cards", "lineup"] as const) {
    mount(<EventProgramIsland eventId={EVENT} preload={staged} layout={layout} />, (host) => {
      const chips = host.querySelector('[data-testid="event-program-space-chips"]');
      assert.ok(chips, `${layout}: auto resolves to place, chips render`);
      assert.deepEqual(Array.from(chips!.querySelectorAll(".ep-chip")).map((c) => c.textContent), ["Main", "Patio"]);
      assert.equal(host.querySelectorAll('[data-testid="event-program-group"]').length, 2);
    });
  }
  mount(<EventProgramIsland eventId={EVENT} preload={staged} layout="schedule" />, (host) => {
    assert.equal(host.querySelector('[data-testid="event-program-space-chips"]'), null, "the schedule grid has its columns instead");
    assert.equal(host.querySelectorAll('[data-testid="event-program-group"]').length, 1);
  });
});

test("a drawer-on row is styled by the same classes as a drawer-off row (the button only adds the reset class)", () => {
  const classesOf = (host: HTMLElement) => Array.from(host.querySelectorAll('[data-testid="event-program-item"]')).map((r) => Array.from(r.classList).filter((c) => c !== "ep-trigger").sort().join(" "));
  let on: string[] = [];
  let off: string[] = [];
  mount(<EventProgramIsland eventId={EVENT} preload={program()} openDrawer />, (host) => {
    on = classesOf(host);
    assert.ok(host.querySelector('button.ep-trigger[data-testid="event-program-item"]'));
  });
  mount(<EventProgramIsland eventId={EVENT} preload={program()} openDrawer={false} />, (host) => { off = classesOf(host); });
  assert.deepEqual(on, off);
  assert.ok(on.every((c) => c === "ep-item"));
  for (const layout of ["cards", "lineup"] as const) {
    let a: string[] = [];
    let b: string[] = [];
    mount(<EventProgramIsland eventId={EVENT} preload={program()} layout={layout} openDrawer />, (host) => { a = classesOf(host); });
    mount(<EventProgramIsland eventId={EVENT} preload={program()} layout={layout} openDrawer={false} />, (host) => { b = classesOf(host); });
    assert.deepEqual(a, b, `${layout}: same classes with and without the drawer`);
  }
});
