/**
 * schedule-drawer-load-gate.test.ts — the Schedule drawer must never strand
 * itself in "loading", and a load must never disable the way out.
 *
 * THE BUG (live QA, page-scoped schedule work): opening Publish caret →
 * "Schedule publish…" on a cms page left the drawer PERMANENTLY stuck. The
 * header read "No publish scheduled", and the datetime input, the submit
 * button, the footer Close and Escape were all disabled. Only the header X
 * closed it; reopening then worked.
 *
 * Sequence that produced it — it needed BOTH defects to bite:
 *
 *   1. The load effect gated on a boolean `lastOpenRef` ("run once per open").
 *   2. cms pages hand `pageId` / `pageSlug` down a tick AFTER the drawer
 *      opens, and those props are in the effect's dep list. So the effect
 *      re-ran: its cleanup set `cancelled = true` (discarding the in-flight
 *      load's result), then the new run hit `if (lastOpenRef.current) return`
 *      and bailed without issuing a replacement. Nothing ever resolved state.
 *   3. The drawer folded `loading` into one `isSaving` flag that gated the
 *      form AND `onRequestClose` AND the footer Close — so an unresolvable
 *      load became a trap rather than a stalled form.
 *
 * The harness below mirrors React's effect contract exactly (cleanup then body,
 * ONLY when the dep tuple changes) and drives that real sequence.
 *
 * Test runner: node:test + node:assert/strict
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  scheduleDrawerControlState,
  scheduleLoadKey,
  shouldRunScheduleLoad,
  type ScheduleDrawerStateKind,
} from "./schedule-drawer-load-gate";

interface DrawerProps {
  open: boolean;
  locale: string;
  pageId?: string | null;
  pageSlug?: string | null;
}

/**
 * Minimal faithful model of the drawer's load effect. Re-runs cleanup + body
 * only when the dep tuple changes, exactly like React, so a test that passes
 * here could not pass by accident in the component.
 */
function createDrawerHarness(
  loader: (props: DrawerProps) => Promise<{ scheduledPublishAt: string | null }>,
  /** SELF-PROOF SWITCH — reinstate the boolean "run once per open" latch the
   *  bug came from, so the harness can be shown to REPRODUCE the deadlock.
   *  Without this, a passing test above only proves the harness is agreeable,
   *  not that it models the real failure. See the last test in this file. */
  useBooleanLatch = false,
) {
  let openedOnce = false;
  let loadedKey: string | null = null;
  let state: ScheduleDrawerStateKind = "idle";
  let scheduledPublishAt: string | null = null;
  let lastDeps: string | null = null;
  let cancelPrevious: (() => void) | null = null;
  const loads: DrawerProps[] = [];
  const settled: Promise<void>[] = [];

  function render(props: DrawerProps) {
    const deps = JSON.stringify([
      props.open,
      props.locale,
      props.pageId ?? null,
      props.pageSlug ?? null,
      scheduleLoadKey(props),
    ]);
    if (deps === lastDeps) return; // React: unchanged deps -> effect does not re-run
    lastDeps = deps;

    if (cancelPrevious) {
      cancelPrevious();
      cancelPrevious = null;
    }

    if (!props.open) {
      loadedKey = null;
      openedOnce = false;
      return;
    }
    const key = scheduleLoadKey(props);
    if (useBooleanLatch) {
      // The ORIGINAL, broken gate.
      if (openedOnce) return;
      openedOnce = true;
    } else if (!shouldRunScheduleLoad(loadedKey, key)) {
      return;
    }
    loadedKey = key;

    let cancelled = false;
    cancelPrevious = () => {
      cancelled = true;
    };
    state = "loading";
    loads.push({ ...props });
    settled.push(
      loader(props).then((res) => {
        if (cancelled) return;
        scheduledPublishAt = res.scheduledPublishAt;
        state = "idle";
      }),
    );
  }

  return {
    render,
    loads,
    flush: async () => {
      await Promise.all(settled);
    },
    get state() {
      return state;
    },
    get scheduledPublishAt() {
      return scheduledPublishAt;
    },
    get controls() {
      return scheduleDrawerControlState(state);
    },
  };
}

// ── the regression ─────────────────────────────────────────────────────────

