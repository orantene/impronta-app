"use client";

/**
 * THEME RELEASES (Phase 4): the What's new sheet. Bottom sheet on phones, side
 * panel from `sm` up. Focus trapped, Escape closes.
 *
 *   - release notes + items grouped (important fixes, automatic improvements,
 *     new blocks, layout changes) with EN/ES notes and screenshots
 *   - Preview on my site: the merge runs in memory (no save); the link opens
 *     her own draft with the update and the "kept your edits" line shows here
 *   - Add this block: its own button + placement picker, inserted into the draft
 *   - Apply N changes (automatic improvements + layout changes, never new
 *     blocks) / Not now
 */
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { useFocusTrap } from "@/components/support/use-focus-trap";
import { pick } from "@/lib/talent-site/history/copy";
import {
  GROUP_COPY,
  UPDATE_COPY,
  applyLabel,
  bannerTitle,
  changesLine,
  keptLine,
  keptRemovedLine,
  type UpdateLocale,
} from "@/lib/talent-site/theme-releases/talent-update/copy";
import {
  addThemeUpdateBlockAction,
  applyCriticalFixAction,
  previewThemeUpdateAction,
} from "@/lib/talent-site/theme-releases/talent-update/talent-update-actions";
import type { TalentUpdateNotice, UpdatePreview } from "@/lib/talent-site/theme-releases/talent-update/talent-update.server";
import type { PlacementOption, TalentReleaseItem } from "@/lib/talent-site/theme-releases/talent-update/view";

const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-admin-ink px-4 text-[14px] font-semibold text-white disabled:opacity-60";
const BTN_GHOST =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-admin-border-soft bg-white px-4 text-[14px] font-semibold text-admin-ink disabled:opacity-60";

export interface ThemeUpdateSheetProps {
  notice: TalentUpdateNotice;
  locale: UpdateLocale;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onApply: (draftRev: number) => void;
  onDismiss: () => void;
  onBlockAdded: (draftRev: number) => void;
}

