"use client";

import { TALENT_AGENDA_VARS } from "./primitives";
import { useAgendaCopy } from "./use-agenda-copy";

export type TradeSectionPayload = {
  type: "event" | "performance" | "intake" | "tz" | "estimate" | "project";
  /** Raw payload from the booking; renderers stay empty when missing fields. */
  data?: Record<string, string | number | null | undefined>;
};

/**
 * T6.4 Trade section renderers. Empty when there is no payload (D6 intake = status + resend).
 */
export function TradeSections({ sections }: { sections?: TradeSectionPayload[] }) {
  if (!sections?.length) return null;
  return (
    <div style={TALENT_AGENDA_VARS} className="space-y-3">
      {sections.map((section, i) => (
        <TradeSectionCard key={`${section.type}-${i}`} section={section} />
      ))}
    </div>
  );
}

function TradeSectionCard({ section }: { section: TradeSectionPayload }) {
  const copy = useAgendaCopy();
  const d = section.data ?? {};
  switch (section.type) {
    case "event":
      return (
        <Card title={copy.t("Event")}>
          <Line label={copy.t("Guests")} value={d.guests} />
          <Line label={copy.t("Diet")} value={d.diet} />
          <Line label={copy.t("Kitchen")} value={d.kitchen} />
          <Line label={copy.t("Menu")} value={d.menu} />
          <Line label={copy.t("Prep")} value={d.prep} />
        </Card>
      );
    case "performance":
      return (
        <Card title={copy.t("Performance")}>
          <Line label={copy.t("Call time")} value={d.callTime} />
          <Line label={copy.t("Sets")} value={d.sets} />
          <Line label={copy.t("End")} value={d.end} />
          <Line label={copy.t("Venue rules")} value={d.venueRules} />
        </Card>
      );
    case "intake":
      return (
        <Card title={copy.t("Intake")}>
          <Line label={copy.t("Status")} value={d.status ?? copy.t("Not received")} />
          {d.resendUrl ? (
            <a
              className="mt-2 inline-flex min-h-[44px] items-center text-[13px] text-[var(--tc-accent)]"
              href={String(d.resendUrl)}
            >
              {copy.t("Resend form")}
            </a>
          ) : null}
        </Card>
      );
    case "tz":
      return (
        <Card title={copy.t("Time zones")}>
          <p className="text-[14px]">
            {d.localTime ?? "—"} · {d.clientTime ?? "—"}
          </p>
        </Card>
      );
    case "estimate":
      return (
        <Card title={copy.t("Estimate")}>
          <p className="text-[14px] text-[#5F6368]">
            {copy.t("Booked to the top of the range. Finishing early frees the rest.")}
          </p>
          <Line label={copy.t("Range")} value={d.range} />
        </Card>
      );
    case "project":
      return (
        <Card title={copy.t("Project")}>
          <Line label={copy.t("Stage")} value={d.stage} />
          <Line label={copy.t("Deliverables")} value={d.deliverables} />
          <Line label={copy.t("Due")} value={d.due} />
        </Card>
      );
    default:
      return null;
  }
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/8 bg-white p-4">
      <h2 className="mb-2 text-[14px] font-semibold text-[var(--tc-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function Line({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 text-[14px]">
      <span className="text-[#5F6368]">{label}</span>
      <span>{value}</span>
    </div>
  );
}
