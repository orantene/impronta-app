"use client";

/**
 * THEME RELEASES (Phase 4): "Maison v2 has an update" banner.
 *
 * Self-loading: renders nothing unless the talent has an update row in state
 * `available`. Two placements:
 *   - `presence`  a card at the top of My presence (/talent/site); the bell
 *                 entry deep-links here with `?themeUpdate=open`
 *   - `builder`   a floating card in the talent builder; after an apply the
 *                 page reloads so the editor opens on the new draft
 * Actions: What's new (sheet), Not now (dismiss). Apply shows the toast
 * "Update applied to your draft · we kept N of your edits"; nothing goes
 * live until she publishes, and History can undo it.
 */
import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";

import { pick } from "@/lib/talent-site/history/copy";
import { runThemeApply } from "@/lib/talent-site/history/apply-busy";
import {
  UPDATE_COPY,
  appliedToast,
  bannerTitle,
  bannerTitleAgain,
  updateLocale,
} from "@/lib/talent-site/theme-releases/talent-update/copy";
import {
  applyThemeUpdateAction,
  dismissThemeUpdateAction,
  loadThemeUpdateNoticesAction,
} from "@/lib/talent-site/theme-releases/talent-update/talent-update-actions";
import type { TalentUpdateNotice } from "@/lib/talent-site/theme-releases/talent-update/talent-update.server";
import { ThemeUpdateSheet } from "./ThemeUpdateSheet";

const TOAST_KEY = "tulala-theme-update-toast";
const TOAST_MS = 6_000;

function readQueuedToast(): string | null {
  try {
    const v = window.sessionStorage.getItem(TOAST_KEY);
    if (v) window.sessionStorage.removeItem(TOAST_KEY);
    return v;
  } catch {
    return null;
  }
}

function queueToast(text: string): void {
  try {
    window.sessionStorage.setItem(TOAST_KEY, text);
  } catch {
    /* the reload still shows the new draft */
  }
}

export function ThemeUpdateNotice({
  surface,
  locale: localeIn,
}: {
  surface: "presence" | "builder";
  locale?: string | null;
}): ReactElement | null {
  const locale = updateLocale(localeIn);
  const t = (k: keyof typeof UPDATE_COPY) => pick(UPDATE_COPY[k], locale);
  const [notice, setNotice] = useState<TalentUpdateNotice | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await loadThemeUpdateNoticesAction().catch(() => null);
    setNotice(res && res.ok ? (res.notices[0] ?? null) : null);
    return res && res.ok ? (res.notices[0] ?? null) : null;
  }, []);

  useEffect(() => {
    const queued = readQueuedToast();
    if (queued) setToast(queued);
    void load().then((n) => {
      if (n && new URLSearchParams(window.location.search).get("themeUpdate") === "open") setOpen(true);
    });
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const afterWrite = useCallback(
    (text: string) => {
      if (surface === "builder") {
        queueToast(text);
        window.location.reload();
        return;
      }
      setToast(text);
      void load();
    },
    [load, surface],
  );

  async function apply(draftRev: number): Promise<void> {
    if (!notice) return;
    setBusy(true);
    setError(null);
    const res = await runThemeApply(() =>
      applyThemeUpdateAction({ updateId: notice.updateId, expectedDraftRev: draftRev }),
    ).catch(() => null);
    setBusy(false);
    if (res && res.ok) {
      setOpen(false);
      afterWrite(appliedToast(res.value.kept, locale));
    } else setError(res?.error ?? t("failed"));
  }

  async function dismiss(): Promise<void> {
    if (!notice) return;
    setBusy(true);
    const res = await dismissThemeUpdateAction({ updateId: notice.updateId }).catch(() => null);
    setBusy(false);
    if (res && res.ok) {
      setOpen(false);
      setNotice(null);
    } else setError(res?.error ?? t("failed"));
  }

  const toastEl = toast ? (
    <div
      role="status"
      aria-live="polite"
      data-theme-update-toast
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[310] mx-auto max-w-md rounded-xl bg-admin-ink px-4 py-3 text-center text-[14px] font-semibold text-white shadow-lg"
    >
      {toast}
    </div>
  ) : null;

  if (!notice) return toastEl;

  const again = notice.state === "undone";
  const title = again ? bannerTitleAgain(notice.designTitle, locale) : bannerTitle(notice.designTitle, locale);
  const floating = surface === "builder";
  return (
    <>
      <section
        aria-label={title}
        data-theme-update-notice={surface}
        className={
          floating
            ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[250] max-h-[60dvh] overflow-y-auto rounded-xl border border-admin-border-soft bg-white p-4 font-admin-body shadow-lg sm:inset-x-auto sm:left-4 sm:w-[360px]"
            : "mb-5 min-w-0 rounded-xl border border-admin-border-soft bg-white p-4 font-admin-body"
        }
      >
        <p className="m-0 text-[15px] font-semibold text-admin-ink">{title}</p>
        <p className="m-0 mt-1 text-[13px] text-admin-ink-muted">{t(again ? "againBody" : "bannerBody")}</p>
        {error ? (
          <p role="alert" className="m-0 mt-2 text-[13px] text-admin-critical">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 items-center rounded-lg bg-admin-ink px-4 text-[14px] font-semibold text-white"
            data-theme-update-whats-new
          >
            {t("whatsNew")}
          </button>
          {again ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply(notice.draftRev)}
              className="inline-flex min-h-11 items-center rounded-lg bg-admin-ink px-4 text-[14px] font-semibold text-white disabled:opacity-60"
              data-theme-update-apply-again
            >
              {busy ? t("applying") : t("applyShort")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void dismiss()}
            className="inline-flex min-h-11 items-center rounded-lg border border-admin-border-soft bg-white px-4 text-[14px] font-semibold text-admin-ink disabled:opacity-60"
            data-theme-update-not-now
          >
            {t("notNow")}
          </button>
        </div>
      </section>
      {open ? (
        <ThemeUpdateSheet
          notice={notice}
          locale={locale}
          busy={busy}
          error={error}
          onClose={() => setOpen(false)}
          onApply={(rev) => void apply(rev)}
          onDismiss={() => void dismiss()}
          onBlockAdded={() => {
            if (surface === "builder") afterWrite(t("blockAdded"));
          }}
        />
      ) : null}
      {toastEl}
    </>
  );
}
