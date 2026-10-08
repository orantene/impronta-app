"use client";

/**
 * "Ready to build" — the summary, the link name with availability (tap to
 * change), and one button. The account step follows (Phase 4).
 */

import { useEffect, useRef, useState } from "react";

import type { OnboardingPath } from "@/lib/onboarding/module-state";
import type { Understanding } from "@/lib/onboarding/understanding";
import type { LinkCheck } from "@/lib/server-actions/onboarding-module";

import { promisedHost, type DesignLookKey } from "@/lib/onboarding/finish-url";
import { DesignPick } from "./design-pick";
import { GhostLink, Notice, PrimaryButton, Sub, Title } from "../ui";

export function ReadyStep({
  t,
  understanding,
  path,
  linkSlug,
  linkAvailable,
  linkSuggestions,
  busy,
  onCheckLink,
  onBuild,
  designChoice = null,
  onPickDesign,
  onConfirmAge18,
  ageRequiredNotice = false,
}: {
  t: (key: string) => string;
  understanding: Understanding;
  path: OnboardingPath;
  linkSlug: string | null;
  linkAvailable: boolean | null;
  linkSuggestions: string[];
  busy: boolean;
  onCheckLink: (slug: string) => Promise<LinkCheck | null>;
  onBuild: () => void;
  /** 1D: talent looks (myself / both). */
  designChoice?: DesignLookKey | null;
  onPickDesign?: (look: DesignLookKey | null) => void;
  /** 18+ (owner decision 2026-10-01): records the confirmation; shown for myself / both only. */
  onConfirmAge18?: () => Promise<{ ok: boolean }>;
  /** The build route refused for a missing confirmation: say so here. */
  ageRequiredNotice?: boolean;
}) {
  const talentOnly = path === "talent";
  const needsAge = path !== "business" && !!onConfirmAge18;
  const [age18, setAge18] = useState(false);
  const [ageSaving, setAgeSaving] = useState(false);
  const [ageFailed, setAgeFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(linkSlug ?? understanding.linkName?.slug ?? "");
  const [checking, setChecking] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const shown = linkSlug ?? understanding.linkName?.slug ?? null;

  // First arrival: check the proposed link once so the screen never shows an
  // unchecked name as if it were available. Guarded by a ref so re-renders
  // (parent state updates) never re-check.
  const checkedOnceRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    // StrictMode mounts twice in dev: re-arm on every mount, not just the first.
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    if (checkedOnceRef.current || talentOnly || linkAvailable !== null || !shown) return;
    checkedOnceRef.current = true;
    setChecking(true);
    void onCheckLink(shown).then((r) => {
      if (!mountedRef.current) return;
      setChecking(false);
      setReason(r?.reason);
    });
  }, [talentOnly, linkAvailable, shown, onCheckLink]);

  const submit = async () => {
    if (needsAge) {
      if (!age18 || !onConfirmAge18) return;
      setAgeSaving(true);
      const r = await onConfirmAge18().catch(() => ({ ok: false }));
      if (!mountedRef.current) return;
      setAgeSaving(false);
      if (!r.ok) { setAgeFailed(true); return; }
      setAgeFailed(false);
    }
    onBuild();
  };

  const check = async () => {
    setChecking(true);
    const r = await onCheckLink(draft);
    setChecking(false);
    setReason(r?.reason);
    if (r?.available) setEditing(false);
  };

  const facts = understanding.lines.filter((l) => l.value && l.status !== "later");
  return (
    <div data-testid="onb-ready">
      <Title>{talentOnly ? t("public.onboarding.ready.titleTalent") : t("public.onboarding.ready.title")}</Title>
      <Sub>{talentOnly ? t("public.onboarding.ready.subTalent") : t("public.onboarding.ready.sub")}</Sub>

      <ul className="mt-4 flex flex-col gap-1.5 text-[0.9375rem]" data-testid="onb-ready-facts">
        {facts.map((l) => (
          <li key={l.id} className="flex gap-2">
            <span className="w-24 shrink-0 text-[0.75rem] font-semibold uppercase tracking-[0.06em] leading-[1.6]" style={{ color: "var(--tl-muted)" }}>{t(l.labelKey)}</span>
            <span className="min-w-0 truncate" style={{ color: "var(--tl-ink)" }}>{l.value}</span>
          </li>
        ))}
      </ul>

      {!talentOnly ? (
        <div className="mt-5 rounded-[22px] p-4" style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)" }} data-testid="onb-link-card">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.ready.link")}</p>
          {editing ? (
            <div className="mt-2 flex flex-col gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void check(); }}
                data-testid="onb-link-input"
                className="h-11 w-full rounded-[12px] px-3 text-[1rem] outline-none"
                style={{ background: "var(--tl-bone)", border: "1px solid var(--tl-hairline-strong)", color: "var(--tl-ink)" }}
                autoFocus
              />
              <div className="flex gap-3">
                <GhostLink onClick={() => void check()} testId="onb-link-save">{checking ? t("public.onboarding.ready.linkChecking") : t("public.onboarding.ready.linkSave")}</GhostLink>
                <GhostLink onClick={() => setEditing(false)}>{t("public.onboarding.understood.cancel")}</GhostLink>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[1rem] font-semibold" style={{ color: "var(--tl-ink)" }} data-testid="onb-link-value">
                {promisedHost(shown) ?? "…"}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-[0.75rem]">
                {checking ? <span style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.ready.linkChecking")}</span>
                  : linkAvailable ? <span style={{ color: "var(--tl-positive)" }} data-testid="onb-link-available">{t("public.onboarding.ready.linkAvailable")}</span>
                  : null}
                <GhostLink onClick={() => { setDraft(shown ?? ""); setEditing(true); }} testId="onb-link-change">{t("public.onboarding.ready.linkChange")}</GhostLink>
              </span>
            </div>
          )}
          {linkAvailable === false ? (
            <Notice tone="warn" testId="onb-link-taken">
              {reason === "format" ? t("public.onboarding.ready.linkFormat") : reason === "pending" ? t("public.onboarding.ready.linkPending") : t("public.onboarding.ready.linkTaken")}
              {linkSuggestions.length ? (
                <span className="mt-1 flex flex-wrap gap-2">
                  {linkSuggestions.slice(0, 3).map((s) => (
                    <button key={s} type="button" onClick={() => { setDraft(s); void onCheckLink(s); }} className="underline" data-testid="onb-link-suggestion">{s}</button>
                  ))}
                </span>
              ) : null}
            </Notice>
          ) : null}
        </div>
      ) : null}

      {onPickDesign && path !== "business" ? <DesignPick t={t} value={designChoice} onPick={onPickDesign} /> : null}

      {needsAge ? (
        <div className="mt-5" data-testid="onb-age18">
          <label className="flex items-start gap-3 text-[0.9375rem]" style={{ color: "var(--tl-ink)" }}>
            <input
              type="checkbox"
              checked={age18}
              onChange={(e) => { setAge18(e.target.checked); setAgeFailed(false); }}
              className="mt-0.5 h-5 w-5 shrink-0"
              data-testid="onb-age18-checkbox"
            />
            <span>{t("public.onboarding.ready.age18Label")}</span>
          </label>
          {ageRequiredNotice && !age18 ? <Notice tone="warn" testId="onb-age18-required">{t("public.onboarding.ready.age18Required")}</Notice> : null}
          {ageFailed ? <Notice tone="error" testId="onb-age18-failed">{t("public.onboarding.errors.saveFailed")}</Notice> : null}
        </div>
      ) : null}

      <div className="mt-5">
        <PrimaryButton onClick={() => void submit()} disabled={busy || ageSaving || (needsAge && !age18) || (!talentOnly && linkAvailable !== true)} testId="onb-build">
          {talentOnly ? t("public.onboarding.ready.buildTalent") : path === "both" ? t("public.onboarding.ready.buildBoth") : t("public.onboarding.ready.build")}
        </PrimaryButton>
        <p className="mt-3 text-center text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.ready.nextPhase")}</p>
      </div>
    </div>
  );
}
