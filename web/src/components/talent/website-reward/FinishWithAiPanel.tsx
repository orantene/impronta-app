"use client";

/**
 * Finish with AI (spec §4.3 / mz_ai).
 * Visual contract: no large black chat bubbles. Assistant = plain ink text;
 * talent words = soft neutral bubble; draft = white "Intro · public" card.
 */

import { useEffect, useState, useTransition } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { aiWriteMyBio, loadMyBio, saveMyBio } from "@/lib/server-actions/ai-writing-helper";

const SUNK2 = "var(--color-admin-surface-alt, #F2F2EE)";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  locale: "en" | "es";
};

export function FinishWithAiPanel({ open, onClose, onSaved, locale }: Props) {
  const copy = useDashboardText();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setNotice(null);
    start(async () => {
      const loaded = await loadMyBio();
      const seed = loaded.ok ? loaded.text : "";
      if (seed.trim()) {
        setDraft(seed);
        return;
      }
      trackProductEvent("writing_helper_used", { surface: "finish_with_ai", op: "write", tone: null });
      const written = await aiWriteMyBio({ op: "write", tone: null, text: "", locale });
      setDraft(written.ok ? written.text : "");
    });
  }, [open, locale]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/25"
      data-testid="finish-with-ai-panel"
      data-finish-with-ai-chrome="1"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={copy.t("Finish with AI")}
        className="flex h-full w-full flex-col bg-white font-admin-body shadow-xl md:w-[480px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-admin-border-soft px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.t("Close")}
            className="text-[20px] leading-none text-admin-ink"
          >
            ←
          </button>
          <h2 className="text-[16px] font-semibold text-admin-ink">{copy.t("Finish with AI")}</h2>
        </header>

        <div className="flex-1 space-y-4 overflow-auto px-4 py-5">
          {/* Assistant: plain text — never a dark bubble (W21). */}
          <p
            data-testid="finish-with-ai-assistant"
            className="text-[14px] leading-relaxed text-admin-ink"
          >
            {copy.t("One thing left for your free website: a short intro clients will read.")}
          </p>

          {/* Talent words: soft sunk2 bubble, ink text. */}
          <div
            data-testid="finish-with-ai-user-bubble"
            className="max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed text-admin-ink"
            style={{ background: SUNK2 }}
          >
            {copy.t("Write a warm intro from what I already shared.")}
          </div>

          <div className="rounded-xl border border-admin-border-soft bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-admin-ink-dim">
              {copy.t("Intro · public")}
            </p>
            {editing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                maxLength={600}
                data-testid="finish-with-ai-draft-edit"
                className="mt-2 w-full resize-none rounded-lg border border-admin-border-soft bg-admin-surface-alt px-3 py-2 text-[14px] leading-relaxed text-admin-ink"
              />
            ) : (
              <p data-testid="finish-with-ai-draft" className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-admin-ink">
                {pending && !draft
                  ? copy.t("Writing…")
                  : draft || copy.t("No draft yet — tap Edit to write your own.")}
              </p>
            )}
          </div>

          {notice ? (
            <p className="text-[12.5px] text-admin-ink-muted" role="status">
              {notice}
            </p>
          ) : null}

          <p className="text-[12px] text-admin-ink-dim">
            {copy.t("Nothing is saved until you choose Use this intro.")}
          </p>
        </div>

        <div className="flex gap-2 border-t border-admin-border-soft px-4 py-4">
          <button
            type="button"
            disabled={pending || !draft.trim()}
            data-testid="finish-with-ai-use"
            onClick={() => {
              start(async () => {
                const r = await saveMyBio({ text: draft, locale });
                if (!r.ok) {
                  setNotice(copy.t("Try again"));
                  return;
                }
                onSaved();
                onClose();
              });
            }}
            className="flex-1 rounded-full bg-emerald-900 px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {copy.t("Use this intro")}
          </button>
          <button
            type="button"
            data-testid="finish-with-ai-edit"
            onClick={() => setEditing((v) => !v)}
            className="rounded-full border border-admin-border-soft bg-white px-4 py-3 text-[14px] font-semibold text-admin-ink"
          >
            {copy.t("Edit")}
          </button>
        </div>
      </aside>
    </div>
  );
}
