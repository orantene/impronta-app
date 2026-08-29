"use client";

import * as React from "react";
import { withLocaleHref } from "@/i18n/pathnames";
import type { FeatureGroup, FeaturePlatePayload } from "@/lib/marketing/features";
import { useFeatureHub } from "./feature-hub";
import { FeatureIcon } from "./feature-icons";

/**
 * The specimen grid: numbered plates hanging off one drawn line.
 *
 * The line is the point. Tulala is one spine with many doors, so the hub
 * literally draws that: a single rule runs down the whole section and every
 * stage and every plate attaches to it. It is honest here in a way it would
 * not be on a competitor's site, which is what makes it ours.
 *
 * Plates are anchors first and popup triggers second, for the same reason the
 * inline links are: the page behind a plate has to be reachable without
 * script.
 */

export type PlateGroup = { group: FeatureGroup; stage: string; features: FeaturePlatePayload[] };

export function FeaturePlateGrid({
  groups,
  locale,
  startIndex = 1,
  comingLabel,
}: {
  groups: PlateGroup[];
  locale: string;
  /** Stage numbering continues across the two homepage sections. */
  startIndex?: number;
  comingLabel: string;
}) {
  return (
    <div className="relative">
      {/* The spine. One continuous rule behind every band in this section. */}
      <span
        aria-hidden
        className="absolute top-2 bottom-2 w-px"
        style={{ left: "0.5rem", background: "var(--plt-hairline)" }}
      />
      <div className="flex flex-col gap-12 sm:gap-16">
        {groups.map((band, i) => (
          <StageBand
            key={band.group}
            band={band}
            index={startIndex + i}
            locale={locale}
            comingLabel={comingLabel}
          />
        ))}
      </div>
    </div>
  );
}

function StageBand({
  band,
  index,
  locale,
  comingLabel,
}: {
  band: PlateGroup;
  index: number;
  locale: string;
  comingLabel: string;
}) {
  return (
    <section className="relative pl-7 sm:pl-12">
      {/* The node where this stage attaches to the spine. */}
      <span
        aria-hidden
        className="absolute left-[0.28rem] top-[0.42rem] h-[0.45rem] w-[0.45rem] rounded-full"
        style={{ background: "var(--plt-forest)" }}
      />
      <h3 className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
        <span className="plt-numeral" style={{ color: "var(--plt-forest)" }}>
          {String(index).padStart(2, "0")}
        </span>
        <span aria-hidden className="mx-2" style={{ color: "var(--plt-hairline-strong)" }}>
          /
        </span>
        {band.stage}
      </h3>

      <div className="mt-5 grid grid-cols-2 gap-px md:grid-cols-3 lg:grid-cols-4"
        style={{ background: "var(--plt-hairline)" }}
      >
        {band.features.map((f) => (
          <Plate key={`${band.group}-${f.key}`} feature={f} locale={locale} comingLabel={comingLabel} />
        ))}
      </div>
    </section>
  );
}

function Plate({
  feature,
  locale,
  comingLabel,
}: {
  feature: FeaturePlatePayload;
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
      className="mkt-plate group relative flex min-h-[10.5rem] flex-col justify-between p-5 sm:min-h-[11.5rem] sm:p-6"
      style={{ background: "var(--plt-bg)" }}
    >
      {/* The plate number, set large and quiet. It takes the accent on hover,
          which is the only colour the grid ever spends. */}
      <span
        aria-hidden
        className="mkt-plate-number plt-numeral absolute right-4 top-3 leading-none"
        style={{ fontSize: "1.75rem", color: "var(--plt-hairline-strong)" }}
      >
        {String(feature.plate).padStart(2, "0")}
      </span>

      <span className="mkt-plate-icon" style={{ color: "var(--plt-forest)" }}>
        <FeatureIcon featureKey={feature.key} size={30} />
      </span>

      <span className="mt-5 flex flex-col gap-1">
        <span
          className="plt-display"
          style={{ fontSize: "1rem", lineHeight: 1.25, color: "var(--plt-ink)" }}
        >
          {feature.name}
        </span>
        <span
          className="plt-display-serif italic"
          style={{ fontSize: "0.8125rem", lineHeight: 1.4, color: "var(--plt-muted)" }}
        >
          {feature.promise}
        </span>
        {feature.status === "coming" ? (
          <span
            className="mt-2 inline-flex w-fit rounded-full px-2 py-[2px]"
            style={{
              background: "var(--tl-warning-bg)",
              color: "var(--tl-warning)",
              fontSize: "0.625rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {comingLabel}
          </span>
        ) : null}
      </span>

      {/* The hairline that takes the accent on hover. */}
      <span
        aria-hidden
        className="mkt-plate-rule absolute bottom-0 left-0 h-px w-0"
        style={{ background: "var(--plt-accent)" }}
      />
    </a>
  );
}
