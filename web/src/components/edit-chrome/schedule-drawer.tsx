"use client";

/**
 * Phase 12 — ScheduleDrawer.
 *
 * Implements builder-experience.html surface §21 (Schedule publish). Last
 * reconciled: 2026-04-25.
 *
 * Right-side drawer that lets staff schedule a future publish (or cancel
 * one). Mounted in `EditShell` next to the other drawers. Mutexed via
 * `EditContext.openSchedule()` so it doesn't visually stack.
 *
 * Loads current `cms_pages.scheduled_publish_at` on every open via
 * `loadScheduledPublishAction` so a stale form never shows. Submit calls
 * `schedulePublishAction({ publishAt })`. Cancel calls
 * `cancelScheduledPublishAction()` and closes.
 *
 * PAGE SCOPE: every call carries `pageId` + `pageSlug` from `EditContext`, the
 * same identity pair the revisions drawer routes on. Without them the actions
 * fall back to the tenant's homepage row — which is correct for the storefront
 * homepage (it mounts with no slug) and was silently WRONG for every other
 * surface before this: an operator scheduling an inner page scheduled the
 * homepage instead, and this drawer reported the homepage's fire time back.
 *
 * The actual cron firing is handled outside this drawer — see
 * `/api/cron/publish-scheduled` (follow-up). The drawer only owns the
 * "what time should this publish?" contract.
 *
 * Date+time UI: a single `<input type="datetime-local">`. Browsers render
 * a native picker (calendar + clock) and parse to a local-time string.
 * We convert to ISO/UTC at submit so the DB stores absolute time.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { safeAction } from "@/lib/site-admin/edit-mode/safe-action";
import {
  cancelScheduledPublishAction,
  loadScheduledPublishAction,
  schedulePublishAction,
} from "@/lib/site-admin/edit-mode/schedule-actions";
import {
  CHROME,
  Drawer,
  DrawerBody,
  DrawerFoot,
  DrawerHead,
} from "./kit";
import {
  scheduleDrawerControlState,
  scheduleLoadKey,
  shouldRunScheduleLoad,
} from "./schedule-drawer-load-gate";
import { useEditContext } from "./edit-context";

type FormState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "saving" }
  | { kind: "success" };

function ClockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Convert ISO UTC → `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`. */
function isoToLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Convert local input value → ISO UTC. Returns null on parse failure. */
function localInputValueToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Friendly "Apr 27, 2026 · 9:30 AM" display. */
function formatScheduledFor(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Default "1 hour from now" rounded up to the next 5-minute slot. */
function defaultPickerValue(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const minutes = d.getMinutes();
  const rounded = Math.ceil(minutes / 5) * 5;
  d.setMinutes(rounded === 60 ? 0 : rounded);
  if (rounded === 60) d.setHours(d.getHours() + 1);
  d.setSeconds(0, 0);
  return isoToLocalInputValue(d.toISOString());
}

export function ScheduleDrawer() {
  const ctx = useEditContext();
  const open = ctx.scheduleOpen;
  const onClose = ctx.closeSchedule;
  const locale = ctx.locale;
  const pageId = ctx.pageId ?? null;
  const pageSlug = ctx.pageSlug ?? null;

  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [pickerValue, setPickerValue] = useState<string>("");
  // React 19 strict purity: compute "earliest valid datetime" once at
  // mount via a lazy useState initializer. The lock-at-mount value is
  // refreshed each time the drawer opens (see useEffect below).
  const [minPublishIso, setMinPublishIso] = useState<string>(() =>
    new Date(Date.now() + 60_000).toISOString(),
  );
  const [currentSchedule, setCurrentSchedule] = useState<{
    iso: string | null;
    byName: string | null;
  }>({ iso: null, byName: null });
  // The identity the currently-loaded schedule belongs to. NOT a bare "have I
  // opened yet" boolean: cms pages hand `pageId` / `pageSlug` down a tick
  // AFTER the drawer opens, and a boolean latch made that second effect run
  // early-return after its own cleanup had already cancelled the first load —
  // stranding the drawer in "loading" with every control, including Escape and
  // Close, disabled. Keying on identity re-loads for the settled page instead.
  // See `schedule-drawer-load-gate.ts`.
  const loadedKeyRef = useRef<string | null>(null);
  const loadKey = scheduleLoadKey({ open, locale, pageId, pageSlug });

  // Reload schedule state whenever the drawer opens or the page it points at
  // changes. Avoids a stale form when the operator opens → closes → re-opens
  // after another teammate changed the schedule from another tab.
  useEffect(() => {
    if (!open) {
      loadedKeyRef.current = null;
      return;
    }
    if (!shouldRunScheduleLoad(loadedKeyRef.current, loadKey)) return;
    loadedKeyRef.current = loadKey;
    // Refresh the earliest-valid datetime when the drawer opens so a
    // long-lived session doesn't carry a stale "min" from the original
    // mount.
    setMinPublishIso(new Date(Date.now() + 60_000).toISOString());
    let cancelled = false;
    setState({ kind: "loading" });
    loadScheduledPublishAction({ locale, pageId, pageSlug })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: res.error });
          return;
        }
        setCurrentSchedule({
          iso: res.scheduledPublishAt,
          byName: res.scheduledByName,
        });
        setPickerValue(
          res.scheduledPublishAt
            ? isoToLocalInputValue(res.scheduledPublishAt)
            : defaultPickerValue(),
        );
        setState({ kind: "idle" });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Couldn't load the schedule. Try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, locale, pageId, pageSlug, loadKey]);

  const handleSchedule = useCallback(async () => {
    const iso = localInputValueToIso(pickerValue);
    if (!iso) {
      setState({ kind: "error", message: "Pick a valid date and time." });
      return;
    }
    setState({ kind: "saving" });
    // T3-1 — safeAction prevents the state from getting stuck on "saving"
    // if the network drops mid-call. Returns a typed error envelope the
    // existing render path already handles.
    const res = await safeAction(
      () => schedulePublishAction({ locale, pageId, pageSlug, publishAt: iso }),
      {
        name: "schedulePublishAction",
        fallback: { ok: false as const, error: "Network error. Try again." },
      },
    );
    if (!res.ok) {
      setState({ kind: "error", message: res.error });
      return;
    }
    setCurrentSchedule({ iso: res.publishAt, byName: null });
    setState({ kind: "success" });
  }, [pickerValue, locale, pageId, pageSlug]);

  const handleCancelSchedule = useCallback(async () => {
    setState({ kind: "saving" });
    const res = await safeAction(
      () => cancelScheduledPublishAction({ locale, pageId, pageSlug }),
      {
        name: "cancelScheduledPublishAction",
        fallback: { ok: false as const, error: "Network error. Try again." },
      },
    );
    if (!res.ok) {
      setState({ kind: "error", message: res.error });
      return;
    }
    setCurrentSchedule({ iso: null, byName: null });
    setPickerValue(defaultPickerValue());
    setState({ kind: "idle" });
  }, [locale, pageId, pageSlug]);

  if (!open) return null;

  // `formDisabled` covers the picker and the write buttons; `exitDisabled` is
  // narrower ON PURPOSE — only a real in-flight write may block an exit. These
  // used to be one flag that folded in `loading`, so a load that never
  // resolved locked Escape, the backdrop and Close along with the form.
  const { formDisabled, exitDisabled } = scheduleDrawerControlState(state.kind);
  const errorMessage = state.kind === "error" ? state.message : null;
  const justSucceeded = state.kind === "success";

  return (
    <Drawer
      kind="schedule"
      open={open}
      ariaLabelledBy="schedule-drawer-title"
      onRequestClose={exitDisabled ? undefined : onClose}
    >
      <DrawerHead
        titleId="schedule-drawer-title"
        icon={<ClockIcon />}
        title="Schedule publish"
        meta={
          currentSchedule.iso ? (
            <span>
              Currently scheduled for{" "}
              <span style={{ color: CHROME.text, fontWeight: 600 }}>
                {formatScheduledFor(currentSchedule.iso)}
              </span>
              {currentSchedule.byName ? ` · by ${currentSchedule.byName}` : null}
            </span>
          ) : (
            <span>No publish scheduled. Pick a future date and time below.</span>
          )
        }
        onClose={onClose}
      />
      <DrawerBody>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: "4px 2px 0",
          }}
        >
          <label
            htmlFor="schedule-publish-at"
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: CHROME.muted,
            }}
          >
            Publish on
          </label>
          <input
            id="schedule-publish-at"
            type="datetime-local"
            value={pickerValue}
            min={isoToLocalInputValue(minPublishIso)}
            onChange={(e) => setPickerValue(e.target.value)}
            disabled={formDisabled}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              lineHeight: 1.4,
              color: CHROME.ink,
              background: CHROME.surface2,
              border: `1px solid ${CHROME.controlBorder}`,
              borderRadius: 7,
              outline: "none",
              transition: "border-color 150ms, box-shadow 150ms",
            }}
          />
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              color: CHROME.muted,
              margin: 0,
            }}
          >
            The cron worker checks every minute and publishes the page once the
            time arrives. The fire time is your local timezone; we store UTC.
          </p>

          {errorMessage ? (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                padding: "10px 12px",
                fontSize: 13,
                color: CHROME.rose,
                background: CHROME.roseBg,
                border: `1px solid ${CHROME.roseLine}`,
                borderRadius: 8,
              }}
            >
              {errorMessage}
            </div>
          ) : null}

          {justSucceeded ? (
            <div
              role="status"
              style={{
                padding: "10px 12px",
                fontSize: 13,
                color: CHROME.green,
                background: CHROME.greenBg,
                border: `1px solid ${CHROME.greenLine}`,
                borderRadius: 8,
              }}
            >
              Schedule saved. The cron worker will publish at the chosen time.
            </div>
          ) : null}
        </div>
      </DrawerBody>
      <DrawerFoot>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            width: "100%",
          }}
        >
          {currentSchedule.iso ? (
            <button
              type="button"
              onClick={handleCancelSchedule}
              disabled={formDisabled}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 500,
                color: CHROME.rose,
                background: "transparent",
                border: `1px solid ${CHROME.roseLine}`,
                borderRadius: 8,
                cursor: formDisabled ? "not-allowed" : "pointer",
              }}
            >
              Cancel scheduled publish
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              // Deliberately `exitDisabled`, NOT `formDisabled`: a load in
              // flight must never be able to trap the operator in the drawer.
              disabled={exitDisabled}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 500,
                color: CHROME.text2,
                background: "transparent",
                border: `1px solid ${CHROME.lineMid}`,
                borderRadius: 8,
                cursor: exitDisabled ? "not-allowed" : "pointer",
              }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSchedule}
              disabled={formDisabled || !pickerValue}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: "white",
                background: CHROME.accent,
                border: `1px solid ${CHROME.accent}`,
                borderRadius: 8,
                cursor: formDisabled || !pickerValue ? "not-allowed" : "pointer",
                opacity: formDisabled || !pickerValue ? 0.6 : 1,
              }}
            >
              {state.kind === "saving" ? "Saving\u2026" : currentSchedule.iso ? "Update schedule" : "Schedule publish"}
            </button>
          </div>
        </div>
      </DrawerFoot>
    </Drawer>
  );
}
