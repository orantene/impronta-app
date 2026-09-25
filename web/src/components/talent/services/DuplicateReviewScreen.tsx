"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { publicationWord } from "@/lib/talent/publication-state";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function DuplicateReviewScreen({
  original,
  copyItem,
  bookingCount,
  reviewCount,
  onDiscard,
  onSaveDraft,
  onPublish,
  onEdit,
}: {
  original: TalentOffering;
  copyItem: TalentOffering;
  bookingCount: number | null;
  reviewCount: number | null;
  onDiscard: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
  onPublish: () => Promise<void>;
  onEdit: () => void;
}) {
  const copy = useDashboardText();
  return (
    <div className="font-admin-body">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-admin-display text-[28px] font-semibold text-admin-ink">{copyItem.title}</h1>
          <p className="text-[13px] text-admin-ink-muted">
            {copy.t("Draft")} · {copy.t("copied from")} {original.title} {copy.t("a moment ago")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-full px-3 py-1.5 text-[13px] text-admin-ink-muted" onClick={() => void onDiscard()}>
            {copy.t("Discard the copy")}
          </button>
          <button type="button" className="rounded-full border border-admin-border-soft px-3 py-1.5 text-[13px]" onClick={() => void onSaveDraft()}>
            {copy.t("Save draft")}
          </button>
          <button type="button" className="rounded-full bg-admin-brand px-3 py-1.5 text-[13px] font-semibold text-white" onClick={() => void onPublish()}>
            {copy.t("Publish service")}
          </button>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-admin-border-soft bg-amber-50 px-4 py-3 text-[13.5px] text-admin-ink">
        {copy.t("This is a new draft. Nobody can see it and it is not yet in your catalogue as a second live item. Rename it before you publish, or your clients will see two services with the same name.")}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-admin-border-soft bg-white px-5 py-5">
            <h2 className="text-[16px] font-semibold">{copy.t("What came across")}</h2>
            <ul className="mt-3 space-y-2 text-[13.5px]">
              <li>{copy.t("Name")} · {copy.t("marked as a copy until you rename it")}</li>
              <li>{copy.t("Photos")} · {copyItem.imageUrls.length} {copy.t("photos, the same files, still tagged to both services")}</li>
              <li>{copy.t("Price and length")} · {copy.t("copied, change them freely")}</li>
              <li>{copy.t("Booking rules")} · {copy.t("copied")}</li>
            </ul>
            <button type="button" className="mt-3 text-[13px] font-semibold text-admin-brand" onClick={onEdit}>
              {copy.t("Edit")}
            </button>
          </section>
          <section className="rounded-2xl border border-admin-border-soft bg-white px-5 py-5">
            <h2 className="text-[16px] font-semibold">{copy.t("What stayed with the original")}</h2>
            <ul className="mt-3 space-y-2 text-[13.5px] text-admin-ink-muted">
              <li>
                ✕ {bookingCount == null ? copy.t("Bookings") : `${bookingCount} ${copy.t("bookings")}`}
              </li>
              <li>
                ✕ {reviewCount == null ? copy.t("Reviews") : `${reviewCount} ${copy.t("reviews")}`}
              </li>
              <li>✕ {copy.t("Its sales history")}</li>
              <li>✕ {copy.t("Its public link")}</li>
            </ul>
            <p className="mt-3 text-[12.5px] text-admin-ink-dim">
              {copy.t("A copy is a new thing. It starts with no history of its own, which is what makes it safe to experiment with.")}
            </p>
          </section>
        </div>
        <aside className="rounded-2xl border border-admin-border-soft bg-white px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-admin-ink-dim">
            {copy.t("Your catalogue after publishing")}
          </p>
          <ul className="mt-3 space-y-2 text-[13.5px]">
            <li className="rounded-lg bg-black/[0.03] px-3 py-2">{original.title}</li>
            <li className="rounded-lg border border-emerald-900/40 bg-emerald-900/[0.06] px-3 py-2">
              {copyItem.title} · {publicationWord(copyItem) === "live" ? copy.t("Live") : copy.t("Draft")}
            </li>
          </ul>
          <p className="mt-3 text-[12.5px] text-admin-ink-dim">
            {copy.t("Two separate rows. The original keeps its bookings and its link; the copy is a draft until you publish it.")}
          </p>
        </aside>
      </div>
    </div>
  );
}
