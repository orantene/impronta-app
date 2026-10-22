"use client";

/**
 * TUL-1476 · The owner's short terms step on the three join paths (invite, Discover join
 * approval, direct add). Preset first: it loads the workspace's usual terms (its model's
 * defaults), so a busy owner just sends. The share, the model and exclusivity can be
 * edited; the rest is listed in plain words so the owner sees everything that is sent.
 *
 * Controlled: the parent keeps the value and passes it to its join action. `null` means
 * "send nothing" (still loading, owner skipped, or this user may not send terms).
 * `asFormFields` also renders `terms_*` hidden inputs for a plain <form> action.
 */
import { useEffect, useRef, useState } from "react";

import { defaultTermsForModel, WORK_MODELS, type WorkModel } from "@/lib/service-hub/terms";
import {
  isWorkModel,
  joinTermsInputFor,
  joinTermsCurrencyOptions,
  readJoinTerms,
  shareFieldFor,
  type JoinTermsInput,
  type JoinTermsLoadState,
} from "@/lib/service-hub/join-terms";
import { joinTermsCopy, joinTermsLocale, joinTermsRestLines, modelLabel } from "@/lib/service-hub/join-terms-copy";
import { loadJoinTermsDefaultsAction } from "@/lib/server-actions/join-terms";

type Load =
  | { kind: "loading" }
  | { kind: "ready"; defaultModel: WorkModel; workspaceCurrency: string | null }
  | { kind: "owner_only" }
  | { kind: "off" };

const fieldClass = "w-full rounded-admin-md border bg-white px-3 py-2 text-admin-13";

