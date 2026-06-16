"use client";

/**
 * CatalogStudioView — Builder Studio WS-B B3.
 *
 * The taxonomy editor for the "+" gallery. Where the Component Catalog governs
 * per-ITEM visibility/metadata, the Studio reshapes the STRUCTURE: rename /
 * reorder / hide tabs, rename / create / reorder / hide categories (sections),
 * and drag a component from one tab/category to another. Every mutation calls a
 * shipped server action (`catalog-structure-actions.ts`), then re-fetches the
 * structure + items and reflects optimistically.
 *
 * Renders a TREE: tab → category → item. Reorders + cross-container moves use
 * native HTML5 drag-and-drop (no new deps). The same structure rows drive the
 * live galleries + the Lab catalog on next open (the actions bump the catalog
 * version + revalidate).
 */

import { useCallback, useEffect, useState } from "react";

import {
  type AddGalleryTab,
  type CatalogAdminItem,
} from "@/lib/site-admin/add-gallery";
import {
  resolveTabs,
  resolveCategoriesForTab,
  type CatalogStructureMap,
} from "@/lib/site-admin/add-gallery/catalog-structure";
import {
  listCatalogStructure,
  setTabOverride,
  setCategoryOverride,
  reorderTabs,
  reorderCategories,
  moveItem,
  deleteStructureRow,
  type StructureActionResult,
} from "@/lib/site-admin/add-gallery/catalog-structure-actions";
import { loadCatalogAdminView } from "@/lib/site-admin/add-gallery/catalog-admin-view-action";

import { LAB as T, RADII, fieldStyle, LabChip, LabToast } from "./ui";
import {
  slugifyCategory,
  readDrag,
  writeDrag,
  hasCatalogDrag,
  hiddenTabs,
  hiddenCategoriesByTab,
  DragHandle,
  InlineRename,
  RowActions,
  HideToggle,
  RevertBtn,
  HiddenRestoreRow,
} from "./catalog-studio-kit";

// ── view ───────────────────────────────────────────────────────────────────────

type ResolvedTab = { id: AddGalleryTab; label: string };

