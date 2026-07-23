"use client";

/**
 * CollectionsDrawer — operator content collections (Wave 5A, job #36).
 *
 * Lives in the right-side drawer family (same chrome as Assets / Theme /
 * Revisions), mutexed via `EditContext.collectionsOpen`. Lets an operator:
 *   - create a collection ("Team", "Projects", "Testimonials")
 *   - define its typed field schema (text / richtext / image / url / number /
 *     boolean)
 *   - add / edit / delete content rows
 *
 * Once a collection has fields + rows, the operator binds a freeform container
 * repeater to it from the data inspector (Data tab → Source → "Your
 * collections"), and the render path resolves the rows into one item per row
 * (see collections/server.ts → resolveCollectionDataSources, and render.tsx
 * → collectionRecordsForSource).
 *
 * Data: every read/mutation goes through the staff-gated server actions in
 * collections/actions.ts. On any successful mutation we `bumpCollectionsCache`
 * so the data inspector's source picker refreshes. The drawer re-fetches the
 * list on open so a change from another tab is reflected.
 *
 * Scope (this pass): list + create + field schema editor + row CRUD, solid and
 * tested at the data layer. A richer per-field-type input surface (image picker
 * integration, rich-text, drag-reorder) is a documented follow-up — today every
 * field edits as a text input, which round-trips correctly for all six types.
 */

import { useCallback, useEffect, useState } from "react";

import {
  CHROME,
  Drawer,
  DrawerBody,
  DrawerFoot,
  DrawerHead,
  DrawerSkeleton,
} from "./kit";
import { KIT } from "./inspectors/kit/tokens";
import { useEditContext } from "./edit-context";
import { bumpCollectionsCache } from "./inspectors/data-panel";

import {
  addCollectionItemAction,
  createCollectionAction,
  deleteCollectionAction,
  deleteCollectionItemAction,
  getCollectionAction,
  listCollectionsAction,
  updateCollectionAction,
  updateCollectionItemAction,
} from "@/lib/site-admin/collections/actions";
import {
  COLLECTION_FIELD_TYPES,
  type CollectionFieldDefinition,
  type CollectionFieldType,
  type ContentCollection,
  type ContentCollectionWithItems,
} from "@/lib/site-admin/collections/types";

export function CollectionsDrawer() {
  const { collectionsOpen, closeCollections } = useEditContext();
  const [collections, setCollections] = useState<ContentCollection[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    const result = await listCollectionsAction();
    if (result.ok) {
      setCollections(result.data);
      setError(null);
    } else {
      setError(result.error);
      setCollections([]);
    }
  }, []);

  useEffect(() => {
    if (!collectionsOpen) return;
    setActiveId(null);
    setCollections(null);
    void refreshList();
  }, [collectionsOpen, refreshList]);

  const onMutated = useCallback(() => {
    bumpCollectionsCache();
    void refreshList();
  }, [refreshList]);

  if (!collectionsOpen) return null;

  return (
    <Drawer
      kind="collections"
      open={collectionsOpen}
      testId="collections-drawer"
      modal
      onRequestClose={closeCollections}
    >
      <DrawerHead
        title={activeId ? "Edit collection" : "Collections"}
        meta={
          activeId
            ? "Define fields and content rows"
            : "Reusable content you can bind a repeater to"
        }
        icon={<CollectionsGlyph />}
        onClose={closeCollections}
      />
      {activeId ? (
        <CollectionDetail
          collectionId={activeId}
          onBack={() => {
            setActiveId(null);
            void refreshList();
          }}
          onMutated={onMutated}
        />
      ) : (
        <CollectionsList
          collections={collections}
          error={error}
          onOpen={setActiveId}
          onCreated={(id) => {
            onMutated();
            setActiveId(id);
          }}
          onDeleted={onMutated}
        />
      )}
    </Drawer>
  );
}

// ── list view ───────────────────────────────────────────────────────────────

