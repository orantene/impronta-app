"use client";

/**
 * SchedulePublishForm — the embeddable "publish later" form.
 *
 * Extracted from `schedule-drawer.tsx` so the Publish drawer's Schedule tab
 * can host the SAME load/schedule/cancel contract inline (one place to
 * publish now OR later), while the standalone ScheduleDrawer keeps working
 * for its own entry points. The datetime helpers are exported and shared —
 * the drawer imports them from here instead of keeping copies.
 *
 * PAGE SCOPE: identical to the drawer — every action carries `pageId` +
 * `pageSlug` from `EditContext`, falling back to the tenant homepage row
 * when the surface mounts without them (the storefront homepage case).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { safeAction } from "@/lib/site-admin/edit-mode/safe-action";
import {
  cancelScheduledPublishAction,
  loadScheduledPublishAction,
  schedulePublishAction,
} from "@/lib/site-admin/edit-mode/schedule-actions";
import { CHROME } from "./kit";
import {
  scheduleDrawerControlState,
  scheduleLoadKey,
  shouldRunScheduleLoad,
} from "./schedule-drawer-load-gate";
import { useEditContext } from "./edit-context";
import { useEditorLocale } from "./use-editor-locale";

type FormState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "saving" }
  | { kind: "success" };

/** Convert ISO UTC → `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`. */
export function isoToLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Convert local input value → ISO UTC. Returns null on parse failure. */
export function localInputValueToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Friendly "Apr 27, 2026 · 9:30 AM" display. */
export function formatScheduledFor(iso: string): string {
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
export function defaultPickerValue(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const minutes = d.getMinutes();
  const rounded = Math.ceil(minutes / 5) * 5;
  d.setMinutes(rounded === 60 ? 0 : rounded);
  if (rounded === 60) d.setHours(d.getHours() + 1);
  d.setSeconds(0, 0);
  return isoToLocalInputValue(d.toISOString());
}

interface SchedulePublishFormProps {
  /**
   * Load the current schedule only while the host surface shows this form
   * (the Publish drawer's Schedule tab). Mirrors the drawer's open-gate.
   */
  active: boolean;
}

export function SchedulePublishForm({ active }: SchedulePublishFormProps) {
  const ctx = useEditContext();
  const { t } = useEditorLocale();
  const locale = ctx.locale;
  const pageId = ctx.pageId ?? null;
  const pageSlug = ctx.pageSlug ?? null;

  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [pickerValue, setPickerValue] = useState<string>("");
  const [minPublishIso, setMinPublishIso] = useState<string>(() =>
    new Date(Date.now() + 60_000).toISOString(),
  );
  const [currentSchedule, setCurrentSchedule] = useState<{
    iso: string | null;
    byName: string | null;
  }>({ iso: null, byName: null });
  // Identity-keyed load gate — same rationale as the drawer (cms pages hand
  // pageId/pageSlug down a tick late; see schedule-drawer-load-gate.ts).
  const loadedKeyRef = useRef<string | null>(null);
  const loadKey = scheduleLoadKey({ open: active, locale, pageId, pageSlug });

  useEffect(() => {
    if (!active) {
      loadedKeyRef.current = null;
      return;
    }
    if (!shouldRunScheduleLoad(loadedKeyRef.current, loadKey)) return;
    loadedKeyRef.current = loadKey;
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
          message:
            err instanceof Error
              ? err.message
              : "Couldn't load the schedule. Try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [active, locale, pageId, pageSlug, loadKey]);

  const handleSchedule = useCallback(async () => {
    const iso = localInputValueToIso(pickerValue);
    if (!iso) {
      setState({ kind: "error", message: t("Pick a valid date and time.") });
      return;
    }
    setState({ kind: "saving" });
    const res = await safeAction(
      () => schedulePublishAction({ locale, pageId, pageSlug, publishAt: iso }),
      {
        name: "schedulePublishAction",
        fallback: { ok: false as const, error: t("Network error. Try again.") },
      },
    );
    if (!res.ok) {
      setState({ kind: "error", message: res.error });
      return;
    }
    setCurrentSchedule({ iso: res.publishAt, byName: null });
    setState({ kind: "success" });
  }, [pickerValue, locale, pageId, pageSlug, t]);

  const handleCancelSchedule = useCallback(async () => {
    setState({ kind: "saving" });
    const res = await safeAction(
      () => cancelScheduledPublishAction({ locale, pageId, pageSlug }),
      {
        name: "cancelScheduledPublishAction",
        fallback: { ok: false as const, error: t("Network error. Try again.") },
      },
    );
    if (!res.ok) {
      setState({ kind: "error", message: res.error });
      return;
    }
    setCurrentSchedule({ iso: null, byName: null });
    setPickerValue(defaultPickerValue());
    setState({ kind: "idle" });
  }, [locale, pageId, pageSlug, t]);

  const { formDisabled } = scheduleDrawerControlState(state.kind);
  const errorMessage = state.kind === "error" ? state.message : null;
  const justSucceeded = state.kind === "success";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.5,
          color: CHROME.text2,
        }}
      >
        {currentSchedule.iso ? (
          <>
            {t("Currently scheduled for")}{" "}
            <span style={{ color: CHROME.ink, fontWeight: 600 }}>
              {formatScheduledFor(currentSchedule.iso)}
            </span>
            {currentSchedule.byName ? ` · ${currentSchedule.byName}` : null}
          </>
        ) : (
          t("No publish scheduled. Pick a future date and time below.")
        )}
      </p>
      <label
        htmlFor="publish-tab-schedule-at"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: CHROME.muted,
        }}
      >
        {t("Publish on")}
      </label>
      <input
        id="publish-tab-schedule-at"
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
      <p style={{ fontSize: 11.5, lineHeight: 1.5, color: CHROME.muted, margin: 0 }}>
        {t("The page publishes automatically once the time arrives. The fire time is your local timezone.")}
      </p>

      {errorMessage ? (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "9px 11px",
            fontSize: 12,
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
            padding: "9px 11px",
            fontSize: 12,
            color: CHROME.green,
            background: CHROME.greenBg,
            border: `1px solid ${CHROME.greenLine}`,
            borderRadius: 8,
          }}
        >
          {t("Schedule saved. The page will publish at the chosen time.")}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        {currentSchedule.iso ? (
          <button
            type="button"
            onClick={() => void handleCancelSchedule()}
            disabled={formDisabled}
            style={{
              padding: "7px 11px",
              fontSize: 12,
              fontWeight: 500,
              color: CHROME.rose,
              background: "transparent",
              border: `1px solid ${CHROME.roseLine}`,
              borderRadius: 8,
              cursor: formDisabled ? "not-allowed" : "pointer",
            }}
          >
            {t("Cancel scheduled publish")}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => void handleSchedule()}
          disabled={formDisabled || !pickerValue}
          style={{
            padding: "7px 13px",
            fontSize: 12,
            fontWeight: 600,
            color: "white",
            background: CHROME.accent,
            border: `1px solid ${CHROME.accent}`,
            borderRadius: 8,
            cursor: formDisabled || !pickerValue ? "not-allowed" : "pointer",
            opacity: formDisabled || !pickerValue ? 0.6 : 1,
          }}
        >
          {state.kind === "saving"
            ? t("Saving…")
            : currentSchedule.iso
              ? t("Update schedule")
              : t("Schedule publish")}
        </button>
      </div>
    </div>
  );
}
