"use client";

/**
 * Website settings > Policies and privacy.
 *
 * Reads facts from their single source (deposit, cancel window, where you
 * work, contact) and only ASKS two things: what happens on a late cancel or
 * no-show, and the arrival tolerance. A live numbered preview renders in ES
 * and EN from the same pure renderer the publish step stores. Publishing is
 * explicit: Review opens a sheet with a clause diff against the published
 * version, and Publish writes one immutable version row.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  LATE_CANCEL_REFUNDS,
  LATE_TOLERANCE_MAX_MIN,
  LATE_TOLERANCE_STEP_MIN,
  type LateCancelRefund,
  type PolicyAnswers,
} from "@/lib/talent-policies/answers";
import { loadPolicyScreen, publishPolicyAnswers, type PolicyScreenData } from "@/lib/talent-policies/actions";
import type { InPersonMethod, PolicyFacts } from "@/lib/talent-policies/facts";
import { TULALA_DOC_LINKS, diffPolicyText, renderPolicyText, type PolicyLocale } from "@/lib/talent-policies/render";
import { POLICIES_ES } from "./policies-copy";
import { ChoiceCard, SettingsCard, Stepper } from "./primitives";

export type PolicyEditTarget = "pay" | "self" | "chat";

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

const REFUND_LABEL: Record<LateCancelRefund, string> = {
  none: "The deposit is not returned",
  half: "Half of the deposit is returned",
  full: "Everything is returned",
};

const METHOD_LABEL: Record<InPersonMethod, string> = {
  cash: "Cash",
  transfer: "Bank transfer",
  card_terminal: "Card on your terminal",
};

function sameAnswers(a: PolicyAnswers, b: PolicyAnswers): boolean {
  return a.late_cancel_refund === b.late_cancel_refund && a.late_tolerance_min === b.late_tolerance_min;
}

type FactRow = { key: string; label: string; value: string; action: string; target: PolicyEditTarget | "services" };

function factRows(f: PolicyFacts, tt: (s: string) => string): FactRow[] {
  const places = f.where.map((w) =>
    w === "studio" ? tt("At your studio") : w === "client" ? tt("At the client's place") : tt("Online"),
  );
  const whereValue = [f.zone, ...places].filter(Boolean).join(" · ");
  const channels = [
    f.contact.chat ? tt("Chat") : null,
    f.contact.whatsapp ? "WhatsApp" : null,
    f.contact.email ? "Email" : null,
  ].filter(Boolean);
  return [
    {
      key: "deposit",
      label: tt("Payment when booking"),
      value: f.depositPct != null ? fill(tt("{pct}% deposit"), { pct: f.depositPct }) : tt("No deposit"),
      action: tt("Edit in Payments"),
      target: "pay",
    },
    {
      key: "methods",
      label: tt("Payment in person"),
      value: f.inPersonMethods.length > 0 ? f.inPersonMethods.map((m) => tt(METHOD_LABEL[m])).join(", ") : tt("Not set"),
      action: tt("Edit in Payments"),
      target: "pay",
    },
    {
      key: "cancel",
      label: tt("Cancelling and changes"),
      value: f.cancelHours != null ? fill(tt("Free until {h} h before"), { h: f.cancelHours }) : tt("Flexible"),
      action: tt("Edit in Client self-service"),
      target: "self",
    },
    { key: "where", label: tt("Where you work"), value: whereValue || tt("Not set"), action: tt("Edit in Services"), target: "services" },
    {
      key: "contact",
      label: tt("Contact"),
      value: channels.length > 0 ? channels.join(", ") : tt("Not set"),
      action: tt("Edit in Chat and inquiries"),
      target: "chat",
    },
  ];
}

export function PoliciesView({
  talentId,
  isSpanish,
  onBack,
  onEdit,
}: {
  talentId: string;
  isSpanish: boolean;
  onBack: () => void;
  onEdit: (target: PolicyEditTarget) => void;
}) {
  const tt = useMemo(() => (en: string) => (isSpanish ? (POLICIES_ES[en] ?? en) : en), [isSpanish]);
  const [data, setData] = useState<PolicyScreenData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [answers, setAnswers] = useState<PolicyAnswers | null>(null);
  const [previewLocale, setPreviewLocale] = useState<PolicyLocale>(isSpanish ? "es" : "en");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(false);
  const [justPublished, setJustPublished] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await loadPolicyScreen(talentId).catch(() => null);
      if (!live) return;
      if (!res || !res.ok) {
        setLoadError(true);
        return;
      }
      setData(res.data);
      setAnswers(res.data.answers);
    })();
    return () => {
      live = false;
    };
  }, [talentId]);

  const rendered = useMemo(
    () =>
      data && answers
        ? { es: renderPolicyText(data.facts, answers, "es"), en: renderPolicyText(data.facts, answers, "en") }
        : null,
    [data, answers],
  );

  const header = (proposed: boolean, version: number | null) => (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="min-h-[44px] shrink-0 pr-2 text-[14px] text-admin-ink-muted hover:text-admin-ink"
      >
        ‹ {tt("Settings")}
      </button>
      <h1 className="min-w-0 flex-1 text-[18px] font-semibold text-admin-ink">{tt("Policies and privacy")}</h1>
      {proposed ? (
        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-semibold tracking-wide text-amber-900">
          {tt("PROPOSED")}
        </span>
      ) : null}
      <span className="shrink-0 rounded-full bg-black/[0.05] px-2.5 py-1 text-[12px] font-semibold text-admin-ink-muted">
        {version != null ? fill(tt("Published · version {n}"), { n: version }) : tt("Not published yet")}
      </span>
    </div>
  );

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl px-4 font-admin-body">
        {header(false, null)}
        <p className="rounded-lg bg-red-50 px-3.5 py-3 text-[13.5px] text-red-800">
          {tt("Your settings could not load. Try again in a moment.")}
        </p>
      </div>
    );
  }
  if (!data || !answers || !rendered) {
    return (
      <div className="mx-auto max-w-xl px-4 font-admin-body">
        {header(false, null)}
        <p className="text-[13.5px] text-admin-ink-muted">{tt("Loading…")}</p>
      </div>
    );
  }

  const published = data.published;
  const nothingNew = published != null && published.textEs === rendered.es.text && published.textEn === rendered.en.text;
  const answersDirty = !sameAnswers(answers, data.answers);
  const nextVersion = (published?.version ?? 0) + 1;
  const preview = rendered[previewLocale];
  const changes = diffPolicyText(published ? (previewLocale === "es" ? published.textEs : published.textEn) : null, preview.text);

  async function publish() {
    if (!answers) return;
    setPublishing(true);
    setPublishError(false);
    const res = await publishPolicyAnswers(talentId, answers).catch(() => null);
    if (!res || !res.ok) {
      setPublishing(false);
      setPublishError(true);
      return;
    }
    const fresh = await loadPolicyScreen(talentId).catch(() => null);
    setPublishing(false);
    if (fresh && fresh.ok) {
      setData(fresh.data);
      setAnswers(fresh.data.answers);
    }
    setReviewOpen(false);
    setJustPublished(res.version);
  }

  const toggle = "min-h-[44px] flex-1 rounded-lg px-3 text-[13.5px] font-semibold";

  return (
    <div className="mx-auto max-w-xl px-4 font-admin-body">
      {header(!nothingNew, published?.version ?? null)}
      <p className="mb-3 text-[13.5px] text-admin-ink-muted">
        {tt("Your clients read these rules before they book. Most of it comes from settings you already have; you only answer the two questions below.")}
      </p>
      {justPublished != null ? (
        <p role="status" className="mb-3 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-900">
          {fill(tt("Published · version {n} is live."), { n: justPublished })}
        </p>
      ) : null}

      <SettingsCard title={tt("Taken from your settings")}>
        <ul className="m-0 list-none p-0">
          {factRows(data.facts, tt).map((row) => (
            <li key={row.key} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-admin-border-soft py-3 first:pt-0 last:border-b-0 last:pb-0">
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-admin-ink">{row.label}</span>
                <span className="mt-0.5 block text-[13.5px] text-admin-ink-muted">{row.value}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11.5px] font-semibold text-admin-ink-muted">
                  {tt("From your settings")}
                </span>
                {row.target === "services" ? (
                  <Link href="/talent/services" className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-emerald-900 underline">
                    {row.action}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => onEdit(row.target as PolicyEditTarget)}
                    className="min-h-[44px] text-[13px] font-semibold text-emerald-900 underline"
                  >
                    {row.action}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </SettingsCard>

      <SettingsCard title={tt("Your answers")}>
        <div role="radiogroup" aria-label={tt("If a client cancels late or does not show up")} className="grid gap-2">
          <p className="m-0 text-[13.5px] font-semibold text-admin-ink">{tt("If a client cancels late or does not show up")}</p>
          {data.facts.depositPct == null ? (
            <p data-policy-no-deposit-note="" className="m-0 text-[12.5px] text-admin-ink-muted">
              {tt("You take no deposit, so nothing is held. These choices apply once you ask for one.")}
            </p>
          ) : null}
          {LATE_CANCEL_REFUNDS.map((mode) => (
            <ChoiceCard
              key={mode}
              checked={answers.late_cancel_refund === mode}
              title={tt(REFUND_LABEL[mode])}
              detail={mode === "none" ? tt("Applies to cancellations inside your free window.") : undefined}
              onSelect={() => setAnswers({ ...answers, late_cancel_refund: mode })}
            />
          ))}
        </div>
        <div className="mt-3">
          <Stepper
            label={tt("Tolerance for arriving late")}
            detail={tt("After this the appointment can be shortened.")}
            value={answers.late_tolerance_min}
            display={`${answers.late_tolerance_min} min`}
            step={LATE_TOLERANCE_STEP_MIN}
            max={LATE_TOLERANCE_MAX_MIN}
            lessLabel={tt("Less")}
            moreLabel={tt("More")}
            onChange={(n) => setAnswers({ ...answers, late_tolerance_min: n })}
          />
        </div>
      </SettingsCard>

      <SettingsCard title={tt("How your clients will read it")}>
        <div role="group" aria-label={tt("Language of the preview")} className="mb-3 flex gap-2">
          {(["es", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={previewLocale === l}
              onClick={() => setPreviewLocale(l)}
              className={`${toggle} ${previewLocale === l ? "bg-emerald-900 text-white" : "border border-admin-border-soft bg-white text-admin-ink"}`}
            >
              {l === "es" ? tt("Spanish") : tt("English")}
            </button>
          ))}
        </div>
        <ol className="m-0 list-none space-y-3 p-0" data-policy-preview={previewLocale}>
          {preview.clauses.map((c) => (
            <li key={c.n} className="text-[13.5px] leading-relaxed text-admin-ink">
              <span className="font-semibold">
                {c.n}. {c.title}
              </span>
              <span className="mt-0.5 block break-words text-admin-ink-muted">{c.body}</span>
            </li>
          ))}
        </ol>
      </SettingsCard>

      <details className="mb-3 rounded-xl border border-admin-border-soft bg-white px-4 py-3">
        <summary className="flex min-h-[44px] cursor-pointer items-center text-[15px] font-semibold text-admin-ink">
          {tt("Privacy and documents")}
        </summary>
        <p className="mt-2 text-[13px] text-admin-ink-muted">
          {tt("Payments and personal data are covered by Tulala's own documents. They open on tulala.digital.")}
        </p>
        <ul className="mt-2 list-none space-y-1 p-0">
          {([["terms", "Terms of service"], ["privacy", "Privacy notice"]] as const).map(([k, label]) => (
            <li key={k}>
              <a
                href={TULALA_DOC_LINKS[k]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center text-[13.5px] font-semibold text-emerald-900 underline"
              >
                {tt(label)}
              </a>
            </li>
          ))}
        </ul>
      </details>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-admin-border-soft bg-white px-4 py-3 max-[720px]:bottom-[calc(64px+env(safe-area-inset-bottom,0px))] max-[720px]:pr-[76px]">
        {nothingNew ? <p className="mb-2 text-[12.5px] text-admin-ink-muted">{tt("Nothing new to publish.")}</p> : null}
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={!answersDirty}
            onClick={() => setAnswers(data.answers)}
            className="min-h-[44px] flex-1 rounded-lg border border-admin-border-soft bg-white px-4 text-[14px] font-semibold text-admin-ink disabled:opacity-40"
          >
            {tt("Discard")}
          </button>
          <button
            type="button"
            disabled={nothingNew}
            onClick={() => {
              setJustPublished(null);
              setReviewOpen(true);
            }}
            className="min-h-[44px] flex-[2] rounded-lg bg-emerald-900 px-4 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            {tt("Review and publish")}
          </button>
        </div>
      </div>

      {reviewOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button type="button" aria-label={tt("Keep editing")} onClick={() => !publishing && setReviewOpen(false)} className="absolute inset-0 bg-black/40" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={fill(tt("Publish version {n}?"), { n: nextVersion })}
            className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white px-5 pb-6 pt-5 font-admin-body shadow-xl"
          >
            <h2 className="text-[17px] font-semibold text-admin-ink">{fill(tt("Publish version {n}?"), { n: nextVersion })}</h2>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
              {published ? (
                <p className="m-0 text-[13.5px] text-admin-ink-muted">{tt("This is what changes for your clients:")}</p>
              ) : (
                <p className="m-0 text-[13.5px] text-admin-ink-muted">
                  {fill(tt("First version. Your clients will read all {n} points."), { n: preview.clauses.length })}
                </p>
              )}
              {published ? (
                <ul className="mt-2 list-none space-y-3 p-0">
                  {changes.map((c) => (
                    <li key={c.title} className="text-[13px]">
                      <span className="block font-semibold text-admin-ink">
                        {c.title}
                        {c.before == null ? ` · ${tt("New")}` : c.after == null ? ` · ${tt("Removed")}` : ""}
                      </span>
                      {c.before != null ? (
                        <span className="mt-0.5 block text-admin-ink-muted line-through">
                          {tt("Before")}: {c.before}
                        </span>
                      ) : null}
                      {c.after != null ? (
                        <span className="mt-0.5 block text-admin-ink">
                          {tt("After")}: {c.after}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {publishError ? (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">
                {tt("Could not publish. Try again in a moment.")}
              </p>
            ) : null}
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                disabled={publishing}
                onClick={() => void publish()}
                className="min-h-[44px] rounded-lg bg-emerald-900 text-[14px] font-semibold text-white disabled:opacity-60"
              >
                {publishing ? tt("Publishing") : fill(tt("Publish version {n}"), { n: nextVersion })}
              </button>
              <button
                type="button"
                disabled={publishing}
                onClick={() => setReviewOpen(false)}
                className="min-h-[44px] rounded-lg border border-admin-border-soft bg-white text-[14px] font-semibold text-admin-ink"
              >
                {tt("Keep editing")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