function CollectionsList({
  collections,
  error,
  onOpen,
  onCreated,
  onDeleted,
}: {
  collections: ContentCollection[] | null;
  error: string | null;
  onOpen: (id: string) => void;
  onCreated: (id: string) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Two-step delete confirm — a collection delete also wipes its content rows
  // (which live-page repeaters bind to), so never one-click destroy it.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setLocalError(null);
    const result = await createCollectionAction({ name: trimmed });
    setBusy(false);
    if (result.ok) {
      setName("");
      onCreated(result.data.id);
    } else {
      setLocalError(result.error);
    }
  }

  async function remove(id: string) {
    const result = await deleteCollectionAction({ collectionId: id });
    if (result.ok) onDeleted();
    else setLocalError(result.error);
  }

  return (
    <>
      <DrawerBody>
        <div className="flex flex-col gap-2">
          {(localError || error) && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {localError ?? error}
            </p>
          )}
          {collections === null ? (
            <DrawerSkeleton rows={3} />
          ) : collections.length === 0 ? (
            <p
              className="rounded-lg px-3 py-6 text-center text-[13px]"
              style={{ color: CHROME.muted, background: CHROME.surface }}
            >
              No collections yet. Create one below, for example a “Team” or
              “Projects” collection, then bind a repeater to it from the Data
              tab.
            </p>
          ) : (
            collections.map((collection) => (
              <div
                key={collection.id}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5"
                style={{
                  background: CHROME.surface,
                  border: `1px solid ${CHROME.line}`,
                }}
                data-collection-id={collection.id}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpen(collection.id)}
                >
                  <div
                    className="truncate text-[13px] font-semibold"
                    style={{ color: CHROME.ink }}
                  >
                    {collection.name}
                  </div>
                  <div className="text-[11px]" style={{ color: CHROME.muted }}>
                    {collection.fields.length} field
                    {collection.fields.length === 1 ? "" : "s"} ·{" "}
                    {collection.itemCount} item
                    {collection.itemCount === 1 ? "" : "s"}
                  </div>
                </button>
                <button
                  type="button"
                  className={KIT.subtleButton}
                  onClick={() => onOpen(collection.id)}
                >
                  Edit
                </button>
                {confirmingDeleteId === collection.id ? (
                  <>
                    <button
                      type="button"
                      className={KIT.subtleButton}
                      style={{ color: CHROME.rose }}
                      onClick={() => {
                        setConfirmingDeleteId(null);
                        void remove(collection.id);
                      }}
                      aria-label={`Confirm delete ${collection.name}`}
                    >
                      Delete
                      {collection.itemCount > 0
                        ? ` ${collection.itemCount} item${collection.itemCount === 1 ? "" : "s"}`
                        : ""}
                    </button>
                    <button
                      type="button"
                      className={KIT.subtleButton}
                      onClick={() => setConfirmingDeleteId(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={KIT.subtleButton}
                    onClick={() => setConfirmingDeleteId(collection.id)}
                    aria-label={`Delete ${collection.name}`}
                  >
                    Delete
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </DrawerBody>
      <DrawerFoot
        end={
          <div className="flex w-full items-center gap-2">
            <input
              className={KIT.input}
              placeholder="New collection name…"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void create();
              }}
              aria-label="New collection name"
            />
            <button
              type="button"
              className={KIT.primaryButton}
              disabled={!name.trim() || busy}
              onClick={() => void create()}
            >
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        }
      />
    </>
  );
}

// ── detail view (fields + rows) ─────────────────────────────────────────────

function CollectionDetail({
  collectionId,
  onBack,
  onMutated,
}: {
  collectionId: string;
  onBack: () => void;
  onMutated: () => void;
}) {
  const [collection, setCollection] = useState<ContentCollectionWithItems | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await getCollectionAction(collectionId);
    if (result.ok) {
      setCollection(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
  }, [collectionId]);

  useEffect(() => {
    setCollection(null);
    void load();
  }, [load]);

  const reload = useCallback(async () => {
    await load();
    onMutated();
  }, [load, onMutated]);

  if (collection === null) {
    return (
      <DrawerBody>
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {error}
          </p>
        ) : (
          <DrawerSkeleton rows={4} />
        )}
      </DrawerBody>
    );
  }

  return (
    <>
      <DrawerBody>
        <div className="flex flex-col gap-4">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {error}
            </p>
          )}
          <FieldsEditor
            collection={collection}
            onSaved={() => void reload()}
            onError={setError}
          />
          <RowsEditor
            collection={collection}
            onChanged={() => void reload()}
            onError={setError}
          />
        </div>
      </DrawerBody>
      <DrawerFoot
        start={
          <button type="button" className={KIT.subtleButton} onClick={onBack}>
            ← All collections
          </button>
        }
        end={
          <span className="text-[11px]" style={{ color: CHROME.muted }}>
            Bind a repeater to “{collection.name}” from the Data tab.
          </span>
        }
      />
    </>
  );
}

