"use client";

/**
 * Phase 5 / M4 — section editor form.
 *
 * Handles create and edit in one component. Consumed by both
 *   /admin/site-settings/sections/new       (no row; expectedVersion=0;
 *                                             type_key locked after create)
 *   /admin/site-settings/sections/[id]      (row loaded; CAS version)
 *
 * Publish + archive + delete are separate forms so each carries its own
 * `expectedVersion` hidden input and surfaces its own response state.
 * Rollback lives in a sibling component.
 *
 * Props serialization:
 *   - Type-specific Editor component is looked up from the section registry
 *     (`SECTION_REGISTRY[typeKey].Editor`). On every onChange it writes into
 *     a local `props` state; that state is JSON.stringify'd into a hidden
 *     input submitted with the form. The server action parses the JSON
 *     before Zod-parsing, and the registry Zod schema is the authoritative
 *     gate.
 */

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useActionState } from "react";

import { SectionStatusBadge } from "@/components/admin/section-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SECTION_NAME_MAX } from "@/lib/site-admin/forms/sections";
import {
  getSectionType,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import type { SectionEditorProps } from "@/lib/site-admin/sections/types";
import type { SectionRow } from "@/lib/site-admin/server/sections";

import {
  archiveSectionAction,
  deleteSectionAction,
  publishSectionAction,
  saveSectionAction,
  type SectionActionState,
} from "./actions";

interface Props {
  mode: "create" | "edit";
  section: SectionRow | null;
  /** Only used on create. On edit, the type is locked to section.section_type_key. */
  initialTypeKey?: SectionTypeKey;
  canEdit: boolean;
  canPublish: boolean;
  /**
   * TRUE when at least one cms_page_sections row references this section
   * (draft or live composition). Drives the delete-button copy + disabled
   * hint so operators aren't left guessing why the DB will refuse.
   * Defaults to FALSE for the create path.
   */
  sectionInUse?: boolean;
  /**
   * Tenant scope, threaded to the inner registry Editor so affordances like
   * MediaPicker can query tenant-scoped resources.
   */
  tenantId?: string;
}

function FieldError({
  messages,
  name,
}: {
  messages?: Record<string, string>;
  name: string;
}) {
  const msg = messages?.[name];
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

function Banner({ state }: { state: SectionActionState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
        {state.message}
      </p>
    );
  }
  return (
    <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {state.error}
    </p>
  );
}

export function SectionEditor({
  mode,
  section,
  initialTypeKey,
  canEdit,
  canPublish,
  sectionInUse = false,
  tenantId,
}: Props) {
  const [saveState, saveAction, savePending] = useActionState<
    SectionActionState,
    FormData
  >(saveSectionAction, undefined);

  const [publishState, publishAction, publishPending] = useActionState<
    SectionActionState,
    FormData
  >(publishSectionAction, undefined);

  const [archiveState, archiveAction, archivePending] = useActionState<
    SectionActionState,
    FormData
  >(archiveSectionAction, undefined);

  const [deleteState, deleteAction, deletePending] = useActionState<
    SectionActionState,
    FormData
  >(deleteSectionAction, undefined);

  const saveFieldErrors =
    saveState && saveState.ok === false ? saveState.fieldErrors : undefined;

  const effectiveVersion = saveState?.ok ? saveState.version : section?.version;
  const version = effectiveVersion ?? section?.version ?? 0;

  const typeKey = section?.section_type_key ?? initialTypeKey ?? "hero";
  const registryEntry = getSectionType(typeKey);

  // Registry-governed props shape. `any`-less: the editor is generic over
  // the registry entry's schema payload type.
  const initialProps = (section?.props_jsonb ?? {}) as Record<string, unknown>;
  const [props, setProps] = useState<Record<string, unknown>>(initialProps);

  // ── Autosave plumbing ────────────────────────────────────────────────
  // Edit-mode only: once a section exists we debounce Editor changes and
  // submit the form programmatically. Create-mode requires a name + type
  // first, so the admin still clicks "Create section" explicitly.
  const saveFormRef = useRef<HTMLFormElement>(null);
  const [autosaveLabel, setAutosaveLabel] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle");
  const lastSyncedJson = useRef<string>(JSON.stringify(initialProps));
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !section?.id) return;
    const currentJson = JSON.stringify(props);
    if (currentJson === lastSyncedJson.current) return;
    setAutosaveLabel("dirty");
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setAutosaveLabel("saving");
      saveFormRef.current?.requestSubmit();
    }, 1200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [props, mode, section?.id]);

  // When the save action resolves, update autosave label + last-synced
  // fingerprint. Sync fingerprint on OK so a subsequent identical edit
  // doesn't retrigger autosave.
  useEffect(() => {
    if (!saveState) return;
    if (saveState.ok) {
      lastSyncedJson.current = JSON.stringify(props);
      setAutosaveLabel("saved");
    } else {
      setAutosaveLabel("error");
    }
    // deliberately exclude `props` — we're reacting to the server result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState]);

  const schemaVersion =
    section?.schema_version ?? registryEntry?.currentVersion ?? 1;

  // registryEntry being missing is a platform bug (the list screen filters
  // unknown types), but we guard to keep the editor from crashing.
  if (!registryEntry) {
    return (
      <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        Section type &quot;{typeKey}&quot; is not registered on this platform
        build. Contact support.
      </p>
    );
  }

  const Editor = registryEntry.Editor as ComponentType<
    SectionEditorProps<Record<string, unknown>>
  >;

  return (
    <div className="space-y-8">
      {/* ---- status pill + meta ---- */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <SectionStatusBadge status={section?.status ?? "draft"} />
        <span>type: {registryEntry.meta.label}</span>
        <span>schema v{schemaVersion}</span>
        {registryEntry.currentVersion !== schemaVersion && (
          <span
            className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-300"
            title={`This section was saved at schema v${schemaVersion}. The platform is now at v${registryEntry.currentVersion}. Saving migrates the payload forward; publishing re-validates against v${registryEntry.currentVersion} and may require a re-author if the new shape added required fields.`}
          >
            upgrade: v{schemaVersion} → v{registryEntry.currentVersion}
          </span>
        )}
        <span>version v{version}</span>
        {section?.updated_at && (
          <span>
            last edited{" "}
            {(() => {
              try {
                return new Date(section.updated_at).toLocaleString();
              } catch {
                return section.updated_at;
              }
            })()}
          </span>
        )}
      </div>

      <Banner state={saveState} />

      {/* ---- core form ---- */}
      <form action={saveAction} className="space-y-6" ref={saveFormRef}>
        {section?.id && <input type="hidden" name="id" value={section.id} />}
        <input
          type="hidden"
          name="expectedVersion"
          value={effectiveVersion ?? 0}
        />
        <input type="hidden" name="sectionTypeKey" value={typeKey} />
        <input type="hidden" name="schemaVersion" value={schemaVersion} />
        <input type="hidden" name="props" value={JSON.stringify(props)} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={SECTION_NAME_MAX}
              defaultValue={section?.name ?? ""}
              disabled={!canEdit}
              placeholder="Homepage hero — main"
            />
            <FieldError messages={saveFieldErrors} name="name" />
            <p className="text-xs text-muted-foreground">
              Names are unique per workspace and help you pick the right
              section when composing pages.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-sm">
              {registryEntry.meta.label}
            </div>
            <p className="text-xs text-muted-foreground">
              Section type is locked after creation. To change types, create
              a new section.
            </p>
          </div>
        </div>

        <FieldError messages={saveFieldErrors} name="props" />

        {/* ---- type-specific editor ---- */}
        <fieldset className="space-y-4 rounded-md border border-border/60 p-4">
          <legend className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {registryEntry.meta.label} content
          </legend>
          <Editor
            initial={props}
            onChange={(next) => setProps(next)}
            tenantId={tenantId}
          />
        </fieldset>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!canEdit || savePending}>
            {savePending
              ? "Saving…"
              : mode === "create"
                ? "Create section"
                : "Save now"}
          </Button>
          {mode === "edit" ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                autosaveLabel === "saving"
                  ? "bg-muted/40 text-muted-foreground"
                  : autosaveLabel === "saved"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : autosaveLabel === "dirty"
                      ? "bg-amber-400/15 text-amber-300"
                      : autosaveLabel === "error"
                        ? "bg-destructive/15 text-destructive"
                        : "text-muted-foreground"
              }`}
              aria-live="polite"
            >
              <span
                className={`size-1.5 rounded-full ${
                  autosaveLabel === "saving"
                    ? "animate-pulse bg-muted-foreground"
                    : autosaveLabel === "saved"
                      ? "bg-emerald-300"
                      : autosaveLabel === "dirty"
                        ? "bg-amber-300"
                        : autosaveLabel === "error"
                          ? "bg-destructive"
                          : "bg-muted-foreground/50"
                }`}
                aria-hidden
              />
              {autosaveLabel === "saving"
                ? "Saving…"
                : autosaveLabel === "saved"
                  ? "All changes saved"
                  : autosaveLabel === "dirty"
                    ? "Unsaved changes"
                    : autosaveLabel === "error"
                      ? "Save failed — try again"
                      : "Autosave ready"}
            </span>
          ) : null}
        </div>
      </form>

      {/* ---- publish / archive / delete ---- */}
      {section?.id && (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2">
            {canPublish && (
              <form action={publishAction}>
                <input type="hidden" name="id" value={section.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={effectiveVersion ?? 0}
                />
                <Button type="submit" disabled={publishPending}>
                  {publishPending ? "Publishing…" : "Publish section"}
                </Button>
                <Banner state={publishState} />
              </form>
            )}
            {canPublish && (
              <form action={archiveAction}>
                <input type="hidden" name="id" value={section.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={effectiveVersion ?? 0}
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={archivePending}
                >
                  {archivePending ? "Archiving…" : "Archive section"}
                </Button>
                <Banner state={archiveState} />
              </form>
            )}
            {canEdit && (
              <form
                action={deleteAction}
                onSubmit={(e) => {
                  const confirmBody = sectionInUse
                    ? `Delete section “${section.name}” (type ${registryEntry.meta.label})?\n\nThis section is currently referenced by at least one page (see the "In use" block above). The database will REFUSE the delete until you remove every reference. Cancel, unlink the section from those pages, and try again — or use Archive to hide it without losing content.`
                    : `Delete section “${section.name}” (type ${registryEntry.meta.label})?\n\nThis is a hard delete — the draft, every revision, and the published copy are removed. Archive is the usual choice; it keeps history and is reversible.`;
                  const ok = window.confirm(confirmBody);
                  if (!ok) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={section.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={effectiveVersion ?? 0}
                />
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deletePending}
                  title={
                    sectionInUse
                      ? "This section is referenced by one or more pages. The DB will reject the delete until every reference is removed — unlink first, or archive instead."
                      : "Hard delete. Not reversible. Archive is the usual choice."
                  }
                >
                  {deletePending
                    ? "Deleting…"
                    : sectionInUse
                      ? "Delete section (blocked — in use)"
                      : "Delete section"}
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sectionInUse
                    ? "Blocked while any page references this section. Remove those references, or archive to hide without losing history."
                    : "Destructive. Archive is usually the right choice — it hides the section from the storefront without losing history."}
                </p>
                <Banner state={deleteState} />
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
