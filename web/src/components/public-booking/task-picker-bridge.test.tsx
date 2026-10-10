/**
 * Gridline G9b: task picker → booking bridge. Picking a task then tapping the
 * recommendation's action opens the shared booking sheet for the right
 * service, with the task pre-filled into an editable note, in all four modes
 * (instant, request, quote, inquiry), ES and EN. Nothing is sent before the
 * visitor submits; on submit the (edited) brief rides on the payload.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CatalogBookingSheet } from "./CatalogBookingSheet";
import { catalogBookingDraftPrefix } from "./catalog-booking-chat";
import { clearBookingResume, peekBookingResume, requestBookingResume } from "./booking-resume-store";
import { TaskPickerIsland } from "@/lib/site-admin/builder-node/task-picker-island";
import { buildTaskPickerModel } from "@/lib/site-admin/builder-node/task-picker-recommend";
import type { BuilderTaskPickerNode } from "@/lib/site-admin/builder-node/types";
import { blankOffering, type TalentOffering } from "@/lib/talent/offerings-types";
import { buildInquiryFormPayload } from "@/lib/talent/inquiry-form-payload";
import { clampTaskBrief, taskBriefFrom, TASK_NOTE_MAX } from "@/lib/talent/offering-task-brief";
import {
  clearPendingOffering,
  pendingOfferingPayload,
  setPendingOffering,
} from "@/app/t/[profileCode]/_chat/pending-offering-store";
/* eslint-enable import/first */

function offering(id: string, patch: Partial<TalentOffering>): TalentOffering {
  return {
    ...blankOffering("tp-1", "MXN", 0),
    id,
    title: id,
    talentProfileId: "tp-1",
    status: "published",
    visibility: "public",
    moderationState: "approved",
    amountCents: 55000,
    durationMinutes: 60,
    reserveMode: "free",
    allowPayInPerson: true,
    ...patch,
  };
}

const OFFERINGS: TalentOffering[] = [
  offering("rev", { title: "Revisión eléctrica", bookingMode: "instant", durationMinutes: 45 }),
  offering("lamp", { title: "Instalación de lámparas", bookingMode: "request" }),
  offering("tablero", { title: "Cambio de tablero", bookingMode: "request", priceType: "custom", priceDisplay: "quote", amountCents: null }),
  offering("emerg", { title: "Emergencia", bookingMode: "inquiry" }),
];

const TASKS: NonNullable<BuilderTaskPickerNode["props"]["tasks"]> = [
  { id: "breaker", label: "The breaker keeps tripping", labelEs: "Se bota el breaker", offeringId: "rev" },
  { id: "lamps", label: "Install lamps", labelEs: "Instalar lámparas", offeringId: "lamp" },
  { id: "panel", label: "Old panel", labelEs: "Tablero viejo", offeringId: "tablero" },
  { id: "sparks", label: "Sparks or burning smell", labelEs: "Chispas u olor a quemado", offeringId: "emerg" },
];

function model(locale: string) {
  return buildTaskPickerModel({
    props: { tasks: TASKS, defaultOfferingId: "rev" } as BuilderTaskPickerNode["props"],
    offerings: OFFERINGS,
    locale,
    confirmsByHand: false,
  });
}

type Payload = { brief?: { task_id?: string; task_label?: string; note?: string } };

function mount(locale: string, mode: "demo" | "live" = "demo") {
  const calls: Payload[] = [];
  const bookFn = async (p: unknown) => {
    calls.push(p as Payload);
    return { ok: true as const, inquiryId: "i", bookingId: "b", redirectPath: "/" };
  };
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <>
        <TaskPickerIsland model={model(locale)} locale={locale} confirmsByHand={false} bookingPosture="instant" />
        <CatalogBookingSheet
          locale={locale}
          mode={mode}
          tenantId={mode === "live" ? "tenant-1" : null}
          bookFn={bookFn as never}
          slotsFn={async () => ({ slots: ["2026-09-25T15:00:00.000Z"], timezone: "UTC" })}
        />
      </>,
    );
  });
  return {
    host,
    calls,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function pick(host: HTMLElement, taskId: string) {
  act(() => host.querySelector<HTMLButtonElement>(`[data-task-id="${taskId}"]`)!.click());
  act(() => host.querySelector<HTMLButtonElement>('[data-tp-action="primary"]')!.click());
}

/** React's change plugin does not fire from programmatic events here: call onChange. */
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps"))!;
  const props = (el as unknown as Record<string, { onChange: (e: { target: typeof el }) => void }>)[key];
  act(() => {
    setter.call(el, value);
    props.onChange({ target: el });
  });
}

