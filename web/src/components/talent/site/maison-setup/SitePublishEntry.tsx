"use client";

/** TUL-427: a stable Publish entry on /talent/site; opens the Review step. */

import Link from "next/link";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";
import type { SitePublishEntryState } from "./site-publish-entry";

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-admin-border-soft bg-white px-4 text-[13px] font-semibold text-admin-ink hover:bg-admin-surface-alt";

export function SitePublishEntry({
  locale,
  state,
  publicSiteUrl,
  onOpenReview,
}: {
  locale: MaisonSetupLocale;
  state: SitePublishEntryState;
  publicSiteUrl: string | null;
  onOpenReview: () => void;
}) {
  const t = (key: string) => maisonSetupT(locale, key);
  const label =
    state === "republish" ? t("Republish") : state === "fix-first" ? t("Review before publishing") : t("Publish");
  return (
    <div
      data-testid="talent-site-publish-entry"
      data-state={state}
      className="flex flex-wrap items-center gap-2"
    >
      {state === "published" ? (
        <>
          <span
            data-testid="talent-site-publish-status"
            className="inline-flex min-h-11 items-center rounded-xl bg-admin-surface-alt px-4 text-[13px] font-semibold text-admin-ink"
          >
            {t("Published")}
          </span>
          {publicSiteUrl ? (
            <Link
              href={publicSiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="talent-site-view-live"
              aria-label={t("View site")}
              className={BTN}
            >
              {t("View site")}
            </Link>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          data-testid="talent-site-publish"
          aria-label={label}
          onClick={onOpenReview}
          className={BTN}
        >
          {label}
        </button>
      )}
      {state === "fix-first" ? (
        <p data-testid="talent-site-publish-gate" className="w-full text-[12.5px] text-admin-ink-muted">
          {t("Apply a design before publishing.")}
        </p>
      ) : null}
    </div>
  );
}
