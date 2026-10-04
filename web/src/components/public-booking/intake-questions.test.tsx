/**
 * Gridline G13 (C4): per-service intake questions. Storage normalizer,
 * the four field types in the shared sheet for instant / request / inquiry,
 * answers carried on the brief into the funnel (sheet confirm, chat, inquiry
 * form), task pre-selection (G9b), and no change for services without questions.
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
import {
  clampIntakeRecords,
  formatIntakeBlock,
  intakeAnswerRecords,
  intakeDetail,
  normalizeIntakeQuestions,
  patchIntakeAttributes,
  preselectIntakeFromTask,
  type IntakeQuestion,
} from "@/lib/talent/offering-intake";
import { briefFromDetail, clampTaskBrief } from "@/lib/talent/offering-task-brief";
import { buildInquiryFormPayload } from "@/lib/talent/inquiry-form-payload";
import {
  clearPendingOffering,
  pendingOfferingPayload,
  setPendingOffering,
} from "@/app/t/[profileCode]/_chat/pending-offering-store";
/* eslint-enable import/first */

// The mockup's own brief for "Cambio de tablero", in its short-key shape.
const MOCKUP_BRIEF = [
  { k: "type", l: "Inmueble", type: "chips", opts: ["Casa", "Departamento", "Local"] },
  { k: "circ", l: "Circuitos aproximados", type: "select", opts: ["Hasta 6", "7 a 12", "Más de 12", "No sé"] },
  { k: "pic", l: "Foto del tablero actual", type: "upload", p: "Subir foto del tablero" },
  { k: "why", l: "¿Qué pasa?", type: "area", p: "Se bota, es de fusibles, huele a quemado" },
  { k: "col", l: "Colonia y municipio", p: "Ej. Cumbres, Monterrey" },
];
const QUESTIONS = normalizeIntakeQuestions(MOCKUP_BRIEF);

test("storage: attributes.intake normalizes the mockup brief, all five types", () => {
  assert.deepEqual(QUESTIONS.map((q) => [q.key, q.type]), [
    ["type", "chips"], ["circ", "select"], ["pic", "upload"], ["why", "area"], ["col", "text"],
  ]);
  assert.deepEqual(QUESTIONS[0]!.options, ["Casa", "Departamento", "Local"]);
  assert.equal(QUESTIONS[2]!.placeholder, "Subir foto del tablero");
  // Fail closed: no label, or chips without options, are dropped.
  assert.deepEqual(normalizeIntakeQuestions([{ type: "chips", label: "x" }, { label: "" }, 5, null]), []);
  assert.deepEqual(normalizeIntakeQuestions("nope"), []);
  // Editor write removes the key when empty, keeps other attributes.
  assert.deepEqual(patchIntakeAttributes({ where: ["client"], intake: QUESTIONS }, []), { where: ["client"] });
  assert.equal((patchIntakeAttributes({}, QUESTIONS).intake as IntakeQuestion[]).length, 5);
  assert.deepEqual(intakeDetail({}), {}, "no questions, no detail key");
});

test("answers: clamped to the question (chips/select only from options), unanswered dropped", () => {
  const recs = intakeAnswerRecords(QUESTIONS, {
    type: ["Casa", "Castillo"],
    circ: "Infinitos",
    pic: ["tablero.jpg"],
    why: "  Se bota  ",
    col: "",
  });
  assert.deepEqual(recs, [
    { key: "type", type: "chips", label: "Inmueble", value: ["Casa"] },
    { key: "pic", type: "upload", label: "Foto del tablero actual", value: ["tablero.jpg"] },
    { key: "why", type: "area", label: "¿Qué pasa?", value: "Se bota" },
  ]);
  assert.deepEqual(clampIntakeRecords([{ key: "a", type: "evil", label: "x", value: "y" }, { key: "b", type: "text", label: "B", value: "z".repeat(999) }])[0]!.value.length, 200);
  assert.deepEqual(clampTaskBrief({ intake: recs } as never)?.intake, recs, "server clamp keeps valid answers");
});