const note = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>('[data-testid="cb-task-note"]');

const CASES = [
  { task: "breaker", mode: "instant", title: "Revisión eléctrica", es: "Se bota el breaker", en: "The breaker keeps tripping" },
  { task: "lamps", mode: "request", title: "Instalación de lámparas", es: "Instalar lámparas", en: "Install lamps" },
  { task: "panel", mode: "quote", title: "Cambio de tablero", es: "Tablero viejo", en: "Old panel" },
  { task: "sparks", mode: "inquiry", title: "Emergencia", es: "Chispas u olor a quemado", en: "Sparks or burning smell" },
] as const;

for (const c of CASES) {
  for (const locale of ["es", "en"] as const) {
    test(`${c.mode} (${locale}): task → action opens ${c.title} with the task pre-filled, nothing sent`, () => {
      const { host, calls, unmount } = mount(locale);
      const asks: Event[] = [];
      const onAsk = (e: Event) => asks.push(e);
      dom.window.addEventListener("tulala:ask-question", onAsk);
      pick(host, c.task);
      if (c.mode === "quote") {
        // Quote services use ask flow only — never the booking sheet.
        assert.equal(host.querySelector(".jb-back"), null, "quote never opens the booking sheet");
        assert.equal(asks.length, 1, "quote fires ask-question");
        assert.equal(calls.length, 0, "opening never sends anything");
        dom.window.removeEventListener("tulala:ask-question", onAsk);
        unmount();
        return;
      }
      const sheet = host.querySelector(".jb-back");
      assert.ok(sheet, "the booking sheet opened");
      assert.equal(host.querySelector(".jb-head h2")?.textContent, c.title, "right service");
      const field = note(host);
      assert.ok(field, "the task note field renders");
      assert.equal(field.value, c[locale], "pre-filled with the task");
      assert.equal(field.closest("label")?.getAttribute("data-catalog-task-note"), c.task);
      assert.match(
        field.closest("label")?.textContent ?? "",
        locale === "es" ? /¿Qué pasa\?/ : /What's going on\?/,
      );
      assert.equal(calls.length, 0, "opening never sends anything");
      dom.window.removeEventListener("tulala:ask-question", onAsk);
      unmount();
    });
  }
}

test("the default card (no task) opens the sheet with no note field", () => {
  const { host, unmount } = mount("es");
  act(() => host.querySelector<HTMLButtonElement>('[data-tp-action="primary"]')!.click());
  assert.equal(host.querySelector(".jb-head h2")?.textContent, "Revisión eléctrica");
  assert.equal(note(host), null);
  unmount();
});

test("a plain catalog open (no task) shows no note field: other designs unchanged", () => {
  const { host, unmount } = mount("es");
  act(() => {
    dom.window.dispatchEvent(
      new dom.window.CustomEvent("tulala:offering-instant", {
        detail: { offeringId: "x", talentProfileId: "tp-1", title: "Otro", kind: "service", priceType: "fixed", amountCents: 1000, currency: "MXN", durationMinutes: 30, allowPayInPerson: true, reserveMode: "free", depositPct: null, imageUrl: null, intent: "instant" },
      }),
    );
  });
  assert.ok(host.querySelector(".jb-back"));
  assert.equal(note(host), null);
  unmount();
});

test("the note is editable and the EDITED text is what the confirm sends (live)", async () => {
  const { host, calls, unmount } = mount("es", "live");
  pick(host, "breaker");
  typeInto(note(host)!, "Se bota el breaker de la cocina cuando uso el horno");
  assert.equal(calls.length, 0, "typing sends nothing");
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="choose"]')!.click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  act(() => host.querySelector<HTMLButtonElement>(".jb-times .jb-time")!.click());
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]')!.click());
  typeInto(host.querySelector<HTMLInputElement>('[data-testid="cb-name"]')!, "Vale Demo");
  typeInto(host.querySelector<HTMLInputElement>('[data-testid="cb-email"]')!, "vale@example.com");
  assert.equal(calls.length, 0, "still nothing before submit");
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]')!.click();
    await new Promise((r) => setTimeout(r, 60));
  });
  assert.equal(calls.length, 1, "submit sends once");
  assert.deepEqual(calls[0]!.brief, {
    task_id: "breaker",
    task_label: "Se bota el breaker",
    note: "Se bota el breaker de la cocina cuando uso el horno",
  });
  unmount();
});

