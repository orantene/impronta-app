"use client";

/**
 * Phase 11 — workspace template gallery + save-as-template button.
 *
 * Two surfaces in one component:
 *
 *   1. "Save as template" — pulls the current draft into a new
 *      cms_workspace_templates row.
 *   2. Gallery list — the operator picks a saved template and applies it
 *      to the current homepage. Apply replaces the draft composition with
 *      a fresh clone of the template's sections.
 *
 * Mounts inside the edit chrome (collapsible <details> so it stays out of
 * the way when not in use). The marketplace toggle (Item 12) flips the
 * scope from `private` to `all` so platform-promoted templates from other
 * tenants appear in the same gallery.
 */

import { useEffect, useState, useTransition, type ReactElement } from "react";

import {
  applyWorkspaceTemplate,
  deleteWorkspaceTemplate,
  listWorkspaceTemplates,
  promoteWorkspaceTemplate,
  saveCurrentHomepageAsTemplate,
  type WorkspaceTemplateRow,
} from "@/lib/site-admin/edit-mode/workspace-templates-action";

type Props = {
  /** Default-open the gallery for empty-canvas surfaces. */
  defaultOpen?: boolean;
  /** Show the save-as-template input row. False on the empty-canvas surface
   *  where there's nothing to snapshot yet. */
  enableSave?: boolean;
  /** When true, callers (like the EmptyCanvasStarter) want the page to
   *  reload after a successful apply so the new draft renders. */
  reloadOnApply?: boolean;
};

export function WorkspaceTemplateGallery({
  defaultOpen,
  enableSave = true,
  reloadOnApply = true,
}: Props): ReactElement {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [scope, setScope] = useState<"private" | "all">("private");
  const [templates, setTemplates] = useState<ReadonlyArray<WorkspaceTemplateRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  async function refresh(targetScope: "private" | "all" = scope) {
    setError(null);
    const r = await listWorkspaceTemplates({ scope: targetScope });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setTemplates(r.templates);
  }

  useEffect(() => {
    if (open && templates === null) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSave() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await saveCurrentHomepageAsTemplate({ name });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setName("");
      setInfo("Template saved.");
      await refresh();
    });
  }

  function handleApply(id: string, label: string) {
    if (!confirm(`Replace the current draft with "${label}"? Your existing draft sections stay in the Sections list but the homepage composition is overwritten.`)) {
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await applyWorkspaceTemplate({ templateId: id });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setInfo(`Applied — ${r.createdSections} sections.${r.skipped ? ` ${r.skipped} skipped.` : ""}`);
      if (reloadOnApply) {
        window.location.reload();
      }
    });
  }

  function handleDelete(id: string, label: string) {
    if (!confirm(`Archive "${label}"? It disappears from the gallery but the row is preserved.`)) {
      return;
    }
    startTransition(async () => {
      const r = await deleteWorkspaceTemplate({ templateId: id });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await refresh();
    });
  }

  function handlePromote(id: string, currentlyPlatform: boolean) {
    startTransition(async () => {
      const r = await promoteWorkspaceTemplate({
        templateId: id,
        toPlatform: !currentlyPlatform,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await refresh();
    });
  }

  function toggleScope(next: "private" | "all") {
    setScope(next);
    setTemplates(null);
    void refresh(next);
  }

  return (
    <details
      className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none text-sm font-medium">
        Templates
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          Save the current draft, or apply one you saved earlier
        </span>
      </summary>

      <div className="mt-3 flex flex-col gap-3">
        {enableSave ? (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Save current draft as template
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Wedding photographer kit v2"
                className="flex-1 rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
                disabled={pending}
                maxLength={120}
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={pending || !name.trim()}
                className="rounded-md border border-zinc-900 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {pending ? "…" : "Save"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Browse</span>
          <button
            type="button"
            onClick={() => toggleScope("private")}
            className={`rounded-md px-2 py-0.5 text-[10px] ${scope === "private" ? "bg-zinc-900 text-white" : "border border-border/60 hover:bg-muted/50"}`}
          >
            My workspace
          </button>
          <button
            type="button"
            onClick={() => toggleScope("all")}
            className={`rounded-md px-2 py-0.5 text-[10px] ${scope === "all" ? "bg-zinc-900 text-white" : "border border-border/60 hover:bg-muted/50"}`}
            title="Includes platform-promoted templates from other workspaces"
          >
            Marketplace
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={pending}
            className="ml-auto rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] hover:bg-muted/50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {templates === null ? (
          <div className="text-[11px] text-muted-foreground">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
            No templates yet. {enableSave ? "Save the current draft to start your library." : "Visit a workspace with content to save one."}
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-background p-2"
              >
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground">{t.name}</span>
                    {t.visibility === "platform" ? (
                      <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        Platform
                      </span>
                    ) : null}
                    {!t.ownTenant ? (
                      <span className="text-[10px] text-muted-foreground">(shared)</span>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {t.sectionCount} section{t.sectionCount === 1 ? "" : "s"}
                    {t.description ? ` · ${t.description}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleApply(t.id, t.name)}
                  disabled={pending}
                  className="rounded-md border border-zinc-900 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  Apply
                </button>
                {t.ownTenant ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handlePromote(t.id, t.visibility === "platform")}
                      disabled={pending}
                      className="rounded-md border border-border/60 px-2 py-1 text-[10px] hover:bg-muted/50 disabled:opacity-50"
                      title="Super-admin only — promote to platform marketplace"
                    >
                      {t.visibility === "platform" ? "Unpromote" : "Promote"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id, t.name)}
                      disabled={pending}
                      className="rounded-md border border-border/60 px-2 py-1 text-[10px] text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Archive
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {error ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
            {error}
          </div>
        ) : null}
        {info ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
            {info}
          </div>
        ) : null}
      </div>
    </details>
  );
}
