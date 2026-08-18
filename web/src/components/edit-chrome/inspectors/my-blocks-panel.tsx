"use client";

/**
 * Living components — "My blocks" inspector panel.
 *
 * Save the selected block as a reusable component, and insert any saved block
 * as a child of the current container. Backed by cms_builder_components via
 * the builder-components server actions; insert re-mints node ids (copies).
 */

import { useCallback, useEffect, useState } from "react";

import {
  listBuilderComponents,
  deleteBuilderComponent,
  type BuilderComponentRow,
} from "@/lib/site-admin/edit-mode/builder-components-action";
import { useEditContext } from "../edit-context";
import { useEditorLocale } from "../use-editor-locale";
import { useSelectedBuilderNodeId } from "../selection-bridge";
import { fetchFreshMasterSubtreeJson } from "./component-master-sync";
import { KIT } from "./kit/tokens";

export function MyBlocksPanel({
  parentNodeId,
}: {
  /** Container the inserted block becomes a child of. */
  parentNodeId: string;
}) {
  const {
    insertBuilderComponent,
    insertLinkedComponent,
    syncComponentInstances,
    saveSelectedNodeAsComponent,
    updateSelectedNodeAsComponent,
  } = useEditContext();
  // WAVE 4.6 — this panel shipped with zero i18n. Same seam as everywhere else
  // in edit-chrome: `useEditorLocale().t` into the one EN-text-keyed catalog.
  const { t } = useEditorLocale();
  // W2 (selection-bridge) — selection VALUE from the micro-store.
  const selectedBuilderNodeId = useSelectedBuilderNodeId();
  const [components, setComponents] = useState<
    ReadonlyArray<BuilderComponentRow>
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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

  async function onSave() {
    const name = nameDraft.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const result = await saveSelectedNodeAsComponent(name);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? t("Couldn't save the block."));
      return;
    }
    setNaming(false);
    setNameDraft("");
    void refresh();
  }

  async function onInsert(component: BuilderComponentRow) {
    setBusy(true);
    setError(null);
    const result = await insertBuilderComponent(
      parentNodeId,
      JSON.stringify(component.subtree),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? t("Couldn't insert the block."));
    }
  }

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
    setNote(t("Linked instance inserted. Edit the master then Sync."));
  }

  async function onSyncInstances(component: BuilderComponentRow) {
    setBusy(true);
    setError(null);
    setNote(null);
    // Sync from a FRESH server read of the master. The panel-state row can be
    // a version behind (e.g. right after "Update master"), and syncing with it
    // used to revert this page's instances to the pre-update content.
    const freshJson = await fetchFreshMasterSubtreeJson(
      component.id,
      listBuilderComponents,
    );
    if (!freshJson) {
      setBusy(false);
      setError(t("Couldn't load the latest master. Try again."));
      return;
    }
    const result = await syncComponentInstances(component.id, freshJson);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? t("Couldn't sync instances."));
      return;
    }
    setNote(
      result.synced
        ? (result.synced === 1
            ? t("Synced {count} instance.")
            : t("Synced {count} instances.")
          ).replace("{count}", String(result.synced))
        : t("No linked instances of this block on the page."),
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
    setNote(
      t(
        'Updated "{name}" master. Published instances reflect it live; in-editor, Sync to refresh.',
      ).replace("{name}", component.name),
    );
    void refresh();
  }

  async function onDelete(component: BuilderComponentRow) {
    setBusy(true);
    setError(null);
    const result = await deleteBuilderComponent({ componentId: component.id });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? t("Couldn't delete the block."));
      return;
    }
    void refresh();
  }

  return (
    <details
      data-builder-node-my-blocks=""
      className="rounded-lg border border-stone-200 bg-white px-3 py-2"
    >
      <summary className="cursor-pointer text-[11px] font-semibold text-stone-700">
        {t("My blocks")}
        {components.length > 0 ? ` (${components.length})` : ""}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {/* Save the current block */}
        {naming ? (
          <div className="flex flex-col gap-2 rounded-md border border-stone-200 bg-[#faf9f6] p-2">
            <input
              autoFocus
              type="text"
              value={nameDraft}
              maxLength={120}
              placeholder={t("Name this block (e.g. Pricing card)")}
              className={KIT.input}
              onChange={(e) => setNameDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSave();
                if (e.key === "Escape") {
                  setNaming(false);
                  setNameDraft("");
                }
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={KIT.primaryButton}
                disabled={busy || !nameDraft.trim()}
                onClick={() => void onSave()}
              >
                {busy ? t("Saving…") : t("Save block")}
              </button>
              <button
                type="button"
                className={KIT.ghostButton}
                onClick={() => {
                  setNaming(false);
                  setNameDraft("");
                }}
              >
                {t("Cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-builder-node-save-as-block=""
            className={KIT.subtleButton}
            onClick={() => setNaming(true)}
          >
            ⊕ {t("Save this block to My blocks")}
          </button>
        )}

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

        {/* Saved blocks list */}
        {loading ? (
          <div className="rounded-md border border-dashed border-stone-300 bg-white px-3 py-3 text-[11px] text-stone-500">
            {t("Loading saved blocks…")}
          </div>
        ) : components.length === 0 ? (
          <div className="rounded-md border border-dashed border-stone-300 bg-white px-3 py-3 text-[11px] text-stone-500">
            {t(
              "No saved blocks yet. Select a block and save it to reuse it anywhere.",
            )}
          </div>
        ) : (
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder={t("Search blocks…")}
              className={KIT.input}
              aria-label={t("Search blocks…")}
            />
            {components.filter((component) =>
              component.name.toLowerCase().includes(query.trim().toLowerCase()),
            ).length === 0 ? (
              <div className="rounded-md border border-dashed border-stone-300 bg-white px-3 py-3 text-[11px] text-stone-500">
                {t("No components match this search.")}
              </div>
            ) : (
              components
                .filter((component) =>
                  component.name
                    .toLowerCase()
                    .includes(query.trim().toLowerCase()),
                )
                .map((component) => (
            <div
              key={component.id}
              data-builder-node-my-block={component.id}
              className="flex items-start gap-3 rounded-md border border-stone-200 bg-[#faf9f6] px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-stone-800">
                  {component.name}
                </span>
                <span className="mt-0.5 inline-flex text-[10px] font-semibold uppercase tracking-[0.10em] text-stone-500">
                  {component.rootKind} ·{" "}
                  {t("{count} nodes").replace(
                    "{count}",
                    String(component.nodeCount),
                  )}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  data-builder-node-my-block-insert={component.id}
                  className={KIT.subtleButton}
                  disabled={busy}
                  onClick={() => void onInsert(component)}
                >
                  {t("Insert copy")}
                </button>
                {selectedBuilderNodeId ? (
                  <button
                    type="button"
                    data-builder-node-my-block-update-master={component.id}
                    title={t(
                      "Overwrite this master with the selected block, published instances update live",
                    )}
                    className={KIT.ghostButton}
                    disabled={busy}
                    onClick={() => void onUpdateMaster(component)}
                  >
                    ↑ {t("Update master")}
                  </button>
                ) : null}
                {component.rootKind === "container" ||
                component.rootKind === "card" ? (
                  <>
                    <button
                      type="button"
                      data-builder-node-my-block-insert-linked={component.id}
                      title={t(
                        "Insert a linked instance that can be re-synced from this master",
                      )}
                      className={KIT.subtleButton}
                      disabled={busy}
                      onClick={() => void onInsertLinked(component)}
                    >
                      {t("Insert linked")}
                    </button>
                    <button
                      type="button"
                      data-builder-node-my-block-sync={component.id}
                      title={t(
                        "Push this master's content to every linked instance on the page",
                      )}
                      className={KIT.ghostButton}
                      disabled={busy}
                      onClick={() => void onSyncInstances(component)}
                    >
                      {t("Sync instances")}
                    </button>
                  </>
                ) : null}
              </span>
              <button
                type="button"
                aria-label={t("Delete {name}").replace(
                  "{name}",
                  component.name,
                )}
                title={t("Delete block")}
                className={KIT.ghostButton}
                disabled={busy}
                onClick={() => void onDelete(component)}
              >
                ✕
              </button>
            </div>
                ))
            )}
          </>
        )}
      </div>
    </details>
  );
}
