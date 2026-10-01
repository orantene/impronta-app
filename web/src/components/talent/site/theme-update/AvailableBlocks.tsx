"use client";

/**
 * THEME RELEASES: "Available blocks" in My presence. New blocks she skipped
 * from releases her site is on or past stay here, each with Add this block and
 * a placement picker. Nothing is added unless she presses the button.
 */
import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";

import { pick } from "@/lib/talent-site/history/copy";
import { UPDATE_COPY, updateLocale } from "@/lib/talent-site/theme-releases/talent-update/copy";
import { loadAvailableBlocksAction } from "@/lib/talent-site/theme-releases/talent-update/talent-update-actions";
import type { AvailableBlocks as Data } from "@/lib/talent-site/theme-releases/talent-update/talent-update.server";
import { ItemRow } from "./ThemeUpdateSheet";

export function AvailableBlocks({ locale: localeIn }: { locale?: string | null }): ReactElement | null {
  const locale = updateLocale(localeIn);
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(async () => {
    const res = await loadAvailableBlocksAction().catch(() => null);
    setData(res && res.ok ? res.value : null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!data || data.blocks.length === 0) return null;
  return (
    <section
      aria-label={pick(UPDATE_COPY.availableBlocks, locale)}
      data-available-blocks
      className="mb-5 rounded-xl border border-admin-border-soft bg-white p-4 font-admin-body"
    >
      <p className="m-0 text-[15px] font-semibold text-admin-ink">{pick(UPDATE_COPY.availableBlocks, locale)}</p>
      <p className="m-0 mb-3 mt-1 text-[13px] text-admin-ink-muted">{pick(UPDATE_COPY.availableBlocksHint, locale)}</p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {data.blocks.map((b) => (
          <ItemRow
            key={b.item.id}
            item={b.item}
            locale={locale}
            updateId={b.updateId}
            placements={data.placements}
            draftRev={data.draftRev}
            disabled={false}
            onAdded={() => void load()}
          />
        ))}
      </ul>
    </section>
  );
}
