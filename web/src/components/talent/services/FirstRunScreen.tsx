"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

type Path = "list" | "camera" | "one";

export function FirstRunScreen({
  itemCount,
  onBack,
  onPick,
}: {
  itemCount: number;
  onBack: () => void;
  onPick: (path: Path) => void;
}) {
  const copy = useDashboardText();
  const empty = itemCount === 0;
  return (
    <div className="font-admin-body text-admin-ink">
      <button type="button" className="text-[13px] font-semibold" onClick={onBack}>
        ← {copy.t("Services")}
      </button>
      <h1 className="mt-4 font-admin-display text-[28px] font-semibold">
        {empty ? copy.t("Nothing to sell yet") : copy.t("Add ten in about 15 minutes")}
      </h1>
      <p className="mt-2 max-w-xl text-[14px] text-admin-ink-muted">
        {empty
          ? copy.t("Add your first one. It takes about twenty seconds and nothing is public until you save.")
          : copy.t("Pick how you want to add them. You can stop at any time. Nothing goes live until you publish.")}
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <PathCard
          title={copy.t("Type a list")}
          body={copy.t("Paste names and prices. Review, then publish the ready rows.")}
          onClick={() => onPick("list")}
        />
        <PathCard
          title={copy.t("From the camera")}
          body={copy.t("Take or pick photos, then add a name, a price and a length.")}
          onClick={() => onPick("camera")}
        />
        <PathCard
          title={copy.t("One by one")}
          body={copy.t("Open the full form. Instant booking is already selected.")}
          onClick={() => onPick("one")}
        />
      </div>
    </div>
  );
}

function PathCard({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-admin-border-soft bg-white p-5 text-left"
    >
      <span className="block text-[16px] font-semibold">{title}</span>
      <span className="mt-2 block text-[13px] text-admin-ink-muted">{body}</span>
    </button>
  );
}
