"use client";

/**
 * Phase 4 (T4.4) — Component library panel.
 *
 * A first-class library of saved "living components" (masters), distinct from
 * the "My blocks" inserter: it foregrounds each master's LIVE USAGE COUNT on the
 * current page (how many linked instances reference it) and gives an "Edit
 * master" affordance — insert an editable copy of the master, tweak it on the
 * canvas, then push it back with "Update master" so every linked instance
 * reflects the change.
 *
 * Reuses the same server actions + edit-context mutations as MyBlocksPanel
 * (no new persistence): listBuilderComponents / insertLinkedComponent /
 * insertBuilderComponent / updateSelectedNodeAsComponent / syncComponentInstances.
 * Usage counts come from countComponentInstances against the live builder tree
 * (pure read — no DB round-trip).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listBuilderComponents,
  type BuilderComponentRow,
} from "@/lib/site-admin/edit-mode/builder-components-action";
import { countComponentInstances } from "@/lib/site-admin/builder-node/component-instances";
import { useEditContext } from "../edit-context";
import { useEditorLocale } from "../use-editor-locale";
import { useBuilderTree } from "../builder-tree-bridge";
import { useSelectedBuilderNodeId } from "../selection-bridge";
import { KIT } from "./kit/tokens";

export function ComponentLibraryPanel({
  parentNodeId,
}: {
  /** Container an inserted master/instance becomes a child of. */
  parentNodeId: string;
}) {
  const {
    insertBuilderComponent,
    insertLinkedComponent,
    syncComponentInstances,
    updateSelectedNodeAsComponent,
    selectBuilderNode,
  } = useEditContext();
  // WAVE 4.6 — this panel shipped with zero i18n. Same seam as everywhere else
  // in edit-chrome: `useEditorLocale().t` into the one EN-text-keyed catalog.
  const { t } = useEditorLocale();
  // WS2 — tree VALUE from the micro-store (builder-tree-bridge).
  const builderTree = useBuilderTree();
  // W2 (selection-bridge) — selection VALUE from the micro-store.
  const selectedBuilderNodeId = useSelectedBuilderNodeId();

  const [components, setComponents] = useState<
    ReadonlyArray<BuilderComponentRow>
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await listBuilderComponents();
    if (result.ok) {
      setComponents(result.components);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live usage count per component (linked instances on the current page).
  const usageById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of components) {
      map[c.id] = countComponentInstances(builderTree, c.id);
    }
    return map;
  }, [components, builderTree]);

  const linkableTotal = components.filter(
    (c) => c.rootKind === "container" || c.rootKind === "card",
  ).length;

  async function onInsertLinked(component: BuilderComponentRow) {
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await insertLinkedComponent(
      parentNodeId,
      JSON.stringify(component.subtree),
      component.id,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? t("Couldn't insert the linked instance."));
      return;
    }
    setNote(
      t('Added a linked instance of "{name}".').replace(
        "{name}",
        component.name,
      ),
    );
  }

  async function onEditMaster(component: BuilderComponentRow) {
    // Insert an editable COPY of the master, select it, and prompt the operator
    // to tweak then "Update master". This is the self-contained edit-master flow:
    // there is no separate master canvas — the master is authored as a normal
    // block and pushed back with updateSelectedNodeAsComponent.
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await insertBuilderComponent(
      parentNodeId,
      JSON.stringify(component.subtree),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? t("Couldn't open the master for editing."));
      return;
    }
    if (result.nodeId) selectBuilderNode(result.nodeId);
    setNote(
      t(
        'Editing a copy of "{name}". Tweak it, then use "Update master" below to push your changes to all {count} instance(s).',
      )
        .replace("{name}", component.name)
        .replace("{count}", String(usageById[component.id] ?? 0)),
    );
  }

  async function onUpdateMaster(component: BuilderComponentRow) {
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await updateSelectedNodeAsComponent(component.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? t("Couldn't update the master."));
      return;
    }
    // Live instances reflect the master after publish; sync refreshes in-editor.
    const sync = await syncComponentInstances(
      component.id,
      JSON.stringify(component.subtree),
    );
    setNote(
      sync.ok && sync.synced
        ? t('Updated "{name}" and re-synced {count} instance(s).')
            .replace("{name}", component.name)
            .replace("{count}", String(sync.synced))
        : t(
            'Updated "{name}" master. Published instances reflect it live.',
          ).replace("{name}", component.name),
    );
    void refresh();
  }

  function onShowUsage(component: BuilderComponentRow) {
    // Select the FIRST linked instance of this component so the operator can see
    // where it's used. Pure tree walk — no mutation.
    const firstInstanceId = findFirstInstanceId(
      builderTree as Parameters<typeof findFirstInstanceId>[0],
      component.id,
    );
    if (firstInstanceId) {
      selectBuilderNode(firstInstanceId);
      setNote(
        t('Selected an instance of "{name}".').replace("{name}", component.name),
      );
    } else {
      setNote(
        t('"{name}" has no instances on this page yet.').replace(
          "{name}",
          component.name,
        ),
      );
    }
  }

  return (
    <details
      data-builder-node-component-library=""
      className="rounded-lg border border-stone-200 bg-white px-3 py-2"
    >
      <summary className="cursor-pointer text-[11px] font-semibold text-stone-700">
        {t("Component library")}
        {components.length > 0 ? ` (${components.length})` : ""}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-[10.5px] leading-snug text-stone-500">
          {t(
            "Saved components and where they’re used on this page. Insert a linked instance, or edit a master to update every instance at once.",
          )}
        </p>

        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10.5px] text-rose-700">
            {error}
          </div>
        ) : null}
        {note ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10.5px] text-emerald-700">
            {note}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-md border border-dashed border-stone-300 bg-white px-3 py-3 text-[11px] text-stone-500">
            {t("Loading components…")}
          </div>
        ) : components.length === 0 ? (
          <div className="rounded-md border border-dashed border-stone-300 bg-white px-3 py-3 text-[11px] text-stone-500">
            {t(
              "No saved components yet. Select a block, save it to “My blocks”, then insert it linked to build a component.",
            )}
          </div>
        ) : (
          <>
            {linkableTotal === 0 ? (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10.5px] text-blue-800">
                {t(
                  "Only container/card components can be linked instances. Save a container or card block to use the library.",
                )}
              </div>
            ) : null}
            {components.map((component) => {
              const usage = usageById[component.id] ?? 0;
              const linkable =
                component.rootKind === "container" ||
                component.rootKind === "card";
              return (
                <div
                  key={component.id}
                  data-builder-node-component={component.id}
                  className="flex flex-col gap-2 rounded-md border border-stone-200 bg-[#faf9f6] px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold text-stone-800">
                        {component.name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex text-[10px] font-semibold uppercase tracking-[0.10em] text-stone-500">
                          {component.rootKind} ·{" "}
                          {t("{count} nodes").replace(
                            "{count}",
                            String(component.nodeCount),
                          )}
                        </span>
                        <span
                          data-builder-node-component-usage={component.id}
                          className={
                            usage > 0
                              ? "inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700"
                              : "inline-flex items-center rounded-full bg-stone-200 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600"
                          }
                          title={t("Linked instances on this page")}
                        >
                          {usage} {usage === 1 ? t("instance") : t("instances")}
                        </span>
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {linkable ? (
                      <button
                        type="button"
                        data-builder-node-component-insert-linked={component.id}
                        className={KIT.subtleButton}
                        disabled={busy}
                        onClick={() => void onInsertLinked(component)}
                      >
                        {t("Insert linked")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      data-builder-node-component-edit-master={component.id}
                      title={t("Insert an editable copy of the master to modify it")}
                      className={KIT.subtleButton}
                      disabled={busy}
                      onClick={() => void onEditMaster(component)}
                    >
                      {t("Edit master")}
                    </button>
                    {selectedBuilderNodeId ? (
                      <button
                        type="button"
                        data-builder-node-component-update-master={component.id}
                        title={t(
                          "Push the selected block into this master, instances update live",
                        )}
                        className={KIT.ghostButton}
                        disabled={busy}
                        onClick={() => void onUpdateMaster(component)}
                      >
                        ↑ {t("Update master")}
                      </button>
                    ) : null}
                    {usage > 0 ? (
                      <button
                        type="button"
                        data-builder-node-component-show-usage={component.id}
                        title={t(
                          "Select an instance of this component on the page",
                        )}
                        className={KIT.ghostButton}
                        disabled={busy}
                        onClick={() => onShowUsage(component)}
                      >
                        {t("Find instance")}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </details>
  );
}

/** Find the id of the first linked instance of `componentId` in the tree (the
 * marker lives on container | card nodes), depth-first, or null. Local pure walk
 * mirroring countComponentInstances' traversal. */
function findFirstInstanceId(
  tree: ReadonlyArray<{
    id: string;
    kind: string;
    props?: { instanceOf?: string };
    children?: ReadonlyArray<unknown>;
  }>,
  componentId: string,
): string | null {
  for (const node of tree) {
    if (
      (node.kind === "container" || node.kind === "card") &&
      node.props?.instanceOf === componentId
    ) {
      return node.id;
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      const found = findFirstInstanceId(
        node.children as Parameters<typeof findFirstInstanceId>[0],
        componentId,
      );
      if (found) return found;
    }
  }
  return null;
}