test("task pre-selects matching emergency chips (accent and case insensitive), never overwrites", () => {
  const qs = normalizeIntakeQuestions([
    { k: "what", l: "¿Qué pasa?", type: "chips", opts: ["Sin luz en toda la casa", "Sin luz en una zona", "Chispas", "Olor a quemado"] },
  ]);
  assert.deepEqual(preselectIntakeFromTask(qs, { label: "sin luz en UNA zona" }), { what: ["Sin luz en una zona"] });
  assert.deepEqual(preselectIntakeFromTask(qs, { label: "Chispas u olor a quemado" }), { what: ["Chispas", "Olor a quemado"] });
  assert.deepEqual(preselectIntakeFromTask(qs, { label: "Chispas" }, { what: [] }), { what: [] });
  assert.deepEqual(preselectIntakeFromTask(qs, null), {});
});

test("thread block reads in ES and EN", () => {
  const recs = intakeAnswerRecords(QUESTIONS, { type: ["Casa"], pic: ["t.jpg"] });
  assert.equal(formatIntakeBlock(recs, "es"), "Respuestas del cliente:\n- Inmueble: Casa\n- Foto del tablero actual: foto: t.jpg");
  assert.match(formatIntakeBlock(recs, "en"), /^Client's answers:\n- Inmueble: Casa/);
  assert.equal(formatIntakeBlock([], "es"), "");
});

// ── Sheet ────────────────────────────────────────────────────────────────

function detail(intent: "instant" | "request", extra: Record<string, unknown> = {}) {
  return {
    offeringId: "tablero", talentProfileId: "tp-1", title: "Cambio de tablero", kind: "service",
    priceType: "flat_package", amountCents: 120000, currency: "MXN", durationMinutes: 60,
    allowPayInPerson: true, reserveMode: "free", depositPct: null, imageUrl: null, intent,
    ...intakeDetail({ intake: MOCKUP_BRIEF }),
    ...extra,
  };
}

function mount(locale: string, mode: "demo" | "live" = "demo") {
  const calls: Array<{ brief?: { intake?: unknown } }> = [];
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <CatalogBookingSheet
        locale={locale}
        mode={mode}
        tenantId={mode === "live" ? "tenant-1" : null}
        bookFn={(async (p: unknown) => {
          calls.push(p as never);
          return { ok: true as const, inquiryId: "i", bookingId: "b", redirectPath: "/" };
        }) as never}
        slotsFn={async () => ({ slots: ["2026-09-25T15:00:00.000Z"], timezone: "UTC" })}
      />,
    );
  });
  const open = (event: string, d: unknown) =>
    act(() => {
      dom.window.dispatchEvent(new dom.window.CustomEvent(event, { detail: d }));
    });
  return { host, calls, open, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

function typeInto(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto =
    el.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype
      : el.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype
        : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps"))!;
  const props = (el as unknown as Record<string, { onChange: (e: { target: typeof el }) => void }>)[key];
  act(() => {
    setter.call(el, value);
    props.onChange({ target: el });
  });
}

const MODES = [
  { name: "instant", event: "tulala:offering-instant", d: () => detail("instant") },
  { name: "request", event: "tulala:offering-request", d: () => detail("request") },
  // Inquiry-shaped request still opens the sheet for intake; quote priceDisplay
  // is ask-flow only and must not be used here.
  { name: "inquiry", event: "tulala:offering-request", d: () => detail("request", { priceType: "custom", amountCents: null }) },
] as const;

for (const m of MODES) {
  for (const locale of ["es", "en"] as const) {
    test(`${m.name} (${locale}): chips, select, upload, area and text render on the first step`, () => {
      const { host, calls, open, unmount } = mount(locale);
      open(m.event, m.d());
      const box = host.querySelector("[data-catalog-intake]");
      assert.ok(box, "intake block renders");
      assert.match(box!.textContent ?? "", locale === "es" ? /Cuéntanos del trabajo/ : /Tell us about the job/);
      for (const t of ["chips", "select", "upload", "area", "text"]) {
        assert.ok(host.querySelector(`[data-intake-field="${t}"]`), `${t} renders`);
      }
      assert.equal(host.querySelectorAll('[data-intake-key="type"] .jb-chip').length, 3);
      assert.equal(host.querySelector('[data-intake-field="upload"] input[type="file"]')?.getAttribute("accept"), "image/jpeg,image/png,image/webp,image/gif");
      assert.equal(calls.length, 0);
      unmount();
    });
  }
}

test("a service without questions renders no intake block (designs unchanged)", () => {
  const { host, open, unmount } = mount("es");
  const { intake: _drop, ...plain } = detail("instant");
  void _drop;
  open("tulala:offering-instant", plain);
  assert.ok(host.querySelector(".jb-back"));
  assert.equal(host.querySelector("[data-catalog-intake]"), null);
  unmount();
});

test("a picked task pre-selects the matching chip in the sheet", () => {
  const { host, open, unmount } = mount("es");
  open("tulala:offering-request", detail("request", { task: { id: "house", label: "Casa" } }));
  const chip = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-intake-key="type"] .jb-chip')).find((b) => b.textContent === "Casa");
  assert.equal(chip?.getAttribute("aria-pressed"), "true");
  unmount();
});