export function JoinTermsStep({
  tenantSlug,
  locale,
  value,
  onChange,
  asFormFields = false,
  onLoadState,
}: {
  tenantSlug: string;
  locale: string;
  value: JoinTermsInput | null;
  onChange: (next: JoinTermsInput | null) => void;
  asFormFields?: boolean;
  /** TUL-1690: tells the parent when the load settles, so Approve can wait for it. */
  onLoadState?: (state: JoinTermsLoadState) => void;
}) {
  const lang = joinTermsLocale(locale);
  const c = joinTermsCopy(lang);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  // The last values the owner had, so "Not now" then "Send terms" keeps their edits.
  const [draft, setDraft] = useState<JoinTermsInput | null>(null);

  // Latest onChange without re-running the load when the parent passes a new function.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const onLoadStateRef = useRef(onLoadState);
  useEffect(() => {
    onLoadStateRef.current = onLoadState;
  }, [onLoadState]);
  useEffect(() => {
    onLoadStateRef.current?.(load.kind);
  }, [load.kind]);

  useEffect(() => {
    let alive = true;
    void loadJoinTermsDefaultsAction(tenantSlug)
      .then((res) => {
        if (!alive) return;
        if (!res.ok) return setLoad({ kind: "off" });
        if (!res.canPropose) return setLoad({ kind: "owner_only" });
        // Rent currency: the workspace's explicit one, or none (the owner must pick).
        const start = joinTermsInputFor(res.defaultModel, res.workspaceCurrency);
        setDraft(start);
        onChangeRef.current(start);
        setLoad({ kind: "ready", defaultModel: res.defaultModel, workspaceCurrency: res.workspaceCurrency });
      })
      .catch(() => {
        if (alive) setLoad({ kind: "off" });
      });
    return () => {
      alive = false;
    };
  }, [tenantSlug]);

  if (load.kind === "off") return null;
  if (load.kind === "loading") {
    return <div className="text-admin-12h text-admin-ink-muted">{c.loading}</div>;
  }
  if (load.kind === "owner_only") {
    return (
      <div className="rounded-admin-md border bg-admin-surface-alt px-3 py-2 text-admin-12h text-admin-ink-muted">{c.ownerOnly}</div>
    );
  }

  const current = value ?? draft ?? joinTermsInputFor(load.defaultModel, load.workspaceCurrency);
  const sending = value?.send === true;
  const model: WorkModel = isWorkModel(current.model) ? current.model : load.defaultModel;
  const set = (patch: Partial<JoinTermsInput>) => {
    const next = { ...current, ...patch };
    setDraft(next);
    onChange(next);
  };
  const decision = readJoinTerms(current, load.defaultModel);
  const preview = decision.kind === "send" ? decision.terms : defaultTermsForModel(model);
  const shareField = shareFieldFor(model);
  const isMargin = defaultTermsForModel(model).shareKind === "margin";

  return (
    <section className="flex flex-col gap-3 rounded-admin-lg border bg-admin-surface-alt px-4 py-3" aria-label={c.title}>
      {asFormFields ? (
        <>
          <input type="hidden" name="terms_send" value={sending ? "1" : "0"} />
          <input type="hidden" name="terms_model" value={current.model} />
          <input type="hidden" name="terms_share_percent" value={current.sharePercent} />
          <input type="hidden" name="terms_share_amount" value={current.shareAmount} />
          <input type="hidden" name="terms_currency" value={current.currency} />
          <input type="hidden" name="terms_exclusive" value={current.exclusive ? "1" : "0"} />
        </>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="text-admin-13 font-semibold text-admin-ink">{c.title}</div>
        <div className="flex gap-1 rounded-admin-md bg-white p-0.5" role="group">
          {[
            { on: true, label: c.send },
            { on: false, label: c.skip },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              aria-pressed={sending === opt.on}
              onClick={() => set({ send: opt.on })}
              className={`rounded-admin-sm px-2.5 py-1 text-admin-12h ${sending === opt.on ? "bg-admin-ink text-white font-semibold" : "text-admin-ink-muted"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {sending ? (
        <>
          <p className="m-0 text-admin-12h text-admin-ink-muted">{c.intro}</p>

          <label className="flex flex-col gap-1">
            <span className="text-admin-12h font-semibold text-admin-ink-muted">{c.model}</span>
            <select
              className={fieldClass}
              value={model}
              onChange={(e) => {
                const m = e.target.value as WorkModel;
                const fresh = joinTermsInputFor(m, current.currency || load.workspaceCurrency);
                set({ model: m, sharePercent: fresh.sharePercent, shareAmount: "", exclusive: current.exclusive });
              }}
            >
              {WORK_MODELS.map((m) => (
                <option key={m} value={m}>
                  {modelLabel(m, lang)}
                </option>
              ))}
            </select>
          </label>

          {shareField === "percent" ? (
            <label className="flex flex-col gap-1">
              <span className="text-admin-12h font-semibold text-admin-ink-muted">{isMargin ? c.sharePercentMargin : c.sharePercent}</span>
              <input
                className={fieldClass}
                inputMode="decimal"
                value={current.sharePercent}
                onChange={(e) => set({ sharePercent: e.target.value })}
              />
            </label>
          ) : (
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-admin-12h font-semibold text-admin-ink-muted">{c.shareAmount}</span>
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  value={current.shareAmount}
                  onChange={(e) => set({ shareAmount: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-admin-12h font-semibold text-admin-ink-muted">{c.currency}</span>
                <select className={fieldClass} value={current.currency} onChange={(e) => set({ currency: e.target.value })}>
                  {current.currency ? null : (
                    <option value="" disabled>
                      {c.pickCurrency}
                    </option>
                  )}
                  {joinTermsCurrencyOptions(load.workspaceCurrency).map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label className="flex items-start gap-2">
            <input type="checkbox" checked={current.exclusive} onChange={(e) => set({ exclusive: e.target.checked })} className="mt-0.5" />
            <span className="flex flex-col">
              <span className="text-admin-13 text-admin-ink">{c.exclusive}</span>
              <span className="text-admin-12h text-admin-ink-muted">{c.exclusiveHint}</span>
            </span>
          </label>

          {decision.kind === "invalid" ? (
            <p className="m-0 text-admin-12h font-semibold text-admin-ink" role="alert">
              {c.invalid[decision.reason] ?? c.invalid.share_bps}
            </p>
          ) : null}

          <div className="flex flex-col gap-1">
            <span className="text-admin-12h font-semibold text-admin-ink-muted">{c.restTitle}</span>
            <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-admin-12h text-admin-ink">
              {joinTermsRestLines(preview, lang).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <p className="m-0 text-admin-12h text-admin-ink-muted">{c.pendingNote}</p>
        </>
      ) : null}
    </section>
  );
}
