"use client";

import { TALENT_AGENDA_VARS } from "./primitives";

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
  const d = section.data ?? {};
  switch (section.type) {
    case "event":
      return (
        <Card title="Event">
          <Line label="Guests" value={d.guests} />
          <Line label="Diet" value={d.diet} />
          <Line label="Kitchen" value={d.kitchen} />
          <Line label="Menu" value={d.menu} />
          <Line label="Prep" value={d.prep} />
        </Card>
      );
    case "performance":
      return (
        <Card title="Performance">
          <Line label="Call time" value={d.callTime} />
          <Line label="Sets" value={d.sets} />
          <Line label="End" value={d.end} />
          <Line label="Venue rules" value={d.venueRules} />
        </Card>
      );
    case "intake":
      return (
        <Card title="Intake">
          <Line label="Status" value={d.status ?? "Not received"} />
          {d.resendUrl ? (
            <a className="mt-2 inline-flex min-h-[44px] items-center text-[13px] text-[var(--tc-accent)]" href={String(d.resendUrl)}>
              Resend form
            </a>
          ) : (
            <p className="mt-2 text-[13px] text-[#5F6368]">Resend when a form link exists.</p>
          )}
        </Card>
      );
    case "tz":
      return (
        <Card title="Time zones">
          <p className="text-[14px]">
            {d.localTime ?? "—"} · {d.clientTime ?? "—"}
          </p>
        </Card>
      );
    case "estimate":
      return (
        <Card title="Estimate">
          <p className="text-[14px] text-[#5F6368]">
            Booked to the top of the range. Finishing early frees the rest.
          </p>
          <Line label="Range" value={d.range} />
        </Card>
      );
    case "project":
      return (
        <Card title="Project">
          <Line label="Stage" value={d.stage} />
          <Line label="Deliverables" value={d.deliverables} />
          <Line label="Due" value={d.due} />
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
