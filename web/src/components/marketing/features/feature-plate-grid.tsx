"use client";

import * as React from "react";
import { withLocaleHref } from "@/i18n/pathnames";
import type { FeatureGroup, FeaturePlatePayload } from "@/lib/marketing/features";
import { useFeatureHub } from "./feature-hub";
import { FeatureIcon } from "./feature-icons";

/**
 * The feature cards.
 *
 * An earlier pass drew this as a hairline table with a plate number in every
 * corner. It read as a calendar, and the numbers served the concept rather
 * than the reader, so both are gone. What replaces them is what the eye
 * actually wants from a catalogue of twenty one things: separated cards with
 * room to breathe, a large icon that carries the meaning, and a name and a
 * promise in that order.
 *
 * Cards are anchors first and popup triggers second, so the page behind each
 * one stays reachable without script.
 */

export type PlateGroup = { group: FeatureGroup; stage: string; features: FeaturePlatePayload[] };

/**
 * A quiet ink shift per stage. Enough that the five bands feel like chapters,
 * far short of a colour per card, which would turn the page into confetti.
 * The icon carries this on its own line work: there is no tile behind it, so
 * the mark sits directly on the card the way a drawn symbol should.
 */
const STAGE_MARK: Record<FeatureGroup, string> = {
  presence: "var(--tl-forest)",
  found: "var(--tl-clay)",
  booked: "var(--tl-forest-bright)",
  paid: "var(--tl-forest)",
  run: "var(--tl-ink-soft)",
};

export function FeaturePlateGrid({
  groups,
  locale,
  comingLabel,
  showStageNav = false,
}: {
  groups: PlateGroup[];
  locale: string;
  comingLabel: string;
  /** Jump links to each stage. Worth it where the whole catalogue is shown. */
  showStageNav?: boolean;
}) {
  return (
    <div className="flex flex-col gap-14 sm:gap-16">
      {showStageNav ? <StageNav groups={groups} /> : null}
      {groups.map((band) => (
        <StageBand key={band.group} band={band} locale={locale} comingLabel={comingLabel} />
      ))}
    </div>
  );
}

function StageNav({ groups }: { groups: PlateGroup[] }) {
  return (
    <nav className="flex flex-wrap justify-center gap-2">
      {groups.map((band) => (
        <a
          key={band.group}
          href={`#stage-${band.group}`}
          className="mkt-stage-chip inline-flex items-center rounded-full px-4 py-2"
          style={{
            border: "1px solid var(--plt-hairline)",
            background: "var(--tl-surface-raised)",
            color: "var(--plt-ink-soft)",
            fontSize: "0.8125rem",
            fontWeight: 500,
          }}
        >
          {band.stage}
        </a>
      ))}
    </nav>
  );
}

function StageBand({
  band,
  locale,
  comingLabel,
}: {
  band: PlateGroup;
  locale: string;
  comingLabel: string;
}) {
  return (
    <section id={`stage-${band.group}`} className="scroll-mt-28">
      <div className="text-center">
        <h3 className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
          {band.stage}
        </h3>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {band.features.map((f) => (
          <FeatureCard
            key={`${band.group}-${f.key}`}
            feature={f}
            mark={STAGE_MARK[band.group]}
            locale={locale}
            comingLabel={comingLabel}
          />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({
  feature,
  mark,
  locale,
  comingLabel,
}: {
  feature: FeaturePlatePayload;
  mark: string;
  locale: string;
  comingLabel: string;
}) {
  const { open } = useFeatureHub();

  return (
    <a
      href={withLocaleHref(feature.path, locale)}
      onClick={(e) => {
        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        open(feature.key, "grid");
      }}
      className="mkt-feature-card group flex flex-col items-center px-6 py-9 text-center sm:px-7"
      style={{
        background: "var(--tl-surface-raised)",
        border: "1px solid var(--plt-hairline)",
        borderRadius: "var(--tl-radius-lg)",
      }}
    >
      <span className="mkt-feature-mark" style={{ color: mark }}>
        <FeatureIcon featureKey={feature.key} size={52} strokeWidth={1.25} />
      </span>

      <span
        className="plt-display mt-6"
        style={{ fontSize: "1.0625rem", lineHeight: 1.3, color: "var(--plt-ink)" }}
      >
        {feature.name}
      </span>
      <span
        className="plt-body mt-2"
        style={{ fontSize: "0.875rem", lineHeight: 1.55, color: "var(--plt-muted)" }}
      >
        {feature.promise}
      </span>

      {feature.status === "coming" ? (
        <span
          className="mt-4 inline-flex rounded-full px-2.5 py-1"
          style={{
            background: "var(--tl-warning-bg)",
            color: "var(--tl-warning)",
            fontSize: "0.625rem",
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {comingLabel}
        </span>
      ) : null}
    </a>
  );
}
