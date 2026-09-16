"use client";

/**
 * WhoPerforms — W31: Service › Who performs, the item editor's tab
 * (`CatalogItemEditor`, tab `who`). The catalog re-skin had dropped the
 * page that mounted this block; the tab is where the board draws it. The rows are `pickAProfessional` over the People
 * reader (`loadWhoPerforms`), the same list the booking page and the POS
 * filter with, so a public profile alone never appears here.
 *
 * A workspace service does not name a required skill, a location, a pay
 * rule or a "guaranteed" flag yet, and nothing assigns a person to one
 * service rather than another: the list is the same for every service, the
 * table says so in its columns, and the three rules under it (Requirement
 * to perform, Customer may choose, Phase rule) are drawn disabled with the
 * one sentence that explains why (D-POS-37).
 */

import { useEffect, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";

import { loadWhoPerforms, type PerformerRow, type WhoPerformsResult } from "@/app/(workspace)/[tenantSlug]/admin/people/people-actions";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

const K = "admin.people.whoPerforms";
const H = "admin.people.hat";

const HAT_TONE: Record<PerformerRow["hats"][number], string> = {
  publicProfile: "bg-admin-royal-soft text-admin-royal-deep",
  bookable: "bg-admin-success-soft text-admin-success-deep",
  access: "bg-admin-brand-soft text-admin-brand-deep",
};

/** The board's 34px select under the kit's own chevron; disabled at half opacity, no native arrow. */
const SELECT =
  "h-[34px] w-full cursor-not-allowed appearance-none rounded-[9px] border border-admin-border bg-admin-card pl-[10px] pr-[30px] font-admin-body text-admin-13 leading-[1.2] text-admin-ink opacity-50";
const TD = "border-b border-admin-border-soft px-[14px] py-[11px] leading-[1.2]";
const CHIP = "inline-flex items-center rounded-full px-[8px] py-[2px] text-admin-11 font-semibold leading-[1.2]";

export function WhoPerforms({ peopleHref }: { peopleHref: string }) {
  const t = useT();
  const [result, setResult] = useState<WhoPerformsResult | null>(null);

  useEffect(() => {
    let alive = true;
    void loadWhoPerforms().then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section data-testid="who-performs" className="flex flex-col gap-[14px] font-admin-body leading-[1.2]">
      <div>
        <h2 className="m-0 text-[15px]! font-semibold leading-[1.2] text-admin-ink">{t(`${K}.title`)}</h2>
        <p className="m-0 mt-[4px] text-[12.5px] leading-[1.3] text-admin-ink-muted">{t(`${K}.subtitle`)}</p>
      </div>

      {result === null ? (
        <p className="m-0 text-[12.5px] text-admin-ink-muted">{t(`${K}.loading`)}</p>
      ) : !result.ok ? (
        <p role="alert" className="m-0 rounded-[9px] bg-admin-critical-soft px-[10px] py-[8px] text-[12.5px] text-admin-red">
          {t(`admin.people.result.${result.reasonKey}`)}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-admin-border bg-admin-card">
          <table className="w-full border-collapse text-admin-13 leading-[1.2]">
            <thead>
              <tr>
                {["professional", "otherHats", "locations", "guaranteed", "requirement", "pay"].map((col) => (
                  <th key={col} scope="col" className="whitespace-nowrap border-b border-admin-border px-[14px] py-[10px] text-left text-admin-11 font-semibold uppercase leading-[1.2] tracking-[0.05em] text-admin-ink-muted">
                    {t(`${K}.col.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.performers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-[14px] py-[12px] text-admin-ink-muted">
                    {t(`${K}.empty`)}{" "}
                    <a href={peopleHref} className="font-semibold text-admin-brand hover:underline">
                      {t(`${K}.openPeople`)}
                    </a>
                  </td>
                </tr>
              ) : (
                result.performers.map((p) => (
                  <tr key={p.key} data-testid="who-performs-row">
                    <td className={`${TD} font-semibold text-admin-ink`}>{p.name || t("admin.people.unnamed")}</td>
                    <td className={TD}>
                      <span className="flex flex-wrap gap-[4px]">
                        {p.hats
                          .filter((h) => h !== "bookable")
                          .map((h) => (
                            <span key={h} className={`${CHIP} ${HAT_TONE[h]}`}>
                              {t(`${H}.${h}`)}
                            </span>
                          ))}
                        {p.hats.length === 1 ? <span className={`${CHIP} bg-admin-surface-alt text-admin-ink-muted`}>{t(`${K}.bookableOnly`)}</span> : null}
                      </span>
                    </td>
                    <td className={`${TD} text-admin-ink-muted`} title={t(`${K}.locationsWhy`)}>
                      {t(`${K}.allLocations`)}
                    </td>
                    <td className={`${TD} text-admin-ink-muted`} title={t(`${K}.guaranteedWhy`)}>
                      {p.hasHours ? t(`${K}.guaranteedAllowed`) : t(`${K}.guaranteedNoHours`)}
                    </td>
                    <td className={`${TD} text-admin-ink-dim`} title={t(`${K}.requirementWhy`)}>
                      {t(`${K}.none`)}
                    </td>
                    <td className={`${TD} text-admin-ink-dim`} title={t(`${K}.payWhy`)}>
                      {t(`${K}.none`)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-[10px] border-t border-admin-border-soft px-[14px] py-[10px]">
            <button
              type="button"
              disabled
              title={t(`${K}.addOff`)}
              data-not-wired="true"
              data-testid="who-performs-add"
              className="inline-flex h-[30px] cursor-not-allowed items-center gap-[6px] rounded-full bg-admin-surface-alt px-[12px] text-[12.5px] font-semibold leading-[1.2] text-admin-ink opacity-50"
            >
              <Plus aria-hidden size={13} strokeWidth={2} />
              {t(`${K}.add`)}
            </button>
            <span className="text-[12.5px] text-admin-ink-muted">{interpolate(t(`${K}.addNote`), { count: result.performers.length })}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-[12px]" data-testid="who-performs-rules">
        {(["requirement", "customerChoice", "phaseRule"] as const).map((rule) => (
          <label key={rule} className="flex flex-col gap-[8px] text-admin-13 font-semibold leading-[1.2] text-admin-ink">
            {t(`${K}.rule.${rule}`)}
            <span className="relative block">
              <select className={SELECT} disabled title={t(`${K}.rule.${rule}Off`)} value="x" onChange={() => undefined} data-not-wired="true">
                <option value="x">{t(`${K}.rule.${rule}Value`)}</option>
              </select>
              <span aria-hidden className="pointer-events-none absolute right-[10px] top-1/2 -translate-y-1/2 text-admin-ink-dim">
                <ChevronDown size={13} strokeWidth={1.75} />
              </span>
            </span>
            <span className="text-[11.5px] font-normal leading-[1.3] text-admin-ink-muted">{t(`${K}.rule.${rule}Off`)}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
