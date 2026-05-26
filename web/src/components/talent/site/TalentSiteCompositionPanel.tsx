"use client";

import { useEffect, useState, useTransition } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { PrimaryButton, SecondaryButton } from "@/components/admin/shell/internal/primitives";
import {
  saveTalentSiteCompositionAction,
  setTalentSiteCompositionModeAction,
} from "@/lib/talent-site/server/actions";
import { TALENT_SERVICE_SECTION_OPTIONS } from "@/lib/talent-site/talent-service-sections";
import type { TalentPersonalSectionTypeKey } from "@/lib/site-admin/sections/talent-personal-section-keys";
import { talentSiteCopy, type TalentSiteLocale } from "@/lib/talent-site/talent-site-i18n";
import type { TalentSiteDashboardState, TalentSiteSnapshotSection } from "@/lib/talent-site/types";

type Props = {
  state: TalentSiteDashboardState;
  locale?: TalentSiteLocale;
  onChanged: () => void | Promise<void>;
};

function makeEmptySection(sectionTypeKey: string, name: string): TalentSiteSnapshotSection {
  const id = crypto.randomUUID();
  return {
    slotKey: `slot-${id.slice(0, 8)}`,
    sortOrder: 0,
    sectionId: id,
    sectionTypeKey,
    schemaVersion: 1,
    name,
    props: {},
    hidden: false,
  };
}

export function TalentSiteCompositionPanel({ state, locale = "en", onChanged }: Props) {
  const snapshot = state.site?.draftSnapshot;
  const [slots, setSlots] = useState<TalentSiteSnapshotSection[]>(snapshot?.slots ?? []);
  const [mode, setMode] = useState(state.compositionMode ?? "template");
  const [addKey, setAddKey] = useState<TalentPersonalSectionTypeKey>(
    TALENT_SERVICE_SECTION_OPTIONS[0]?.key ?? "hero",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const serverMode = state.compositionMode ?? snapshot?.compositionMode ?? "template";

  useEffect(() => {
    setSlots(snapshot?.slots ?? []);
    setMode(serverMode);
  }, [snapshot, serverMode]);

  if (!state.canUseCustomBuilder || !state.site || !snapshot) {
    return null;
  }

  function switchMode(next: "template" | "custom") {
    startTransition(async () => {
      setError(null);
      const result = await setTalentSiteCompositionModeAction({
        mode: next,
        expectedVersion: state.site!.version,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode(next);
      await onChanged();
    });
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...slots];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setSlots(next.map((s, i) => ({ ...s, sortOrder: i })));
  }

  function toggleHidden(index: number) {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, hidden: !s.hidden } : s)),
    );
  }

  function addSection() {
    const opt = TALENT_SERVICE_SECTION_OPTIONS.find((o) => o.key === addKey);
    if (!opt) return;
    setSlots((prev) => [...prev, makeEmptySection(opt.key, opt.label)]);
  }

  function saveComposition() {
    startTransition(async () => {
      setError(null);
      const result = await saveTalentSiteCompositionAction({
        expectedVersion: state.site!.version,
        slots: slots.filter((s) => !s.hidden),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onChanged();
    });
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <SecondaryButton
          onClick={() => switchMode("template")}
          disabled={pending || mode === "template"}
        >
          {talentSiteCopy(locale, "modeTemplate")}
        </SecondaryButton>
        <PrimaryButton
          onClick={() => switchMode("custom")}
          disabled={pending || mode === "custom"}
        >
          {talentSiteCopy(locale, "modeCustom")}
        </PrimaryButton>
      </div>

      {mode === "custom" ? (
        <>
          <p style={{ fontSize: 12.5, color: COLORS.inkMuted, margin: "0 0 12px" }}>
            {talentSiteCopy(locale, "customBuilderBlurb")}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {slots.map((slot, index) => (
              <li
                key={slot.sectionId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background: slot.hidden ? COLORS.surfaceAlt : "#fff",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 8,
                  opacity: slot.hidden ? 0.55 : 1,
                }}
              >
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                  {slot.name} ({slot.sectionTypeKey})
                </span>
                <SecondaryButton onClick={() => move(index, -1)} disabled={pending || index === 0}>
                  ↑
                </SecondaryButton>
                <SecondaryButton
                  onClick={() => move(index, 1)}
                  disabled={pending || index === slots.length - 1}
                >
                  ↓
                </SecondaryButton>
                <SecondaryButton onClick={() => toggleHidden(index)} disabled={pending}>
                  {slot.hidden ? "Show" : "Hide"}
                </SecondaryButton>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <select
              value={addKey}
              onChange={(e) => setAddKey(e.target.value as TalentPersonalSectionTypeKey)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                fontFamily: FONTS.body,
                fontSize: 13,
              }}
            >
              {TALENT_SERVICE_SECTION_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <SecondaryButton onClick={addSection} disabled={pending}>
              Add section
            </SecondaryButton>
            <PrimaryButton onClick={saveComposition} disabled={pending}>
              Save composition
            </PrimaryButton>
          </div>
        </>
      ) : null}

      {error ? (
        <p style={{ marginTop: 10, fontSize: 12, color: COLORS.criticalDeep }}>{error}</p>
      ) : null}
    </div>
  );
}
