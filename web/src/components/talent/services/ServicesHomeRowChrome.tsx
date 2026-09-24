"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { publicationLabel, publicationWord } from "@/lib/talent/publication-state";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function HideOutcome({
  item,
  failed,
  shown,
  onRetry,
  onShow,
  onHide,
}: {
  item: TalentOffering;
  failed: boolean;
  shown: boolean;
  onRetry: () => void;
  onShow: () => void;
  onHide: () => void;
}) {
  const copy = useDashboardText();
  const locale = copy.isSpanish ? "es" : "en";
  const word = publicationWord(item);
  if (!failed && word !== "hidden" && !shown) return null;
  const label = failed
    ? copy.t("Could not hide it")
    : publicationLabel(failed ? "live" : word === "hidden" ? "hidden" : "live", locale);
  const sentence = failed
    ? copy.t("It is still public and nothing was lost. Try again, or we will chase the hub.")
    : word === "hidden"
      ? copy.t("Off every public page. Your bookings for it still stand.")
      : copy.t("Back on both pages with the same link, so nothing you shared is broken.");
  const action = failed ? copy.t("Try again") : word === "hidden" ? copy.t("Show again") : copy.t("Hide");
  const run = failed ? onRetry : word === "hidden" ? onShow : onHide;
  return (
    <div className="flex w-full items-center gap-3 pl-[60px]">
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${failed ? "bg-[rgba(176,32,32,0.1)] text-[#8A1F1F]" : word === "hidden" ? "bg-[rgba(11,11,13,0.08)] text-admin-ink-muted" : "bg-[rgba(15,79,62,0.12)] text-[#0F4F3E]"}`}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[12px] text-admin-ink-muted">{sentence}</span>
      <button type="button" className="shrink-0 rounded-full border border-admin-border-soft px-3 py-1.5 text-[13px]" onClick={run}>
        {action}
      </button>
    </div>
  );
}

export function RowMenu({
  item,
  filter,
  onClose,
  onEdit,
  onPreview,
  onShare,
  onDuplicate,
  onHide,
  onShow,
  onArchive,
  onRestore,
  onDelete,
  onMove,
}: {
  item: TalentOffering;
  filter: string;
  onClose: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onShare: () => void;
  onDuplicate: () => void;
  onHide: () => void;
  onShow: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const copy = useDashboardText();
  const word = publicationWord(item);
  return (
    <div className="absolute right-0 top-10 z-20 w-52 rounded-xl border border-admin-border-soft bg-white py-1 shadow-admin-rest">
      <MenuBtn onClick={() => { onEdit(); onClose(); }}>{copy.t("Edit")}</MenuBtn>
      <MenuBtn onClick={() => { onPreview(); onClose(); }}>{copy.t("Preview as customer")}</MenuBtn>
      {word === "live" && <MenuBtn onClick={() => { onShare(); onClose(); }}>{copy.t("Share")}</MenuBtn>}
      <MenuBtn onClick={() => { onDuplicate(); onClose(); }}>{copy.t("Duplicate")}</MenuBtn>
      {word === "live" && <MenuBtn onClick={() => { onHide(); onClose(); }}>{copy.t("Hide")}</MenuBtn>}
      {word === "hidden" && <MenuBtn onClick={() => { onShow(); onClose(); }}>{copy.t("Show again")}</MenuBtn>}
      {word !== "archived" && <MenuBtn onClick={() => { onArchive(); onClose(); }}>{copy.t("Archive")}</MenuBtn>}
      {word === "archived" && <MenuBtn onClick={() => { onRestore(); onClose(); }}>{copy.t("Restore")}</MenuBtn>}
      {word === "archived" && <MenuBtn onClick={() => { onDelete(); onClose(); }}>{copy.t("Delete forever")}</MenuBtn>}
      {filter === "all" && (
        <>
          <MenuBtn onClick={() => { onMove(-1); onClose(); }}>{copy.t("Move up")}</MenuBtn>
          <MenuBtn onClick={() => { onMove(1); onClose(); }}>{copy.t("Move down")}</MenuBtn>
        </>
      )}
    </div>
  );
}

export function listPrice(item: TalentOffering, quoted: string): string {
  if (item.amountCents == null || item.priceDisplay === "quote") return quoted;
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(item.amountCents / 100);
  return `$${amount} ${item.currency}`;
}

function MenuBtn({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[rgba(11,11,13,0.04)]">
      {children}
    </button>
  );
}