test("identity settling AFTER open still resolves: load re-fires, state reaches idle, form re-enables", async () => {
  // This is the exact live-QA sequence on /p/<slug>?edit=1.
  const h = createDrawerHarness(async (props) => ({
    scheduledPublishAt: props.pageId === "wave2-canvas" ? "2026-08-16T09:00:00.000Z" : null,
  }));

  // 1. Drawer opens before the page identity has landed.
  h.render({ open: true, locale: "en", pageId: undefined, pageSlug: undefined });
  assert.equal(h.state, "loading");

  // 2. pageId / pageSlug arrive on the next render.
  h.render({ open: true, locale: "en", pageId: "wave2-canvas", pageSlug: "wave2-canvas" });

  await h.flush();

  assert.equal(
    h.state,
    "idle",
    "the drawer stayed in 'loading' after the identity settled — this is the deadlock: the effect's cleanup cancelled the first load and the re-run never issued a replacement",
  );
  assert.equal(h.controls.formDisabled, false, "the picker must be usable once the load resolves");
  assert.equal(h.controls.exitDisabled, false);
  assert.equal(
    h.scheduledPublishAt,
    "2026-08-16T09:00:00.000Z",
    "the resolved schedule must be the SETTLED page's, not the pre-identity load's",
  );
});

test("the second load is issued for the settled identity, not the empty one", async () => {
  const h = createDrawerHarness(async () => ({ scheduledPublishAt: null }));
  h.render({ open: true, locale: "en", pageId: undefined, pageSlug: undefined });
  h.render({ open: true, locale: "en", pageId: "wave2-canvas", pageSlug: "wave2-canvas" });
  await h.flush();

  assert.equal(h.loads.length, 2);
  assert.equal(h.loads[1]?.pageId, "wave2-canvas");
});

test("a stale in-flight load cannot overwrite the settled page's result", async () => {
  // The first load resolves LAST. Its `cancelled` flag must keep it from
  // writing the homepage's schedule over the cms page's.
  const resolvers: Array<(v: { scheduledPublishAt: string | null }) => void> = [];
  const h = createDrawerHarness(
    () => new Promise((res) => { resolvers.push(res); }),
  );
  h.render({ open: true, locale: "en", pageId: undefined, pageSlug: undefined });
  h.render({ open: true, locale: "en", pageId: "wave2-canvas", pageSlug: "wave2-canvas" });

  resolvers[1]?.({ scheduledPublishAt: "2026-08-16T09:00:00.000Z" }); // settled page
  resolvers[0]?.({ scheduledPublishAt: "1999-01-01T00:00:00.000Z" }); // stale, late
  await h.flush();

  assert.equal(h.scheduledPublishAt, "2026-08-16T09:00:00.000Z");
  assert.equal(h.state, "idle");
});

// ── gating rules ───────────────────────────────────────────────────────────

test("a re-render that changes nothing does not re-issue the load", async () => {
  const h = createDrawerHarness(async () => ({ scheduledPublishAt: null }));
  h.render({ open: true, locale: "en", pageId: "about", pageSlug: "about" });
  h.render({ open: true, locale: "en", pageId: "about", pageSlug: "about" });
  await h.flush();
  assert.equal(h.loads.length, 1);
});

test("closing and reopening re-loads, so a teammate's change is never shown stale", async () => {
  const h = createDrawerHarness(async () => ({ scheduledPublishAt: null }));
  h.render({ open: true, locale: "en", pageId: "about", pageSlug: "about" });
  await h.flush();
  h.render({ open: false, locale: "en", pageId: "about", pageSlug: "about" });
  h.render({ open: true, locale: "en", pageId: "about", pageSlug: "about" });
  await h.flush();
  assert.equal(h.loads.length, 2);
});

test("switching pages while the drawer is open re-loads for the new page", async () => {
  const h = createDrawerHarness(async () => ({ scheduledPublishAt: null }));
  h.render({ open: true, locale: "en", pageId: "about", pageSlug: "about" });
  h.render({ open: true, locale: "en", pageId: "contact", pageSlug: "contact" });
  await h.flush();
  assert.equal(h.loads.length, 2);
  assert.equal(h.loads[1]?.pageId, "contact");
});

test("the homepage's absent identity normalises, so null vs undefined vs '' never thrashes", async () => {
  const h = createDrawerHarness(async () => ({ scheduledPublishAt: null }));
  h.render({ open: true, locale: "en", pageId: null, pageSlug: null });
  h.render({ open: true, locale: "en", pageId: undefined, pageSlug: "" });
  await h.flush();
  assert.equal(
    h.loads.length,
    1,
    "the homepage re-issued its load on a cosmetic prop change — harmless but wasteful, and it would flicker the form disabled",
  );
});