function FieldsEditor({
  collection,
  onSaved,
  onError,
}: {
  collection: ContentCollectionWithItems;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [fields, setFields] = useState<CollectionFieldDefinition[]>([
    ...collection.fields,
  ]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  function update(next: CollectionFieldDefinition[]) {
    setFields(next);
    setDirty(true);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    const result = await updateCollectionAction({
      collectionId: collection.id,
      fields: fields
        .filter((field) => field.label.trim())
        .map((field) => ({ label: field.label, type: field.type })),
    });
    setBusy(false);
    if (result.ok) {
      setDirty(false);
      onSaved();
    } else {
      onError(result.error);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: CHROME.muted }}>
          Fields
        </h3>
        {dirty ? (
          <button
            type="button"
            className={KIT.primaryButton}
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save fields"}
          </button>
        ) : null}
      </header>
      {fields.length === 0 ? (
        <p className="text-[12px]" style={{ color: CHROME.muted }}>
          Add a field, e.g. “Name” (text), “Photo” (image), “Link” (url).
        </p>
      ) : null}
      {fields.map((field, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            className={KIT.input}
            placeholder="Field label"
            value={field.label}
            onChange={(event) => {
              const next = [...fields];
              next[index] = { ...field, label: event.currentTarget.value };
              update(next);
            }}
            aria-label={`Field ${index + 1} label`}
          />
          <select
            className={KIT.select}
            style={{ width: 130 }}
            value={field.type}
            onChange={(event) => {
              const next = [...fields];
              next[index] = {
                ...field,
                type: event.currentTarget.value as CollectionFieldType,
              };
              update(next);
            }}
            aria-label={`Field ${index + 1} type`}
          >
            {COLLECTION_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={KIT.subtleButton}
            onClick={() => update(fields.filter((_, i) => i !== index))}
            aria-label={`Remove field ${index + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className={KIT.ghostButton}
        onClick={() => update([...fields, { key: "", label: "", type: "text" }])}
      >
        + Add field
      </button>
    </section>
  );
}

function RowsEditor({
  collection,
  onChanged,
  onError,
}: {
  collection: ContentCollectionWithItems;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const fields = collection.fields;

  async function addRow() {
    const result = await addCollectionItemAction({ collectionId: collection.id });
    if (result.ok) onChanged();
    else onError(result.error);
  }

  async function removeRow(itemId: string) {
    const result = await deleteCollectionItemAction({ itemId });
    if (result.ok) onChanged();
    else onError(result.error);
  }

  if (fields.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: CHROME.muted }}>
          Content
        </h3>
        <p className="text-[12px]" style={{ color: CHROME.muted }}>
          Add fields first, then add content rows.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: CHROME.muted }}>
          Content ({collection.items.length})
        </h3>
        <button type="button" className={KIT.ghostButton} onClick={() => void addRow()}>
          + Add row
        </button>
      </header>
      {collection.items.length === 0 ? (
        <p className="text-[12px]" style={{ color: CHROME.muted }}>
          No rows yet.
        </p>
      ) : (
        collection.items.map((item) => (
          <RowEditor
            key={item.id}
            collectionId={collection.id}
            itemId={item.id}
            fields={fields}
            data={item.data}
            onSaved={onChanged}
            onRemove={() => void removeRow(item.id)}
            onError={onError}
          />
        ))
      )}
    </section>
  );
}

function RowEditor({
  collectionId,
  itemId,
  fields,
  data,
  onSaved,
  onRemove,
  onError,
}: {
  collectionId: string;
  itemId: string;
  fields: ReadonlyArray<CollectionFieldDefinition>;
  data: Readonly<Record<string, unknown>>;
  onSaved: () => void;
  onRemove: () => void;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [field.key, stringifyValue(data[field.key])]),
    ),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      payload[field.key] =
        field.type === "boolean"
          ? values[field.key] === "true"
          : values[field.key] ?? "";
    }
    const result = await updateCollectionItemAction({
      collectionId,
      itemId,
      data: payload,
    });
    setBusy(false);
    if (result.ok) {
      setDirty(false);
      onSaved();
    } else {
      onError(result.error);
    }
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-lg px-3 py-2.5"
      style={{ background: CHROME.surface, border: `1px solid ${CHROME.line}` }}
      data-collection-item-id={itemId}
    >
      {fields.map((field) => (
        <label key={field.key} className="flex flex-col gap-1">
          <span className="text-[11px]" style={{ color: CHROME.muted }}>
            {field.label}{" "}
            <span style={{ opacity: 0.6 }}>({field.type})</span>
          </span>
          {field.type === "boolean" ? (
            <select
              className={KIT.select}
              value={values[field.key] === "true" ? "true" : "false"}
              onChange={(event) => {
                setValues((prev) => ({
                  ...prev,
                  [field.key]: event.currentTarget.value,
                }));
                setDirty(true);
              }}
              aria-label={field.label}
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          ) : field.type === "richtext" ? (
            <textarea
              className={KIT.textarea}
              rows={2}
              value={values[field.key] ?? ""}
              onChange={(event) => {
                setValues((prev) => ({
                  ...prev,
                  [field.key]: event.currentTarget.value,
                }));
                setDirty(true);
              }}
              aria-label={field.label}
            />
          ) : (
            <input
              className={KIT.input}
              type={field.type === "number" ? "number" : "text"}
              value={values[field.key] ?? ""}
              onChange={(event) => {
                setValues((prev) => ({
                  ...prev,
                  [field.key]: event.currentTarget.value,
                }));
                setDirty(true);
              }}
              aria-label={field.label}
            />
          )}
        </label>
      ))}
      <div className="flex items-center justify-end gap-2">
        {dirty ? (
          <button
            type="button"
            className={KIT.primaryButton}
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        ) : null}
        <button type="button" className={KIT.subtleButton} onClick={onRemove}>
          Delete row
        </button>
      </div>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value : "";
}

function CollectionsGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
