"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { type TalentOffering } from "@/lib/talent/offerings-types";
import { listCategoryUndos } from "@/lib/talent/category-undo";
import { categoryNearMatch } from "@/lib/talent/publication-state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

const NAME_MAX = 80;

type Mode = { kind: "list" } | { kind: "rename"; from: string } | { kind: "merge"; from: string };

/**
 * Categories · order, rename, merge (PDF p33/p34) and A8 Renaming a category (p35).
 * A category is only the text on each item, so merge is a rename into a name that
 * already exists: onMerge(from, into) when given, otherwise onRename(from, into).
 */
export function OrganizeScreen({
  names,
  items,
  talentId,
  onBack,
  onRename,
  onOrder,
  onMerge,
  onUndo,
}: {
  names: string[];
  items: TalentOffering[];
  talentId?: string;
  onBack: () => void;
  onRename: (from: string, to: string) => Promise<void>;
  onOrder: (next: string[]) => Promise<void>;
  onMerge?: (from: string, into: string) => Promise<void>;
  onUndo?: () => Promise<void>;
}) {
  const copy = useDashboardText();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const undos = talentId ? listCategoryUndos(talentId) : [];

  const inCategory = (name: string) => items.filter((i) => i.category === name);
  const uncategorised = items.filter((i) => !i.category || !names.includes(i.category));

  if (mode.kind === "rename") {
    return (
      <RenameView
        from={mode.from}
        rows={inCategory(mode.from)}
        taken={names.filter((n) => n !== mode.from)}
        busy={busy}
        onCancel={() => setMode({ kind: "list" })}
        onConfirm={async (to) => {
          setBusy(true);
          try {
            await onRename(mode.from, to);
            setMode({ kind: "list" });
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= names.length || from === to) return;
    const next = [...names];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void onOrder(next);
  };

  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      reorder(index, index - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      reorder(index, index + 1);
    }
  };

  const mergeFrom = mode.kind === "merge" ? mode.from : null;

  return (
    <div className="font-admin-body text-admin-ink">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-admin-display text-[24px] font-semibold leading-tight">{copy.t("Categories")}</h1>
          <p className="mt-1 text-[13px] text-admin-ink-dim">
            {names.length} {copy.t("categories")} · {items.length} {copy.t("items")} · {uncategorised.length} {copy.t("uncategorised")}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-admin-border-soft bg-white px-4 py-2 text-[14px] font-semibold"
        >
          {copy.t("Done")}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-[200px] flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-admin-ink-dim">{copy.t("New category")}</span>
          <input
            value={newName}
            maxLength={NAME_MAX}
            onChange={(e) => setNewName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-admin-border-soft px-3 py-2 text-[14px]"
            placeholder={copy.t("A word you type on an item")}
          />
        </label>
        <button
          type="button"
          className="rounded-lg border border-admin-border-soft px-3 py-2 text-[13px] font-semibold"
          onClick={() => {
            const next = newName.trim();
            if (!next || names.includes(next) || names.some((name) => categoryNearMatch(next, name))) return;
            void onOrder([...names, next]);
            setNewName("");
          }}
        >
          {copy.t("Add")}
        </button>
        {(() => {
          const typed = newName.trim();
          const hit = typed && !names.includes(typed) ? names.find((name) => categoryNearMatch(typed, name)) : undefined;
          return hit ? (
            <p className="w-full text-[12.5px] text-amber-800">
              {copy.t("That looks like")} {hit}.
            </p>
          ) : null;
        })()}
        {onUndo && undos[0] && (
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-[13px] font-semibold text-admin-brand"
            onClick={() => void onUndo()}
          >
            {copy.t("Undo")} · {undos[0].to} → {undos[0].from}
          </button>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <section className="overflow-hidden rounded-xl border border-admin-border-soft bg-white">
            <header className="flex items-center justify-between bg-admin-ink/[0.02] px-4 py-3">
              <h2 className="text-[14px] font-semibold">{copy.t("The order clients see")}</h2>
              <span className="text-[12px] text-admin-ink-dim">{copy.t("Drag to reorder")}</span>
            </header>
            <ul>
              {names.map((name, index) => {
                const rows = inCategory(name);
                const photos = rows.filter((i) => i.imageUrls.length > 0).length;
                const cover = rows.find((i) => i.imageUrls.length > 0)?.imageUrls[0];
                return (
                  <li
                    key={name}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) reorder(dragIndex, index);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    className={`border-t border-admin-border-soft ${dragIndex === index ? "bg-emerald-900/[0.06]" : ""}`}
                  >
                    <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
                      <button
                        type="button"
                        aria-label={copy.t("Drag to reorder")}
                        onKeyDown={(e) => onHandleKey(e, index)}
                        className="cursor-grab px-1 text-admin-ink-dim"
                      >
                        ⋯
                      </button>
                      <Thumb url={cover} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{name}</span>
                        <span className="block text-[12px] text-admin-ink-dim">
                          {rows.length} {copy.t("items")} · {photos} {copy.t("with a photo")}
                        </span>
                      </span>
                      <span className="hidden items-center gap-2 sm:flex">
                        <button
                          type="button"
                          onClick={() => setMode({ kind: "rename", from: name })}
                          className="rounded-lg border border-admin-border-soft bg-white px-3 py-1.5 text-[13px] font-semibold"
                        >
                          {copy.t("Rename")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode(mergeFrom === name ? { kind: "list" } : { kind: "merge", from: name })}
                          className="px-3 py-1.5 text-[13px] font-semibold text-admin-ink-muted"
                        >
                          {copy.t("Merge")}
                        </button>
                      </span>
                      <button
                        type="button"
                        aria-label={copy.t("Rename")}
                        onClick={() => setMode({ kind: "rename", from: name })}
                        className="text-[18px] text-admin-ink-dim sm:hidden"
                      >
                        ›
                      </button>
                    </div>
                    {mergeFrom === name && (
                      <div className="border-t border-admin-border-soft bg-emerald-900/[0.06] px-4 py-3">
                        <p className="text-[13px] font-semibold">{copy.t("Move its items into")}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {names.filter((n) => n !== name).map((into) => (
                            <button
                              key={into}
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await (onMerge ?? onRename)(name, into);
                                  setMode({ kind: "list" });
                                } finally {
                                  setBusy(false);
                                }
                              }}
                              className="rounded-full border border-admin-border-soft bg-white px-3 py-1 text-[13px]"
                            >
                              {into}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setMode({ kind: "list" })}
                            className="px-3 py-1 text-[13px] text-admin-ink-muted"
                          >
                            {copy.t("Cancel")}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              <li className="flex items-center gap-3 border-t border-admin-border-soft px-3 py-3 sm:px-4">
                <span className="px-1 text-admin-ink-dim opacity-0">⋯</span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-admin-border-soft text-admin-ink-dim">+</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{copy.t("Everything else")}</span>
                  <span className="block text-[12px] text-admin-ink-dim">
                    {uncategorised.length} {copy.t("items")} · {uncategorised.filter((i) => i.imageUrls.length > 0).length} {copy.t("with a photo")}
                  </span>
                </span>
                {uncategorised.length === 0 && (
                  <span className="rounded-md bg-admin-ink/[0.05] px-2 py-0.5 text-[11px] font-semibold text-admin-ink-muted">
                    {copy.t("Empty · will disappear")}
                  </span>
                )}
              </li>
            </ul>
          </section>

          <div className="mt-4 flex gap-3 rounded-xl border border-admin-border-soft bg-white px-4 py-3">
            <span className="font-semibold">!</span>
            <div>
              <p className="text-[14px] font-semibold">
                <span className="hidden sm:inline">{copy.t("Category order is saved")}</span>
                <span className="sm:hidden">{copy.t("Order is saved")}</span>
              </p>
              <p className="mt-0.5 hidden text-[13px] text-admin-ink-muted sm:block">
                {copy.t("This order is used on your public pages and in the services menu block.")}
              </p>
              <p className="mt-0.5 text-[13px] text-admin-ink-muted sm:hidden">
                {copy.t("This order is used on your public pages.")}
              </p>
            </div>
          </div>
        </div>

        <aside className="hidden w-full lg:block" style={{ maxWidth: 384 }}>
          <div className="rounded-xl border border-admin-border-soft bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-admin-ink-dim">{copy.t("What each action really does")}</p>
            <dl className="mt-3 grid grid-cols-[88px_1fr] gap-x-4 gap-y-3 text-[13px]">
              <dt className="font-semibold">{copy.t("Rename")}</dt>
              <dd className="text-admin-ink-muted">{copy.t("Renames it on every item in that category.")}</dd>
              <dt className="font-semibold">{copy.t("Merge")}</dt>
              <dd className="text-admin-ink-muted">{copy.t("Moves its items into a category you already have. The empty one disappears by itself.")}</dd>
              <dt className="font-semibold">{copy.t("Empty")}</dt>
              <dd className="text-admin-ink-muted">{copy.t("Not an action. A category with nothing in it simply stops appearing.")}</dd>
            </dl>
          </div>
          <p className="mt-6 px-4 text-[13px] text-admin-ink-muted">
            {copy.t("A category is a name you type on an item, so two spellings of the same word can both exist. That is why Add warns you about a near match while you are typing, rather than here, once your page already shows two headings.")}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Thumb({ url }: { url?: string }) {
  if (!url) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-admin-border-soft text-admin-ink-dim">
        +
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />;
}

function RenameView({
  from,
  rows,
  taken,
  busy,
  onCancel,
  onConfirm,
}: {
  from: string;
  rows: TalentOffering[];
  taken: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (to: string) => Promise<void>;
}) {
  const copy = useDashboardText();
  const [to, setTo] = useState(from);
  const next = to.trim();
  const clash = taken.find((n) => n.toLowerCase() === next.toLowerCase());
  const canSave = next.length > 0 && next !== from && !busy;
  const shown = next || from;

  return (
    <div className="font-admin-body text-admin-ink">
      <h1 className="font-admin-display text-[24px] font-semibold leading-tight">{copy.t("Rename a category")}</h1>
      <p className="mt-1 text-[13px] text-admin-ink-dim">
        {from} → {shown}
      </p>

      <div className="mx-auto mt-6" style={{ maxWidth: 940 }}>
        <div className="rounded-xl border border-admin-border-soft bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-admin-ink-dim line-through">{from}</p>
              <input
                aria-label={copy.t("New name")}
                autoFocus
                maxLength={NAME_MAX}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full bg-transparent text-[20px] font-semibold outline-none"
              />
            </div>
            <span className="shrink-0 rounded-md bg-emerald-900/[0.06] px-2 py-0.5 text-[12px] font-semibold text-emerald-900">
              {rows.length} {copy.t("items follow")}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-admin-ink-dim">
            {NAME_MAX - to.length} {copy.t("of 80 characters left")}
          </p>
          {clash && (
            <p className="mt-2 text-[13px] text-admin-ink-muted">
              {copy.t("You already have this category. Renaming into it merges the two.")}
            </p>
          )}
        </div>

        <section className="mt-4 overflow-hidden rounded-xl border border-admin-border-soft bg-white">
          <header className="bg-admin-ink/[0.02] px-4 py-3">
            <h2 className="text-[14px] font-semibold">{copy.t("The rows that change")}</h2>
          </header>
          <ul>
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 border-t border-admin-border-soft px-4 py-3">
                <Thumb url={row.imageUrls[0]} />
                <span className="min-w-0 flex-1 truncate text-[14px]">{row.title}</span>
                <span className="hidden truncate text-[12px] text-admin-ink-dim line-through sm:inline">{from}</span>
                <span className="hidden text-admin-ink-dim sm:inline">→</span>
                <span className="shrink-0 text-[13px] font-semibold">{shown}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Note tag={copy.t("What changes")} accent>
            {copy.t("The heading on your directory profile, your free page and your website. All three read from the same column, so they change together within a few minutes.")}
          </Note>
          <Note tag={copy.t("What does not")}>
            {copy.t("Nothing about the items themselves: same prices, same photos, same bookings, same links. A category is only the word above them.")}
          </Note>
          <Note tag={copy.t("What we cannot promise")}>
            {copy.t("A link someone saved to the old heading. No category has an address today, so there is nothing to redirect.")}
          </Note>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-[14px] font-semibold">
            {copy.t("Cancel")}
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void onConfirm(next)}
            className="rounded-lg bg-emerald-900 px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            {copy.t("Rename all")} {rows.length}
          </button>
        </div>
      </div>
    </div>
  );
}

function Note({ tag, accent, children }: { tag: string; accent?: boolean; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-admin-border-soft bg-white p-4">
      <span
        className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${
          accent ? "bg-emerald-900/[0.06] text-emerald-900" : "bg-admin-ink/[0.05] text-admin-ink-muted"
        }`}
      >
        {tag}
      </span>
      <p className="mt-3 text-[13px] text-admin-ink-muted">{children}</p>
    </div>
  );
}