export function ThemeUpdateSheet(props: ThemeUpdateSheetProps): ReactElement {
  const { notice, locale, busy, onClose } = props;
  const t = (k: keyof typeof UPDATE_COPY) => pick(UPDATE_COPY[k], locale);
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [preview, setPreview] = useState<UpdatePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [draftRev, setDraftRev] = useState(notice.draftRev);
  const titleId = `theme-update-title-${notice.updateId}`;

  useEffect(() => {
    let live = true;
    void previewThemeUpdateAction({ updateId: notice.updateId })
      .then((res) => {
        if (!live) return;
        if (res.ok) {
          setPreview(res.value);
          setDraftRev(res.value.draftRev);
        } else setPreviewError(res.error);
      })
      .catch(() => {
        if (live) setPreviewError(pick(UPDATE_COPY.failed, locale));
      });
    return () => {
      live = false;
    };
  }, [notice.updateId, locale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const notes = (locale === "es" ? notice.notes.es : notice.notes.en) || notice.notes.en || notice.notes.es;

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/30 sm:items-stretch sm:justify-end" onClick={onClose}>
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-theme-update-sheet
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-2xl bg-white font-admin-body shadow-xl sm:max-h-none sm:w-[440px] sm:rounded-none"
      >
        <header className="flex items-start gap-3 border-b border-admin-border-soft px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-[17px] font-semibold text-admin-ink">
              {bannerTitle(notice.designTitle, locale)}
            </h2>
            <p className="m-0 mt-0.5 text-[12.5px] text-admin-ink-muted">
              {t("whatsNew")} · {t("version")} {notice.fromVersion} → {notice.toVersion}
            </p>
          </div>
          <button type="button" onClick={onClose} className={`${BTN_GHOST} shrink-0`} aria-label={t("close")}>
            {t("close")}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {notes ? <p className="m-0 mb-4 text-[14px] leading-relaxed text-admin-ink">{notes}</p> : null}

          <section aria-live="polite" className="mb-5 rounded-xl border border-admin-border-soft bg-admin-surface-alt p-4" data-theme-update-preview>
            {preview ? (
              preview.noBase ? (
                <p className="m-0 text-[14px] font-semibold text-admin-ink" data-theme-update-no-base>
                  {t("noBase")}
                </p>
              ) : (
                <>
                  <p className="m-0 text-[14px] font-semibold text-admin-ink">{changesLine(preview.summary, locale)}</p>
                  <p className="m-0 mt-1 text-[13px] text-admin-ink-muted" data-theme-update-kept>
                    {keptLine(preview.summary, locale)}
                  </p>
                  {keptRemovedLine(preview.summary, locale) ? (
                    <p className="m-0 mt-1 text-[13px] text-admin-ink-muted" data-theme-update-kept-removed>
                      {keptRemovedLine(preview.summary, locale)}
                    </p>
                  ) : null}
                  {preview.previewUrl ? (
                    <a href={preview.previewUrl} target="_blank" rel="noreferrer" className={`${BTN_GHOST} mt-3`} data-theme-update-preview-link>
                      {t("previewOnSite")}
                    </a>
                  ) : null}
                  <p className="m-0 mt-2 text-[12px] text-admin-ink-dim">{t("previewHint")}</p>
                </>
              )
            ) : (
              <p className="m-0 text-[13px] text-admin-ink-muted">{previewError ?? t("loading")}</p>
            )}
          </section>

          {(preview?.groups ?? []).map((g) => (
            <section key={g.group} className="mb-5" data-theme-update-group={g.group}>
              <h3 className="m-0 text-[14px] font-semibold text-admin-ink">{pick(GROUP_COPY[g.group], locale)}</h3>
              <p className="m-0 mb-2 text-[12px] text-admin-ink-muted">
                {locale === "es" ? GROUP_COPY[g.group].hintEs : GROUP_COPY[g.group].hintEn}
              </p>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {g.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    locale={locale}
                    updateId={notice.updateId}
                    placements={preview?.placements ?? []}
                    draftRev={draftRev}
                    disabled={busy}
                    onAdded={(rev) => {
                      setDraftRev(rev);
                      props.onBlockAdded(rev);
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="flex flex-col gap-2 border-t border-admin-border-soft px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {props.error ? (
            <p role="alert" className="m-0 text-[13px] text-admin-critical">
              {props.error}
            </p>
          ) : null}
          {preview?.noBase ? null : <p className="m-0 text-[12px] text-admin-ink-muted">{t("draftOnly")}</p>}
          <div className="flex flex-wrap gap-2">
            {preview?.noBase && preview.criticalFix ? (
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={busy}
                data-theme-update-apply-fix
                onClick={() => {
                  void applyCriticalFixAction({ updateId: notice.updateId, expectedDraftRev: draftRev })
                    .then((res) => {
                      if (res.ok) {
                        setDraftRev(res.value.draftRev);
                        setPreview((p) => (p ? { ...p, criticalFix: false, groups: p.groups.filter((g) => g.group !== "critical") } : p));
                        props.onBlockAdded(res.value.draftRev);
                      } else setPreviewError(res.error);
                    })
                    .catch(() => setPreviewError(t("failed")));
                }}
              >
                {t("applyFix")}
              </button>
            ) : null}
            {preview?.hasApplicable ? (
              <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => props.onApply(draftRev)} data-theme-update-apply>
                {busy ? t("applying") : applyLabel(preview ? preview.summary.applied + preview.summary.added : null, locale)}
              </button>
            ) : null}
            <button type="button" className={BTN_GHOST} disabled={busy} onClick={props.onDismiss} data-theme-update-dismiss>
              {t("notNow")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function ItemRow(p: {
  item: TalentReleaseItem;
  locale: UpdateLocale;
  updateId: string;
  placements: PlacementOption[];
  draftRev: number;
  disabled: boolean;
  onAdded: (draftRev: number) => void;
}): ReactElement {
  const { item, locale } = p;
  const t = (k: keyof typeof UPDATE_COPY) => pick(UPDATE_COPY[k], locale);
  const [picking, setPicking] = useState(false);
  const [after, setAfter] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const note = (locale === "es" ? item.noteEs : item.noteEn) || item.noteEn || item.noteEs || item.key;
  const canPlace = item.type === "new-block" && (item.tree === null || item.tree === "home");
  const groupName = `theme-update-place-${item.id}`;

  async function add(): Promise<void> {
    setSaving(true);
    setMsg(null);
    const res = await addThemeUpdateBlockAction({
      updateId: p.updateId,
      itemId: item.id,
      afterId: after === "" ? null : after,
      expectedDraftRev: p.draftRev,
    }).catch(() => null);
    setSaving(false);
    if (res && res.ok) {
      setPicking(false);
      setMsg(t("blockAdded"));
      p.onAdded(res.value.draftRev);
    } else setMsg(res?.error ?? t("failed"));
  }

  return (
    <li className="min-w-0 rounded-xl border border-admin-border-soft p-3" data-theme-update-item={item.type}>
      <p className="m-0 break-words text-[13.5px] text-admin-ink">{note}</p>
      {item.screenshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-provided https screenshot, any host
        <img src={item.screenshotUrl} alt={t("screenshotAlt")} loading="lazy" className="mt-2 h-auto max-w-full w-full rounded-lg border border-admin-border-soft" />
      ) : null}
      {item.type === "new-block" ? (
        picking ? (
          <fieldset className="m-0 mt-3 border-0 p-0" data-theme-update-placement>
            <legend className="mb-1 text-[13px] font-semibold text-admin-ink">{t("placeAfter")}</legend>
            {canPlace ? (
              <div className="flex max-h-[40dvh] flex-col gap-1 overflow-y-auto">
                <label className="flex min-h-11 items-center gap-2 text-[13px] text-admin-ink">
                  <input type="radio" className="size-5 shrink-0" name={groupName} value="" checked={after === ""} onChange={() => setAfter("")} />
                  {t("placeTop")}
                </label>
                {p.placements.map((o) => (
                  <label key={o.afterId} className="flex min-h-11 items-center gap-2 text-[13px] text-admin-ink">
                    <input type="radio" className="size-5 shrink-0" name={groupName} value={o.afterId} checked={after === o.afterId} onChange={() => setAfter(o.afterId)} />
                    <span className="min-w-0 break-words">{o.label}</span>
                  </label>
                ))}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={BTN_PRIMARY} disabled={saving || p.disabled} onClick={() => void add()} data-theme-update-add-confirm>
                {t("addHere")}
              </button>
              <button type="button" className={BTN_GHOST} onClick={() => setPicking(false)}>
                {t("cancel")}
              </button>
            </div>
          </fieldset>
        ) : (
          <button type="button" className={`${BTN_GHOST} mt-3`} disabled={p.disabled} onClick={() => setPicking(true)} data-theme-update-add-block>
            {t("addBlock")}
          </button>
        )
      ) : null}
      {msg ? (
        <p role="status" className="m-0 mt-2 text-[12.5px] text-admin-ink-muted">
          {msg}
        </p>
      ) : null}
    </li>
  );
}
