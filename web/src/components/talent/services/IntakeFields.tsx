"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import {
  INTAKE_LABEL_MAX,
  INTAKE_MAX_OPTIONS,
  INTAKE_MAX_QUESTIONS,
  INTAKE_OPTION_MAX,
  type IntakeFieldType,
  type IntakeQuestion,
} from "@/lib/talent/offering-intake";

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.1em] text-admin-ink-dim";
const INPUT =
  "mt-1.5 w-full rounded-lg border border-admin-border-soft bg-white px-3 py-2.5 text-[15px] text-admin-ink outline-none focus:border-emerald-900/50";

/**
 * Gridline G13: the questions a client answers when booking or asking about
 * this service (chips, select, photo upload, short text, long text). Stored in
 * `attributes.intake` (no migration). The editor keeps the raw rows while
 * typing; the booking sheet normalizes on read, so a half-written question
 * (no label, or chips without options) simply does not show.
 */
export function IntakeFields({
  attributes,
  onChange,
}: {
  attributes: Record<string, unknown> | null | undefined;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const copy = useDashboardText();
  const raw = Array.isArray(attributes?.intake) ? (attributes!.intake as IntakeQuestion[]) : [];
  const write = (next: IntakeQuestion[]) => {
    const attrs = { ...(attributes ?? {}) };
    if (next.length) attrs.intake = next;
    else delete attrs.intake;
    onChange(attrs);
  };
  const patchAt = (i: number, p: Partial<IntakeQuestion>) =>
    write(raw.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const types: Array<{ value: IntakeFieldType; label: string }> = [
    { value: "chips", label: copy.t("Chips (pick any)") },
    { value: "select", label: copy.t("List (pick one)") },
    { value: "upload", label: copy.t("Photo upload") },
    { value: "text", label: copy.t("Short answer") },
    { value: "area", label: copy.t("Long answer") },
  ];

  return (
    <div className="border-t border-admin-border-soft pt-5" data-intake-fields="">
      <p className={LABEL}>{copy.t("Questions for the client")}</p>
      <p className="mt-1 text-[13px] text-admin-ink-dim">
        {copy.t("Optional. Asked when someone books or asks about this service. Answers arrive with the request.")}
      </p>
      <div className="mt-3 space-y-4">
        {raw.map((q, i) => {
          const hasOptions = q.type === "chips" || q.type === "select";
          return (
            <div key={i} className="rounded-lg border border-admin-border-soft p-3" data-intake-question={i}>
              <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <label className="block">
                  <span className="text-[12px] text-admin-ink-dim">{copy.t("Question")}</span>
                  <input
                    type="text"
                    className={INPUT}
                    maxLength={INTAKE_LABEL_MAX}
                    placeholder={copy.t("For example: Photo of the current panel")}
                    value={q.label ?? ""}
                    onChange={(e) => patchAt(i, { label: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-[12px] text-admin-ink-dim">{copy.t("Answer type")}</span>
                  <select
                    className={INPUT}
                    value={q.type ?? "text"}
                    onChange={(e) => patchAt(i, { type: e.target.value as IntakeFieldType })}
                  >
                    {types.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {hasOptions ? (
                <label className="mt-3 block">
                  <span className="text-[12px] text-admin-ink-dim">
                    {copy.t("Choices, one per line")}
                  </span>
                  <textarea
                    className={INPUT}
                    rows={3}
                    value={(q.options ?? []).join("\n")}
                    onChange={(e) =>
                      patchAt(i, {
                        options: e.target.value
                          .split("\n")
                          .map((o) => o.slice(0, INTAKE_OPTION_MAX))
                          .slice(0, INTAKE_MAX_OPTIONS),
                      })
                    }
                  />
                </label>
              ) : null}
              <label className="mt-3 block">
                <span className="text-[12px] text-admin-ink-dim">{copy.t("Hint (optional)")}</span>
                <input
                  type="text"
                  className={INPUT}
                  maxLength={INTAKE_LABEL_MAX}
                  value={q.help ?? ""}
                  onChange={(e) => patchAt(i, { help: e.target.value })}
                />
              </label>
              <div className="mt-2 flex gap-3 text-[13px] font-semibold">
                {i > 0 ? (
                  <button
                    type="button"
                    className="text-admin-ink-muted underline"
                    onClick={() => {
                      const next = [...raw];
                      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                      write(next);
                    }}
                  >
                    {copy.t("Move up")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-admin-ink-muted underline"
                  onClick={() => write(raw.filter((_, j) => j !== i))}
                >
                  {copy.t("Remove question")}
                </button>
              </div>
            </div>
          );
        })}
        {raw.length < INTAKE_MAX_QUESTIONS ? (
          <button
            type="button"
            className="rounded-lg bg-black/[0.05] px-3 py-1.5 text-[14px] font-semibold text-admin-ink-muted"
            onClick={() => write([...raw, { key: `q${Date.now().toString(36)}`, type: "text", label: "" }])}
          >
            {copy.t("Add a question")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
