"use client";

/**
 * "Your bio" on the talent's Today page (Phase 9): the text as it is, five
 * helper buttons (write, rewrite, shorter, longer, tone), an editable box,
 * Save. Every helper call shows movement while it runs (2–6 s); a draft is a
 * draft until Save. Marked "AI draft, tap to change" while unsaved.
 */

import { useEffect, useState, useTransition } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { trackProductEvent } from "@/lib/analytics/track-client";
import type { WritingOp, WritingTone } from "@/lib/ai/writing-helper";
import { aiWriteMyBio, loadMyBio, saveMyBio } from "@/lib/server-actions/ai-writing-helper";

type Status = "loading" | "idle" | "writing" | "saving";

export function BioHelperCard() {
  const t = useT();
  const rawLocale = useDashboardLocale();
  const locale: "es" | "en" = rawLocale === "es" ? "es" : "en";
  const [status, setStatus] = useState<Status>("loading");
  const [saved, setSaved] = useState("");
  const [text, setText] = useState("");
  const [available, setAvailable] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // React 19 ignores state updates after unmount, so no mounted flag is needed.
  useEffect(() => {
    void loadMyBio().then((r) => {
      if (r.ok) {
        setSaved(r.text);
        setText(r.text);
        setStatus("idle");
      } else {
        setAvailable(false);
      }
    });
  }, []);

  if (!available) return null;

  const dirty = text.trim() !== saved.trim();
  const busy = status === "writing" || status === "saving" || pending;

  function run(op: WritingOp, tone: WritingTone | null = null) {
    if (busy) return;
    setNotice(null);
    setStatus("writing");
    trackProductEvent("writing_helper_used", { surface: "bio", op, tone });
    startTransition(async () => {
      const r = await aiWriteMyBio({ op, tone, text, locale });
      if (r.ok) {
        setText(r.text);
      } else {
        setNotice(
          r.code === "cap"
            ? t("dashboard.talent.bioHelper.capReached")
            : r.code === "ai_off"
              ? t("dashboard.talent.bioHelper.aiOff")
              : t("dashboard.talent.bioHelper.tryAgain"),
        );
      }
      setStatus("idle");
    });
  }

  function save() {
    if (busy || !dirty) return;
    setNotice(null);
    setStatus("saving");
    startTransition(async () => {
      const r = await saveMyBio({ text, locale });
      if (r.ok) {
        setSaved(text.trim());
        setText(text.trim());
        setNotice(t("dashboard.talent.bioHelper.saved"));
      } else {
        setNotice(r.code === "invalid" ? t("dashboard.talent.bioHelper.invalid") : t("dashboard.talent.bioHelper.tryAgain"));
      }
      setStatus("idle");
    });
  }

  const chip = (label: string, onClick: () => void, testId: string) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid={testId}
      className="rounded-full border border-admin-border-soft bg-white px-3 py-1.5 text-admin-12h font-semibold text-admin-ink disabled:opacity-50"
    >
      {label}
    </button>
  );

  return (
    <section
      data-testid="today-bio-helper"
      aria-busy={busy}
      className="flex w-full flex-col gap-3 rounded-[12px] border border-admin-border-soft bg-white px-3.5 py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-admin-ink text-[14px] font-semibold">{t("dashboard.talent.bioHelper.title")}</span>
        {dirty ? (
          <span className="rounded-full bg-admin-accent-soft px-2 py-0.5 text-admin-11h font-semibold text-admin-accent-deep">
            {t("dashboard.talent.bioHelper.draftMark")}
          </span>
        ) : null}
      </div>
      {status === "loading" ? (
        <div className="h-[72px] animate-pulse rounded-[10px] bg-admin-surface-alt" />
      ) : (
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            rows={4}
            maxLength={600}
            placeholder={t("dashboard.talent.bioHelper.placeholder")}
            data-testid="today-bio-text"
            className="w-full resize-none rounded-[10px] border border-admin-border-soft bg-admin-surface-alt px-3 py-2 text-[14px] leading-[1.5] text-admin-ink disabled:opacity-70"
          />
          {status === "writing" ? (
            <div className="absolute inset-0 grid place-items-center rounded-[10px] bg-white/70" data-testid="today-bio-writing">
              <span className="flex items-center gap-2 text-admin-12h font-semibold text-admin-ink">
                <span aria-hidden className="inline-block size-4 animate-spin rounded-full border-2 border-admin-accent border-t-transparent" />
                {t("dashboard.talent.bioHelper.writing")}
              </span>
            </div>
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {text.trim().length === 0
          ? chip(t("dashboard.talent.bioHelper.write"), () => run("write"), "bio-write")
          : chip(t("dashboard.talent.bioHelper.rewrite"), () => run("rewrite"), "bio-rewrite")}
        {text.trim().length > 0 ? chip(t("dashboard.talent.bioHelper.shorter"), () => run("shorten"), "bio-shorten") : null}
        {text.trim().length > 0 ? chip(t("dashboard.talent.bioHelper.longer"), () => run("expand"), "bio-expand") : null}
        {text.trim().length > 0 ? chip(t("dashboard.talent.bioHelper.warmer"), () => run("tone", "warm"), "bio-tone-warm") : null}
        {text.trim().length > 0 ? chip(t("dashboard.talent.bioHelper.professional"), () => run("tone", "professional"), "bio-tone-professional") : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-admin-11h text-admin-ink-muted" aria-live="polite">
          {notice ?? `${text.trim().length} / 600`}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          data-testid="bio-save"
          className="rounded-full bg-admin-accent px-3.5 py-1.5 text-admin-12h font-semibold text-white disabled:opacity-40"
        >
          {status === "saving" ? t("dashboard.talent.bioHelper.saving") : t("dashboard.talent.bioHelper.save")}
        </button>
      </div>
    </section>
  );
}
