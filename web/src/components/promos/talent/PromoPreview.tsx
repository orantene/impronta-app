"use client";

import { useState } from "react";

import type { PromoCopy } from "@/lib/promos/copy/talent";
import { formatMoney } from "@/lib/promos/talent-view";
import type { PreviewResult, PreviewService, PromoDraft } from "@/lib/promos/templates";
import { daysLabel } from "./describe";
import { Chip, UI } from "./ui";

type Tab = "site" | "slot" | "checkout";

/** Live preview (D3). Every number comes from previewQuote(), i.e. quote(). */
export function PromoPreview({
  draft,
  service,
  result,
  addonLabel,
  copy,
}: {
  draft: PromoDraft;
  service: PreviewService | null;
  result: PreviewResult | null;
  addonLabel: string | null;
  copy: PromoCopy;
}) {
  const [tab, setTab] = useState<Tab>("site");
  const money = (c: number) => formatMoney(c, draft.currency, copy.locale);
  const left = draft.max_uses;
  return (
    <section aria-label={copy.t("preview.title")} className={`${UI.card} p-3.5`}>
      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {(["site", "slot", "checkout"] as const).map((k) => (
          <Chip key={k} active={tab === k} onClick={() => setTab(k)}>
            {copy.t(`preview.${k}` as const)}
          </Chip>
        ))}
      </div>
      {!service || !result ? (
        <p className={`text-[13px] ${UI.muted}`}>{copy.t("preview.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className={`text-[14px] font-semibold ${UI.ink}`}>{service.title}</p>
          {tab === "checkout" ? (
            <dl className="flex flex-col gap-1 text-[13px]">
              <Row label={service.title} value={money(result.list_cents)} />
              {result.discount_cents > 0 ? <Row label={copy.t("preview.discount")} value={`-${money(result.discount_cents)}`} /> : null}
              {addonLabel && result.gift_cents > 0 ? <Row label={copy.t("preview.gift", { addon: addonLabel })} value={money(0)} /> : null}
              <Row strong label={copy.t("preview.total")} value={result.free_booking ? copy.t("preview.free_booking") : money(result.final_cents)} />
            </dl>
          ) : (
            <>
              {result.applies && result.discount_cents > 0 ? (
                <p className="flex flex-wrap items-baseline gap-2">
                  <s aria-hidden className={`text-[13px] ${UI.muted}`}>{money(result.list_cents)}</s>
                  <span className="sr-only">{copy.t("preview.was_now", { was: money(result.list_cents), now: money(result.final_cents) })}</span>
                  <span className={`text-[18px] font-bold ${UI.ink}`}>{money(result.final_cents)}</span>
                  <span aria-label={copy.t("preview.save", { n: result.pct })} className="rounded-full bg-[var(--tc-soft,#e6f4f1)] px-2.5 py-1 text-[12px] font-semibold text-[#1c1c1e]">{copy.t("preview.save", { n: result.pct })}</span>
                </p>
              ) : (
                <p className={`text-[18px] font-bold ${UI.ink}`}>{money(result.final_cents)}</p>
              )}
              {addonLabel && result.gift_cents > 0 ? (
                <p className={`text-[13px] ${UI.ink}`}>{copy.t("preview.gift", { addon: addonLabel })}</p>
              ) : null}
              <p className={`text-[12px] ${UI.muted}`}>
                {left !== null ? `${copy.t("preview.left", { n: left, total: left })} · ` : ""}
                {tab === "slot" && draft.time_from && draft.time_to
                  ? `${draft.time_from} - ${draft.time_to}`
                  : daysLabel(draft.weekdays, copy)}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "border-t border-[var(--tc-border,#e5e5ea)] pt-1.5 font-semibold" : ""}`}>
      <dt className={UI.muted}>{label}</dt>
      <dd className={UI.ink}>{value}</dd>
    </div>
  );
}
