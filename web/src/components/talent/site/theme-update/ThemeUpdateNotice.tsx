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
 * Actions: What's new (sheet), Not now (dismiss). Apply shows a post-apply
 * banner with an Unpublished pill + primary Publish site CTA (TUL-325);
 * nothing goes live until she publishes, and History can undo it.
 */
import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";

import { pick } from "@/lib/talent-site/history/copy";
import { isThemeApplyBusy, runThemeApply } from "@/lib/talent-site/history/apply-busy";
import {
  UPDATE_COPY,
  appliedToast,
  bannerTitle,
  bannerTitleAgain,
  quietEntryTitle,
  updateLocale,
} from "@/lib/talent-site/theme-releases/talent-update/copy";
import {
  applyThemeUpdateAction,
  dismissThemeUpdateAction,
  loadThemeUpdateNoticesAction,
} from "@/lib/talent-site/theme-releases/talent-update/talent-update-actions";
import type { TalentUpdateNotice } from "@/lib/talent-site/theme-releases/talent-update/talent-update.server";
import { publishMaxSiteAction } from "@/lib/talent-site/server/site-management-actions";
import { ThemeUpdateSheet } from "./ThemeUpdateSheet";

/**
 * F94 - the builder placement never sits over canvas controls (zoom HUD and the
 * first-paint tip live bottom-left; the inline text toolbar floats on the
 * canvas). It docks under the 60px top bar as a centred pill, and the card
 * opens directly beneath it, on phones too.
 */
export const BUILDER_PILL_CLASS =
  "fixed left-1/2 top-[68px] z-[250] inline-flex min-h-9 -translate-x-1/2 items-center rounded-full border border-admin-border-soft bg-white px-4 font-admin-body text-[13px] font-semibold text-admin-ink shadow-lg";
export const BUILDER_CARD_CLASS =
  "fixed inset-x-3 top-[112px] max-h-[60dvh] overflow-y-auto z-[250] mx-auto max-w-[360px] rounded-xl border border-admin-border-soft bg-white p-4 font-admin-body shadow-lg";

/** Survives the builder reload after Apply so the Publish CTA stays visible. */
const POST_APPLY_KEY = "tulala-theme-update-post-apply";

function readQueuedPostApply(): string | null {
  try {
    const v = window.sessionStorage.getItem(POST_APPLY_KEY);
    if (v) window.sessionStorage.removeItem(POST_APPLY_KEY);
    return v;
  } catch {
    return null;
  }
}

function queuePostApply(text: string): void {
  try {
    window.sessionStorage.setItem(POST_APPLY_KEY, text);
  } catch {
    /* the reload still shows the new draft */
  }
}

function openBuilderPublish(): void {
  const url = new URL(window.location.href);
  url.pathname = "/talent/page-builder";
  url.searchParams.set("panel", "publish");
  window.location.assign(url.toString());
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
  const [cardOpen, setCardOpen] = useState(false);
  const [postApply, setPostApply] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await loadThemeUpdateNoticesAction().catch(() => null);
    setNotice(res && res.ok ? (res.notices[0] ?? null) : null);
    return res && res.ok ? (res.notices[0] ?? null) : null;
  }, []);

  useEffect(() => {
    const queued = readQueuedPostApply();
    if (queued) setPostApply(queued);
    void load().then((n) => {
      if (n && new URLSearchParams(window.location.search).get("themeUpdate") === "open") setOpen(true);
    });
  }, [load]);

  const afterWrite = useCallback(
    (text: string) => {
      if (surface === "builder") {
        queuePostApply(text);
        window.location.reload();
        return;
      }
      setPostApply(text);
      void load();
    },
    [load, surface],
  );

  async function publishDraft(): Promise<void> {
    if (publishing || isThemeApplyBusy()) return;
    if (surface === "builder") {
      openBuilderPublish();
      return;
    }
    setPublishing(true);
    setError(null);
    const res = await publishMaxSiteAction().catch(() => null);
    setPublishing(false);
    if (res && res.ok) setPostApply(null);
    else setError(res && !res.ok ? res.error : t("failed"));
  }

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

  const postApplyEl = postApply ? (
    <div
      role="status"
      aria-live="polite"
      data-theme-update-toast
      data-theme-update-post-apply
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[310] mx-auto flex max-w-md flex-col gap-3 rounded-xl border border-admin-border-soft bg-white p-4 font-admin-body shadow-lg"
    >
      <span
        data-theme-update-unpublished
        className="inline-flex w-fit items-center gap-1.5 rounded-full border border-admin-border-soft bg-admin-surface-alt px-3 py-1 text-[12.5px] font-semibold text-admin-ink"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-admin-ink-dim" aria-hidden />
        {t("unpublishedPill")}
      </span>
      <p className="m-0 text-[14px] font-semibold text-admin-ink">{postApply}</p>
      {error && !notice ? (
        <p role="alert" className="m-0 text-[13px] text-admin-critical">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        data-theme-update-publish
        disabled={publishing}
        onClick={() => void publishDraft()}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[var(--tulala-primary-fill)] bg-[var(--tulala-primary-fill)] px-4 text-[14px] font-semibold text-white hover:border-[var(--tulala-primary-fill-deep)] hover:bg-[var(--tulala-primary-fill-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tulala-primary-fill)] disabled:opacity-60"
      >
        {publishing ? t("publishing") : t("publishCta")}
      </button>
    </div>
  ) : null;

  if (!notice) return postApplyEl;

  const again = notice.state === "undone";
  const title = again ? bannerTitleAgain(notice.designTitle, locale) : bannerTitle(notice.designTitle, locale);
  const floating = surface === "builder";
  const quiet = notice.state === "dismissed";
  return (
    <>
      {quiet ? (
        <section
          aria-label={title}
          data-theme-update-quiet={surface}
          className={floating ? "hidden" : "mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-admin-border-soft bg-white px-4 py-2 font-admin-body"}
        >
          <span className="text-[13.5px] text-admin-ink-muted">{quietEntryTitle(notice.designTitle, locale)}</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 items-center text-[13.5px] font-semibold text-admin-ink underline"
            data-theme-update-whats-new
          >
            {t("seeWhatsNew")}
          </button>
        </section>
      ) : (
      <>
      {floating ? (
        <button
          type="button"
          data-theme-update-pill
          aria-expanded={cardOpen}
          onClick={() => setCardOpen((v) => !v)}
          className={BUILDER_PILL_CLASS}
        >
          {t("pill")}
        </button>
      ) : null}
      {floating && !cardOpen ? null : (
      <section
        aria-label={title}
        data-theme-update-notice={surface}
        className={
          floating
            ? BUILDER_CARD_CLASS
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
            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--tulala-primary-fill)] bg-[var(--tulala-primary-fill)] px-4 text-[14px] font-semibold text-white hover:border-[var(--tulala-primary-fill-deep)] hover:bg-[var(--tulala-primary-fill-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tulala-primary-fill)]"
            data-theme-update-whats-new
          >
            {t("whatsNew")}
          </button>
          {again ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply(notice.draftRev)}
              className="inline-flex min-h-11 items-center rounded-lg border border-[var(--tulala-primary-fill)] bg-[var(--tulala-primary-fill)] px-4 text-[14px] font-semibold text-white hover:border-[var(--tulala-primary-fill-deep)] hover:bg-[var(--tulala-primary-fill-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tulala-primary-fill)] disabled:opacity-60"
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
      )}
      </>
      )}
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
      {postApplyEl}
    </>
  );
}
