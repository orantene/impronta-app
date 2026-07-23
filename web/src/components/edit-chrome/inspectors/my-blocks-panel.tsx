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
import { useSelectedBuilderNodeId } from "../selection-bridge";
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
      setError(result.error ?? "Couldn't save the block.");
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
      setError(result.error ?? "Couldn't insert the block.");
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
      setError(result.error ?? "Couldn't insert the linked instance.");
      return;
    }
    setNote("Linked instance inserted. Edit the master then Sync.");
  }

  async function onSyncInstances(component: BuilderComponentRow) {
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await syncComponentInstances(
      component.id,
      JSON.stringify(component.subtree),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't sync instances.");
      return;
    }
    setNote(
      result.synced
        ? `Synced ${result.synced} instance${result.synced === 1 ? "" : "s"}.`
        : "No linked instances of this block on the page.",
    );
  }

  async function onUpdateMaster(component: BuilderComponentRow) {
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await updateSelectedNodeAsComponent(component.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't update the master.");
      return;
    }
    setNote(
      `Updated "${component.name}" master. Published instances reflect it live; in-editor, Sync to refresh.`,
    );
    void refresh();
  }

  async function onDelete(component: BuilderComponentRow) {
    setBusy(true);
    setError(null);
    const result = await deleteBuilderComponent({ componentId: component.id });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't delete the block.");
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
        My blocks{components.length > 0 ? ` (${components.length})` : ""}
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
              placeholder="Name this block (e.g. Pricing card)"
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
                {busy ? "Saving…" : "Save block"}
              </button>
              <button
                type="button"
                className={KIT.ghostButton}
                onClick={() => {
                  setNaming(false);
                  setNameDraft("");
                }}
              >
                Cancel
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
            ⊕ Save this block to My blocks
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
            Loading saved blocks…
          </div>
        ) : components.length === 0 ? (
          <div className="rounded-md border border-dashed border-stone-300 bg-white px-3 py-3 text-[11px] text-stone-500">
            No saved blocks yet. Select a block and save it to reuse it
            anywhere.
          </div>
        ) : (
          components.map((component) => (
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
                  {component.rootKind} · {component.nodeCount} nodes
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
                  Insert copy
                </button>
                {selectedBuilderNodeId ? (
                  <button
                    type="button"
                    data-builder-node-my-block-update-master={component.id}
                    title="Overwrite this master with the selected block, published instances update live"
                    className={KIT.ghostButton}
                    disabled={busy}
                    onClick={() => void onUpdateMaster(component)}
                  >
                    ↑ Update master
                  </button>
                ) : null}
                {component.rootKind === "container" ? (
                  <>
                    <button
                      type="button"
                      data-builder-node-my-block-insert-linked={component.id}
                      title="Insert a linked instance that can be re-synced from this master"
                      className={KIT.subtleButton}
                      disabled={busy}
                      onClick={() => void onInsertLinked(component)}
                    >
                      Insert linked
                    </button>
                    <button
                      type="button"
                      data-builder-node-my-block-sync={component.id}
                      title="Push this master's content to every linked instance on the page"
                      className={KIT.ghostButton}
                      disabled={busy}
                      onClick={() => void onSyncInstances(component)}
                    >
                      Sync instances
                    </button>
                  </>
                ) : null}
              </span>
              <button
                type="button"
                aria-label={`Delete ${component.name}`}
                title="Delete block"
                className={KIT.ghostButton}
                disabled={busy}
                onClick={() => void onDelete(component)}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </details>
  );
}