export function CatalogStudioView() {
  const [structure, setStructure] = useState<CatalogStructureMap | null>(null);
  const [items, setItems] = useState<CatalogAdminItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const reload = useCallback(async () => {
    const [s, it] = await Promise.all([
      listCatalogStructure(),
      loadCatalogAdminView(),
    ]);
    setStructure(s);
    setItems(it);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCatalogStructure(), loadCatalogAdminView()])
      .then(([s, it]) => {
        if (cancelled) return;
        setStructure(s);
        setItems(it);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load the catalog structure.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Run a structure action, surface its error, then re-fetch + flash. */
  const run = useCallback(
    async (
      action: () => Promise<StructureActionResult<unknown>>,
      successMsg: string,
    ) => {
      setBusy(true);
      setError(null);
      try {
        const res = await action();
        if (!res.ok) {
          setError(res.error);
        } else {
          flash(successMsg);
        }
        await reload();
      } catch {
        setError("Update failed.");
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [reload, flash],
  );

  if (error && !structure) {
    return <div style={{ color: T.red, fontSize: 13 }}>{error}</div>;
  }
  if (!structure || !items) {
    return (
      <div style={{ color: T.inkMuted, fontSize: 13, padding: "8px 0" }}>
        Loading the catalog structure…
      </div>
    );
  }

  const tabs = resolveTabs(structure) as ResolvedTab[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
          Catalog Studio
        </div>
        <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 2, maxWidth: 640, lineHeight: 1.5 }}>
          Reshape the “+” gallery taxonomy. Drag a tab, category, or component to
          reorder or move it; rename inline; hide what tenants shouldn’t see.
          Changes reflect in both live builders + the Lab on next open.
        </div>
      </div>

      {error ? <div style={{ fontSize: 12, color: T.red }}>{error}</div> : null}
      {toast ? <LabToast>{toast}</LabToast> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tabs.map((tab, idx) => (
          <TabNode
            key={tab.id}
            tab={tab}
            index={idx}
            tabOrder={tabs}
            structure={structure}
            items={items}
            busy={busy}
            run={run}
          />
        ))}
      </div>

      <HiddenRestoreRow
        label="Hidden tabs"
        entries={hiddenTabs(structure)}
        disabled={busy}
        onRestore={(id) =>
          void run(
            () => setTabOverride({ tabId: id, hidden: false }),
            "Tab shown ✓",
          )
        }
      />

      <p style={{ fontSize: 11.5, color: T.inkDim, lineHeight: 1.5, margin: 0 }}>
        Hidden tabs/categories are removed from the live gallery (subtract-only).
        “Revert” drops the override so the tab/category/item returns to its
        built-in default. Moving a component changes which tab + category it
        appears under everywhere the gallery renders.
      </p>
    </div>
  );
}

// ── tab node ────────────────────────────────────────────────────────────────────

function TabNode({
  tab,
  index,
  tabOrder,
  structure,
  items,
  busy,
  run,
}: {
  tab: ResolvedTab;
  index: number;
  tabOrder: ResolvedTab[];
  structure: CatalogStructureMap;
  items: CatalogAdminItem[];
  busy: boolean;
  run: (
    action: () => Promise<StructureActionResult<unknown>>,
    msg: string,
  ) => Promise<void>;
}) {
  const [dropEdge, setDropEdge] = useState<"before" | "after" | "inside" | null>(
    null,
  );
  const tabOverridden = Boolean(structure[`tab:${tab.id}`]);
  const cats = resolveCategoriesForTab(tab.id, structure);
  const hiddenCats = hiddenCategoriesByTab(structure)[tab.id] ?? [];

  const onReorderTab = useCallback(
    (fromTabId: string) => {
      const order = tabOrder.map((t) => t.id);
      const from = order.indexOf(fromTabId as AddGalleryTab);
      if (from < 0 || from === index) return;
      const next = order.filter((id) => id !== fromTabId);
      next.splice(index, 0, fromTabId as AddGalleryTab);
      void run(() => reorderTabs(next), "Tabs reordered ✓");
    },
    [tabOrder, index, run],
  );

  return (
    <section
      style={{
        background: T.card,
        border: `1px solid ${dropEdge === "inside" ? T.accent : T.borderSoft}`,
        borderTop:
          dropEdge === "before" ? `2px solid ${T.accent}` : undefined,
        borderBottom:
          dropEdge === "after" ? `2px solid ${T.accent}` : undefined,
        borderRadius: RADII.card,
        overflow: "hidden",
      }}
      onDragOver={(e) => {
        if (!hasCatalogDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        const payload = readDrag(e);
        setDropEdge(null);
        if (!payload) return;
        if (payload.dragKind === "tab") {
          e.preventDefault();
          onReorderTab(payload.tabId);
        }
      }}
    >
      {/* Tab header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          background: T.cardSoft,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}
        onDragOver={(e) => {
          if (!hasCatalogDrag(e)) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          setDropEdge(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
        }}
        onDragLeave={() => setDropEdge(null)}
        onDrop={(e) => {
          const payload = readDrag(e);
          setDropEdge(null);
          if (payload?.dragKind === "tab") {
            e.preventDefault();
            e.stopPropagation();
            onReorderTab(payload.tabId);
          }
        }}
      >
        <DragHandle
          ariaLabel={`Reorder tab ${tab.label}`}
          draggable={!busy}
          onDragStart={(e) => writeDrag(e, { dragKind: "tab", tabId: tab.id })}
        />
        <InlineRename
          value={tab.label}
          ariaLabel={`Rename tab ${tab.label}`}
          disabled={busy}
          bold
          onCommit={(label) => {
            if (label === tab.label) return;
            void run(
              () => setTabOverride({ tabId: tab.id, label_override: label || null }),
              "Tab renamed ✓",
            );
          }}
        />
        <span style={{ fontSize: 10.5, color: T.inkDim, fontFamily: "ui-monospace, monospace" }}>
          {tab.id}
        </span>
        <div style={{ flex: 1 }} />
        <RowActions>
          <HideToggle
            hidden={false}
            disabled={busy}
            onClick={() =>
              void run(
                () => setTabOverride({ tabId: tab.id, hidden: true }),
                "Tab hidden ✓",
              )
            }
            label="Hide tab"
          />
          {tabOverridden ? (
            <RevertBtn
              disabled={busy}
              onClick={() =>
                void run(
                  () => deleteStructureRow(`tab:${tab.id}`),
                  "Tab reverted ✓",
                )
              }
            />
          ) : null}
        </RowActions>
      </div>

      {/* Categories */}
      <div style={{ padding: "8px 10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {cats.length === 0 ? (
          <div
            style={{
              fontSize: 11.5,
              color: T.inkDim,
              padding: "8px 10px",
              border: `1px dashed ${T.border}`,
              borderRadius: 6,
              fontStyle: "italic",
            }}
          >
            No categories yet — add one below to group this tab&apos;s components.
          </div>
        ) : (
          cats.map((cat, catIdx) => (
            <CategoryNode
              key={cat.id}
              cat={cat}
              index={catIdx}
              parentTab={tab.id}
              catOrder={cats.map((c) => c.id)}
              structure={structure}
              items={items}
              busy={busy}
              run={run}
            />
          ))
        )}
        <AddCategoryRow
          parentTab={tab.id}
          existing={cats.map((c) => c.id)}
          disabled={busy}
          run={run}
        />
        <HiddenRestoreRow
          label="Hidden categories"
          entries={hiddenCats}
          disabled={busy}
          onRestore={(id) =>
            void run(
              () => setCategoryOverride({ categoryId: id, hidden: false }),
              "Category shown ✓",
            )
          }
        />
      </div>
    </section>
  );
}

// ── category node ────────────────────────────────────────────────────────────────

function CategoryNode({
  cat,
  index,
  parentTab,
  catOrder,
  structure,
  items,
  busy,
  run,
}: {
  cat: { id: string; label: string; icon: string; tab: AddGalleryTab };
  index: number;
  parentTab: AddGalleryTab;
  catOrder: string[];
  structure: CatalogStructureMap;
  items: CatalogAdminItem[];
  busy: boolean;
  run: (
    action: () => Promise<StructureActionResult<unknown>>,
    msg: string,
  ) => Promise<void>;
}) {
  const [drop, setDrop] = useState<"before" | "after" | "inside" | null>(null);
  const catRow = structure[`cat:${cat.id}`];
  const catOverridden = Boolean(catRow);
  // A category the admin created in the Studio (vs a built-in) — flagged so an
  // empty new category reads as intentional, not broken.
  const catCreated = Boolean(catRow?.created);
  const catItems = items.filter(
    (it) => it.tab === parentTab && it.effectiveCategory === cat.id,
  );

  const onReorderCat = useCallback(
    (fromCatId: string) => {
      const from = catOrder.indexOf(fromCatId);
      if (from < 0 || from === index) return;
      const next = catOrder.filter((id) => id !== fromCatId);
      next.splice(index, 0, fromCatId);
      void run(
        () => reorderCategories(parentTab, next),
        "Categories reordered ✓",
      );
    },
    [catOrder, index, parentTab, run],
  );

  const onMoveCatIn = useCallback(
    (catId: string, fromTab: AddGalleryTab) => {
      if (fromTab === parentTab) return;
      void run(
        () =>
          setCategoryOverride({ categoryId: catId, parent_tab: parentTab }),
        "Category moved ✓",
      );
    },
    [parentTab, run],
  );

  const onMoveItemIn = useCallback(
    (itemId: string) => {
      void run(
        () =>
          moveItem({
            itemId,
            parent_tab: parentTab,
            category_override: cat.id,
          }),
        "Component moved ✓",
      );
    },
    [parentTab, cat.id, run],
  );

  return (
    <div
      style={{
        border: `1px solid ${drop === "inside" ? T.accent : T.borderSoft}`,
        borderTop: drop === "before" ? `2px solid ${T.accent}` : undefined,
        borderBottom: drop === "after" ? `2px solid ${T.accent}` : undefined,
        borderRadius: RADII.control,
        background: drop === "inside" ? "rgba(93,211,160,0.06)" : T.bg,
      }}
      onDragOver={(e) => {
        if (!hasCatalogDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // Body-level hover → "drop inside this category". The header handler
        // stops propagation, so hovering the header shows before/after instead.
        setDrop("inside");
      }}
      onDragLeave={(e) => {
        // Only clear when the pointer actually leaves this element.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDrop(null);
      }}
      onDrop={(e) => {
        const payload = readDrag(e);
        setDrop(null);
        if (!payload) return;
        if (payload.dragKind === "item") {
          e.preventDefault();
          e.stopPropagation();
          onMoveItemIn(payload.itemId);
        } else if (payload.dragKind === "category") {
          e.preventDefault();
          e.stopPropagation();
          // Drop a category onto another category in a different tab → move it
          // into this tab; same-tab drops are handled as reorders by the header.
          onMoveCatIn(payload.catId, payload.fromTab);
        }
      }}
    >
      {/* Category header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "8px 10px",
        }}
        onDragOver={(e) => {
          if (!hasCatalogDrag(e)) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setDrop(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
        }}
        onDrop={(e) => {
          const payload = readDrag(e);
          setDrop(null);
          if (payload?.dragKind === "category") {
            e.preventDefault();
            e.stopPropagation();
            if (payload.fromTab === parentTab) onReorderCat(payload.catId);
            else onMoveCatIn(payload.catId, payload.fromTab);
          } else if (payload?.dragKind === "item") {
            e.preventDefault();
            e.stopPropagation();
            onMoveItemIn(payload.itemId);
          }
        }}
      >
        <DragHandle
          ariaLabel={`Reorder or move category ${cat.label}`}
          draggable={!busy}
          onDragStart={(e) =>
            writeDrag(e, {
              dragKind: "category",
              catId: cat.id,
              fromTab: parentTab,
            })
          }
        />
        <InlineRename
          value={cat.label}
          ariaLabel={`Rename category ${cat.label}`}
          disabled={busy}
          onCommit={(label) => {
            if (label === cat.label) return;
            void run(
              () =>
                setCategoryOverride({
                  categoryId: cat.id,
                  label_override: label || null,
                }),
              "Category renamed ✓",
            );
          }}
        />
        {catCreated ? (
          <LabChip tone="accent" title="Created in Catalog Studio (not a built-in category)">
            new
          </LabChip>
        ) : null}
        <span style={{ fontSize: 10, color: T.inkDim }}>
          {catItems.length} component{catItems.length === 1 ? "" : "s"}
        </span>
        <div style={{ flex: 1 }} />
        <RowActions>
          <HideToggle
            hidden={false}
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  setCategoryOverride({ categoryId: cat.id, hidden: true }),
                "Category hidden ✓",
              )
            }
            label="Hide category"
          />
          {catOverridden ? (
            <RevertBtn
              disabled={busy}
              onClick={() =>
                void run(
                  () => deleteStructureRow(`cat:${cat.id}`),
                  "Category reverted ✓",
                )
              }
            />
          ) : null}
        </RowActions>
      </div>

      {/* Items */}
      {catItems.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: "0 10px 8px 30px",
          }}
        >
          {catItems.map((it) => (
            <ItemNode key={it.id} item={it} busy={busy} />
          ))}
        </div>
      ) : (
        // Empty category — make it read as a valid drop target, not broken.
        <div
          style={{
            margin: "0 10px 8px 30px",
            padding: "8px 10px",
            border: `1px dashed ${drop === "inside" ? T.accent : T.border}`,
            borderRadius: 6,
            fontSize: 10.5,
            color: drop === "inside" ? T.accent : T.inkDim,
            fontStyle: "italic",
          }}
        >
          {drop === "inside" ? "Drop to move here" : "Empty — drag a component here"}
        </div>
      )}
    </div>
  );
}

// ── item node ────────────────────────────────────────────────────────────────────

function ItemNode({ item, busy }: { item: CatalogAdminItem; busy: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 8px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <DragHandle
        ariaLabel={`Move component ${item.effectiveLabel}`}
        draggable={!busy}
        onDragStart={(e) => writeDrag(e, { dragKind: "item", itemId: item.id })}
        small
      />
      <span style={{ fontSize: 12, color: T.ink, fontWeight: 500 }}>
        {item.effectiveLabel}
      </span>
      <span style={{ fontSize: 10, color: T.inkDim, fontFamily: "ui-monospace, monospace" }}>
        {item.id}
      </span>
    </div>
  );
}

// ── add category ────────────────────────────────────────────────────────────────

function AddCategoryRow({
  parentTab,
  existing,
  disabled,
  run,
}: {
  parentTab: AddGalleryTab;
  existing: string[];
  disabled: boolean;
  run: (
    action: () => Promise<StructureActionResult<unknown>>,
    msg: string,
  ) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const submit = useCallback(() => {
    const label = name.trim();
    if (!label) return;
    let slug = slugifyCategory(label);
    if (!slug) return;
    // De-dup against existing category ids so the new row doesn't collide.
    if (existing.includes(slug)) {
      let n = 2;
      while (existing.includes(`${slug}-${n}`)) n += 1;
      slug = `${slug}-${n}`;
    }
    void run(
      () =>
        setCategoryOverride({
          categoryId: slug,
          parent_tab: parentTab,
          label_override: label,
          created: true,
        }),
      "Category added ✓",
    ).then(() => {
      setName("");
      setOpen(false);
    });
  }, [name, existing, parentTab, run]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
        style={{
          alignSelf: "flex-start",
          background: "transparent",
          border: `1px dashed ${T.border}`,
          color: T.inkMuted,
          fontSize: 11.5,
          fontWeight: 600,
          padding: "5px 11px",
          borderRadius: 7,
          cursor: disabled ? "default" : "pointer",
          marginTop: 2,
        }}
      >
        + Add category
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            setName("");
            setOpen(false);
          }
        }}
        placeholder="New category name"
        aria-label={`New category in ${parentTab}`}
        style={{ ...fieldStyle, width: 200, outline: "none" }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !name.trim()}
        className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
        style={{
          background: T.accent,
          color: T.accentInk,
          border: "none",
          fontSize: 11.5,
          fontWeight: 700,
          padding: "6px 12px",
          borderRadius: 7,
          cursor: disabled || !name.trim() ? "default" : "pointer",
          opacity: disabled || !name.trim() ? 0.55 : 1,
        }}
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => {
          setName("");
          setOpen(false);
        }}
        className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
        style={{
          background: "transparent",
          border: "none",
          color: T.inkMuted,
          fontSize: 11.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
    </div>
  );
}