test("live confirm: answers ride brief.intake on the one submit (nothing before)", async () => {
  const { host, calls, open, unmount } = mount("es", "live");
  open("tulala:offering-instant", detail("instant"));
  act(() => Array.from(host.querySelectorAll<HTMLButtonElement>('[data-intake-key="type"] .jb-chip')).find((b) => b.textContent === "Departamento")!.click());
  typeInto(host.querySelector<HTMLSelectElement>('[data-intake-key="circ"] select')!, "7 a 12");
  typeInto(host.querySelector<HTMLTextAreaElement>('[data-intake-key="why"] textarea')!, "Se bota de noche");
  assert.equal(calls.length, 0);
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="choose"]')!.click());
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  act(() => host.querySelector<HTMLButtonElement>(".jb-times .jb-time")!.click());
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]')!.click());
  typeInto(host.querySelector<HTMLInputElement>('[data-testid="cb-name"]')!, "Vale Demo");
  typeInto(host.querySelector<HTMLInputElement>('[data-testid="cb-email"]')!, "vale@example.com");
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]')!.click();
    await new Promise((r) => setTimeout(r, 60));
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.brief, {
    intake: [
      { key: "type", type: "chips", label: "Inmueble", value: ["Departamento"] },
      { key: "circ", type: "select", label: "Circuitos aproximados", value: "7 a 12" },
      { key: "why", type: "area", label: "¿Qué pasa?", value: "Se bota de noche" },
    ],
  });
  unmount();
});

test("chat path: pending offering carries intake on offering.brief (→ createInquiryFromIntent)", () => {
  const d = { ...detail("request"), answers: { type: ["Casa"] }, selection: { totalCents: null } };
  setPendingOffering(d as never);
  assert.deepEqual(pendingOfferingPayload()?.brief, {
    intake: [{ key: "type", type: "chips", label: "Inmueble", value: ["Casa"] }],
  });
  clearPendingOffering();
});

test("inquiry form path: intake rides offering.brief through the funnel input", () => {
  const d = { ...detail("request"), answers: { circ: "No sé" } };
  const built = buildInquiryFormPayload(
    { name: "Vale Demo", email: "vale@example.com", message: "Hola" },
    {
      tenantSlug: "t", talentProfileId: "tp-1", talentProfileCode: "TAL-1", sourcePage: "/", locale: "es",
      lines: [{ offeringId: "tablero", title: "Cambio de tablero", brief: briefFromDetail(d, false) }],
    },
  );
  assert.ok(built.ok);
  assert.deepEqual(built.input.offering?.brief, {
    intake: [{ key: "circ", type: "select", label: "Circuitos aproximados", value: "No sé" }],
  });
});