test("a cleared note still sends the task as context, without a note", async () => {
  const { host, calls, unmount } = mount("en", "live");
  pick(host, "breaker");
  typeInto(note(host)!, "   ");
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="choose"]')!.click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  act(() => host.querySelector<HTMLButtonElement>(".jb-times .jb-time")!.click());
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]')!.click());
  typeInto(host.querySelector<HTMLInputElement>('[data-testid="cb-name"]')!, "Vale Demo");
  typeInto(host.querySelector<HTMLInputElement>('[data-testid="cb-email"]')!, "vale@example.com");
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]')!.click();
    await new Promise((r) => setTimeout(r, 60));
  });
  assert.deepEqual(calls[0]!.brief, { task_id: "breaker", task_label: "The breaker keeps tripping" });
  unmount();
});

test("booking state is never lost: the edited note survives a trip to the chat and back", async () => {
  clearBookingResume();
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  const handoffs: Array<{ detail: { note?: string | null } }> = [];
  act(() => {
    root.render(
      <>
        <TaskPickerIsland model={model("es")} locale="es" confirmsByHand={false} bookingPosture="instant" />
        <CatalogBookingSheet
          locale="es"
          mode="live"
          tenantId="tenant-1"
          showAsk
          onAsk={(h) => handoffs.push(h as never)}
          slotsFn={async () => ({ slots: [], timezone: "UTC" })}
        />
      </>,
    );
  });
  pick(host, "breaker");
  typeInto(note(host)!, "Se bota cada noche");
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="choose"]')!.click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
  act(() => host.querySelector<HTMLButtonElement>("[data-catalog-empty-ask]")?.click());
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0]!.detail.note, "Se bota cada noche", "the chat gets the edited note");
  assert.ok(peekBookingResume());
  act(() => requestBookingResume());
  act(() => host.querySelector<HTMLButtonElement>("[data-catalog-change-service]")?.click());
  assert.equal(note(host)?.value, "Se bota cada noche", "the note is kept on the way back");
  act(() => root.unmount());
  host.remove();
});

test("chat path: the sheet's brief lands on source_context.offering.brief; direct open keeps only the task", () => {
  const base = {
    offeringId: "emerg", talentProfileId: "tp-1", title: "Emergencia", kind: "service", priceType: "custom",
    amountCents: null, currency: "MXN", durationMinutes: null, allowPayInPerson: true,
    reserveMode: "free" as const, depositPct: null, imageUrl: null, intent: "request" as const,
    task: { id: "sparks", label: "Chispas u olor a quemado" }, note: "Chispas en el contacto del baño",
  };
  setPendingOffering({ ...base, selection: { totalCents: null } });
  assert.deepEqual(pendingOfferingPayload()?.brief, {
    task_id: "sparks", task_label: "Chispas u olor a quemado", note: "Chispas en el contacto del baño",
  });
  setPendingOffering(base);
  assert.deepEqual(pendingOfferingPayload()?.brief, { task_id: "sparks", task_label: "Chispas u olor a quemado" });
  clearPendingOffering();
  // The composer pre-fill is the note after the prefix, ES and EN; editable before send.
  assert.match(catalogBookingDraftPrefix(base, undefined, "es"), /^Consulta sobre Emergencia — Chispas en el contacto del baño$/);
  assert.match(catalogBookingDraftPrefix(base, undefined, "en"), /^Question about Emergencia — Chispas en el contacto del baño$/);
  assert.match(catalogBookingDraftPrefix({ ...base, task: null }, undefined, "es"), /— $/, "no task, prefix unchanged");
});

test("inquiry form path: the task rides on offering.brief through the funnel input", () => {
  const built = buildInquiryFormPayload(
    { name: "Vale Demo", email: "vale@example.com", message: "Chispas en el contacto" },
    {
      tenantSlug: "t", talentProfileId: "tp-1", talentProfileCode: "TAL-1", sourcePage: "/", locale: "es",
      lines: [{ offeringId: "emerg", title: "Emergencia", brief: taskBriefFrom({ id: "sparks", label: "Chispas" }, null) }],
    },
  );
  assert.ok(built.ok);
  assert.deepEqual(built.input.offering?.brief, { task_id: "sparks", task_label: "Chispas" });
});

test("server clamp: untrusted briefs are trimmed, bounded and dropped when empty", () => {
  assert.equal(clampTaskBrief(null), null);
  assert.equal(clampTaskBrief({ note: "   " }), null);
  const long = clampTaskBrief({ task_id: "x", note: "a".repeat(TASK_NOTE_MAX + 50) });
  assert.equal(long?.note?.length, TASK_NOTE_MAX);
  assert.deepEqual(clampTaskBrief({ task_label: 5 as never, note: " hi " }), { note: "hi" });
});
