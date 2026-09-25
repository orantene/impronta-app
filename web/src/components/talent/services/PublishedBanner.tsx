"use client";

import { useState } from "react";
import { type OfferingDestination } from "@/lib/talent/services-settings-actions";
import { publicationWord } from "@/lib/talent/publication-state";
import { type TalentOffering } from "@/lib/talent/offerings-types";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

/**
 * "Services · item published" (designer PDF p09). Says exactly where the item
 * can be booked now, refuses to claim the personal website when it is not
 * published, and offers the three next actions: view as customer, share,
 * add another.
 */
export function PublishedBanner({
  item,
  destinations,
  onClose,
  onAddAnother,
}: {
  item: TalentOffering | null;
  destinations: OfferingDestination[];
  onClose: () => void;
  onAddAnother?: () => void;
}) {
  const copy = useDashboardText();
  const [shared, setShared] = useState(false);
  if (!item || publicationWord(item) !== "live") return null;

  const placeName = (d: OfferingDestination) => {
    if (d.id === "directory") return copy.t("your Tulala profile");
    if (d.id === "website") return copy.t("your personal website");
    return copy.isSpanish ? `tu ficha en ${d.label}` : `your ${d.label} listing`;
  };
  const places = destinations.map(placeName);
  const joined =
    places.length <= 1
      ? places[0] ?? copy.t("your connected pages")
      : `${places.slice(0, -1).join(", ")} ${copy.t("and on")} ${places[places.length - 1]}`;
  const hasWebsite = destinations.some((d) => d.id === "website");
  const profile = destinations.find((d) => d.id === "directory") ?? destinations.find((d) => d.href);
  const profileUrl =
    profile?.href && typeof window !== "undefined"
      ? new URL(profile.href, window.location.origin).toString()
      : null;

  const share = async () => {
    if (!profileUrl) return;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: item.title, url: profileUrl });
        return;
      }
      await navigator.clipboard.writeText(profileUrl);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      /* the person cancelled the share sheet */
    }
  };

  const ghost =
    "rounded-lg border border-admin-border-soft bg-white px-3 py-1.5 text-[12.5px] font-semibold text-admin-ink";

  return (
    <div
      role="status"
      className="mt-4 rounded-[12px] border border-emerald-900/15 bg-emerald-900/[0.06] px-4 py-3.5 font-admin-body text-[13px]"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-900 text-white"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
            <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-emerald-900">
            “{item.title}” {copy.t("is live")}
          </p>
          <p className="mt-0.5 text-admin-ink">
            {copy.t("Clients can book it on")} {joined}.
            {!hasWebsite && (
              <>
                {" "}
                {copy.t("It is not on your personal website, because that website is not published yet.")}
              </>
            )}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {profileUrl && (
              <a href={profileUrl} target="_blank" rel="noopener noreferrer" className={ghost}>
                {copy.t("View as customer")}
              </a>
            )}
            {profileUrl && (
              <button type="button" onClick={share} className={ghost}>
                {shared ? copy.t("Link copied") : copy.t("Share")}
              </button>
            )}
            {onAddAnother && (
              <button
                type="button"
                onClick={onAddAnother}
                className="px-2 py-1.5 text-[12.5px] font-semibold text-admin-ink-muted"
              >
                {copy.t("Add another")}
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.t("Close")}
          className="-mr-1 rounded-full px-2 text-[18px] leading-none text-admin-ink-dim"
        >
          ×
        </button>
      </div>
    </div>
  );
}