test("a closed drawer issues no load", () => {
  assert.equal(scheduleLoadKey({ open: false, locale: "en", pageId: "about" }), null);
  assert.equal(shouldRunScheduleLoad(null, null), false);
});

// ── enablement: loading must never trap the operator ────────────────────────

test("loading disables the form but leaves every exit live", () => {
  const c = scheduleDrawerControlState("loading");
  assert.equal(c.formDisabled, true);
  assert.equal(
    c.exitDisabled,
    false,
    "loading disabled the exits — that is what turned a stalled load into a drawer the operator could not leave by Escape, backdrop or Close",
  );
});

test("saving is the only state allowed to block an exit", () => {
  assert.deepEqual(scheduleDrawerControlState("saving"), {
    formDisabled: true,
    exitDisabled: true,
  });
  for (const kind of ["idle", "error", "success"] as const) {
    assert.deepEqual(
      scheduleDrawerControlState(kind),
      { formDisabled: false, exitDisabled: false },
      `${kind} must leave the drawer fully interactive`,
    );
  }
});

test("an error state is escapable and retryable, not a dead end", () => {
  const c = scheduleDrawerControlState("error");
  assert.equal(c.formDisabled, false);
  assert.equal(c.exitDisabled, false);
});

// ── self-proof: the harness really does reproduce the deadlock ─────────────

test("SELF-PROOF: the old boolean latch strands the drawer in loading with every exit dead", async () => {
  // Same harness, same sequence, only the gate swapped back to the original
  // boolean. If this ever stops deadlocking, the harness has drifted and the
  // passing tests above are no longer evidence of anything.
  const h = createDrawerHarness(
    async () => ({ scheduledPublishAt: null }),
    /* useBooleanLatch */ true,
  );
  h.render({ open: true, locale: "en", pageId: undefined, pageSlug: undefined });
  h.render({ open: true, locale: "en", pageId: "wave2-canvas", pageSlug: "wave2-canvas" });
  await h.flush();

  assert.equal(h.state, "loading", "expected the old gate to strand the drawer");
  assert.equal(h.loads.length, 1, "the cancelled load was never replaced");
  assert.equal(h.controls.formDisabled, true);
  // And with the OLD merged flag, `loading` also killed the exits — the trap.
  // The predicate is a function taking the FULL union on purpose: the
  // assertion above narrows `h.state` to the literal "loading", and inlining
  // the comparison would make TS reject the `=== "saving"` arm as impossible.
  // We want the original two-armed predicate evaluated as the component wrote
  // it, not a narrowed rewrite of it.
  const oldIsSavingPredicate = (k: ScheduleDrawerStateKind) =>
    k === "saving" || k === "loading";
  const mergedIsSaving = oldIsSavingPredicate(h.state);
  assert.equal(
    mergedIsSaving,
    true,
    "the old isSaving predicate folded loading in, disabling Close, Escape and the backdrop",
  );
});

// ── static guards on the component ─────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
/** Scan code, not the prose that documents the bug. */
const DRAWER = readFileSync(resolve(HERE, "schedule-drawer.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("the drawer gates its load on identity, never on a boolean 'already opened' latch", () => {
  assert.ok(
    DRAWER.includes("shouldRunScheduleLoad(loadedKeyRef.current, loadKey)"),
    "the drawer stopped gating on the identity key — a boolean latch here is what stranded it in 'loading' once cms pages started passing pageId/pageSlug a tick after open",
  );
  assert.ok(
    !/lastOpenRef/.test(DRAWER),
    "the boolean lastOpenRef latch is back — its early-return fires AFTER the cleanup has cancelled the in-flight load, so nothing ever resolves the loading state",
  );
});

test("the drawer's exits are not gated on the form-busy flag", () => {
  assert.ok(
    DRAWER.includes("onRequestClose={exitDisabled ? undefined : onClose}"),
    "Escape / backdrop dismissal is gated on something other than exitDisabled — if that predicate includes 'loading', a stalled load locks the operator in",
  );
  assert.ok(
    !/isSaving/.test(DRAWER),
    "the merged isSaving flag is back; it folded 'loading' into the same predicate that disables Close and onRequestClose",
  );
  // The footer Close must use the narrow flag; the submit/cancel buttons the wide one.
  assert.ok(
    /onClick=\{onClose\}\s*disabled=\{exitDisabled\}/.test(DRAWER),
    "the footer Close button must be disabled by exitDisabled only",
  );
  assert.ok(
    DRAWER.includes("disabled={formDisabled || !pickerValue}"),
    "the submit button must stay disabled while the form is busy",
  );
});
