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

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactElement,
} from "react";

import {
  applyWorkspaceTemplate,
  deleteWorkspaceTemplate,
  listWorkspaceTemplates,
  promoteWorkspaceTemplate,
  saveCurrentHomepageAsTemplate,
  type WorkspaceTemplateRow,
} from "@/lib/site-admin/edit-mode/workspace-templates-action";
import { useEditContext } from "./edit-context";

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
  const { slots, slotDefs, library } = useEditContext();
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [scope, setScope] = useState<"private" | "all">("private");
  const [templates, setTemplates] = useState<ReadonlyArray<WorkspaceTemplateRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saveSource, setSaveSource] = useState<"draft" | "live">("draft");
  const [query, setQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<
    "all" | "data-ready" | "starter" | "platform" | "shared"
  >("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [reviewTemplateId, setReviewTemplateId] = useState<string | null>(null);
  const [archiveTemplateId, setArchiveTemplateId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentDraftSections = useMemo(() => {
    const slotLabelByKey = new Map(slotDefs.map((slot) => [slot.key, slot.label]));
    const sectionLabelByType = new Map(
      library.map((entry) => [entry.typeKey, entry.label]),
    );
    return Object.entries(slots).flatMap(([slotKey, refs]) =>
      [...refs]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((ref) => ({
          id: ref.sectionId,
          name: ref.name,
          slotLabel: slotLabelByKey.get(slotKey) ?? slotKey,
          typeLabel: sectionLabelByType.get(ref.sectionTypeKey) ?? ref.sectionTypeKey,
        })),
    );
  }, [library, slotDefs, slots]);

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = templates ?? [];
    const modeFilteredRows =
      modeFilter === "all"
        ? rows
        : modeFilter === "platform"
          ? rows.filter((template) => template.visibility === "platform")
          : modeFilter === "shared"
            ? rows.filter((template) => !template.ownTenant)
            : rows.filter((template) => template.mode === modeFilter);
    const typeFilteredRows =
      typeFilter === "all"
        ? modeFilteredRows
        : modeFilteredRows.filter((template) =>
            [...template.typeSummary, ...template.categorySummary].includes(typeFilter),
          );
    if (!q) return typeFilteredRows;
    return typeFilteredRows.filter((template) =>
      [
        template.name,
        template.description ?? "",
        template.visibility,
        template.mode,
        template.typeSummary.join(" "),
        template.categorySummary.join(" "),
        template.dataSourceSummary.join(" "),
        template.sections.map((section) => `${section.name} ${section.label}`).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [modeFilter, query, templates, typeFilter]);

  const typeFilters = useMemo(() => {
    const counts = new Map<string, number>();
    const sourceRows =
      modeFilter === "all"
        ? (templates ?? [])
        : modeFilter === "platform"
          ? (templates ?? []).filter((template) => template.visibility === "platform")
          : modeFilter === "shared"
            ? (templates ?? []).filter((template) => !template.ownTenant)
            : (templates ?? []).filter((template) => template.mode === modeFilter);
    for (const template of sourceRows) {
      for (const label of [...template.dataSourceSummary, ...template.typeSummary]) {
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8);
  }, [modeFilter, templates]);

  const modeFilters = useMemo(() => {
    const rows = templates ?? [];
    const count = (predicate: (template: WorkspaceTemplateRow) => boolean) =>
      rows.filter(predicate).length;
    return [
      { key: "all", label: "All", count: rows.length },
      {
        key: "data-ready",
        label: "Data ready",
        count: count((template) => template.mode === "data-ready"),
      },
      {
        key: "starter",
        label: "Starter",
        count: count((template) => template.mode === "starter"),
      },
      {
        key: "platform",
        label: "Platform",
        count: count((template) => template.visibility === "platform"),
      },
      {
        key: "shared",
        label: "Shared",
        count: count((template) => !template.ownTenant),
      },
    ] as const;
  }, [templates]);

  const activeModeCount =
    modeFilters.find((filter) => filter.key === modeFilter)?.count ?? 0;

  const selectedTemplate =
    filteredTemplates.find((template) => template.id === selectedTemplateId) ??
    filteredTemplates[0] ??
    null;
  const reviewTemplate =
    (templates ?? []).find((template) => template.id === reviewTemplateId) ?? null;
  const archiveTemplate =
    (templates ?? []).find((template) => template.id === archiveTemplateId) ?? null;

  async function refresh(targetScope: "private" | "all" = scope) {
    setError(null);
    const r = await listWorkspaceTemplates({ scope: targetScope });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setTemplates(r.templates);
    setSelectedTemplateId((current) =>
      current && r.templates.some((template) => template.id === current)
        ? current
        : r.templates[0]?.id ?? null,
    );
  }

  useEffect(() => {
    if (open && templates === null) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!reviewTemplateId && !archiveTemplateId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setReviewTemplateId(null);
      setArchiveTemplateId(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [archiveTemplateId, reviewTemplateId]);

  function handleSave() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await saveCurrentHomepageAsTemplate({
        name,
        description,
        fromLive: saveSource === "live",
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setName("");
      setDescription("");
      setInfo("Template saved.");
      await refresh();
    });
  }

  function handleApply(template: WorkspaceTemplateRow) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await applyWorkspaceTemplate({ templateId: template.id });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setReviewTemplateId(null);
      setInfo(
        `Applied "${template.name}" — ${r.createdSections} sections.${
          r.skipped ? ` ${r.skipped} skipped.` : ""
        }`,
      );
      if (reloadOnApply) {
        window.location.reload();
      }
    });
  }

  function handleDelete(id: string) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await deleteWorkspaceTemplate({ templateId: id });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setArchiveTemplateId(null);
      setInfo("Template archived.");
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
    setSelectedTemplateId(null);
    setModeFilter("all");
    setTypeFilter("all");
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
          <div
            data-workspace-template-save-panel
            className="rounded-md border border-border/60 bg-background p-2"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Save as reusable template
                </label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Snapshot the current composition into your workspace library.
                </p>
              </div>
              <div
                data-workspace-template-save-source
                className="inline-flex w-fit rounded-md border border-border/60 bg-muted/40 p-0.5"
                aria-label="Template save source"
              >
                <button
                  type="button"
                  onClick={() => setSaveSource("draft")}
                  disabled={pending}
                  className={
                    saveSource === "draft"
                      ? "rounded px-2 py-1 text-[10px] font-semibold bg-background text-foreground shadow-sm"
                      : "rounded px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                  }
                >
                  Current draft
                </button>
                <button
                  type="button"
                  onClick={() => setSaveSource("live")}
                  disabled={pending}
                  className={
                    saveSource === "live"
                      ? "rounded px-2 py-1 text-[10px] font-semibold bg-background text-foreground shadow-sm"
                      : "rounded px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                  }
                >
                  Published live
                </button>
              </div>
            </div>
            <div className="mt-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
              {saveSource === "draft"
                ? `Draft source selected · ${currentDraftSections.length} current section${currentDraftSections.length === 1 ? "" : "s"}.`
                : "Published source selected · uses the last live composition."}
            </div>
            <div className="mt-2 grid gap-1.5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto]">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name"
                className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
                disabled={pending}
                maxLength={120}
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description, use case, or notes"
                className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
                disabled={pending}
                maxLength={220}
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={pending || !name.trim()}
                className="h-8 rounded-md border border-[#3d4f7c] bg-[#3d4f7c] px-3 text-[10px] font-semibold text-white hover:bg-[#4a5e94] disabled:opacity-50"
              >
                {pending ? "…" : "Save"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <label className="sr-only" htmlFor="workspace-template-search">
            Search saved templates
          </label>
          <input
            id="workspace-template-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved templates..."
            className="h-8 flex-1 rounded-md border border-border/60 bg-background px-2 text-xs outline-none transition focus:border-[#3d4f7c]"
            disabled={pending}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Browse</span>
          <button
            type="button"
            onClick={() => toggleScope("private")}
            className={`rounded-md px-2 py-0.5 text-[10px] ${scope === "private" ? "bg-[#3d4f7c] text-white" : "border border-border/60 hover:bg-muted/50"}`}
          >
            My workspace
          </button>
          <button
            type="button"
            onClick={() => toggleScope("all")}
            className={`rounded-md px-2 py-0.5 text-[10px] ${scope === "all" ? "bg-[#3d4f7c] text-white" : "border border-border/60 hover:bg-muted/50"}`}
            title="Includes platform-promoted templates from other workspaces"
          >
            Marketplace
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={pending}
            className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] hover:bg-muted/50 disabled:opacity-50 md:ml-auto"
          >
            Refresh
          </button>
        </div>

        <div
          data-workspace-template-mode-filters
          className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-5"
          aria-label="Filter templates by source and capability"
        >
          {modeFilters.map((filter) => {
            const active = modeFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => {
                  setModeFilter(filter.key);
                  setTypeFilter("all");
                }}
                disabled={pending}
                className={
                  active
                    ? "rounded-lg border border-[#3d4f7c] bg-[#3d4f7c] px-2.5 py-2 text-left text-white shadow-sm disabled:opacity-50"
                    : "rounded-lg border border-border/60 bg-background px-2.5 py-2 text-left transition hover:border-[#3d4f7c]/40 hover:bg-muted/30 disabled:opacity-50"
                }
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wide">
                  {filter.label}
                </span>
                <span
                  className={
                    active
                      ? "mt-0.5 block text-[11px] text-white/75"
                      : "mt-0.5 block text-[11px] text-muted-foreground"
                  }
                >
                  {filter.count} template{filter.count === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>

        {typeFilters.length > 0 ? (
          <div
            data-workspace-template-type-filters
            className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Filter saved templates by section type or data source"
          >
            <button
              type="button"
              onClick={() => setTypeFilter("all")}
              className={
                typeFilter === "all"
                  ? "shrink-0 rounded-full bg-[#3d4f7c] px-2.5 py-1 text-[10px] font-semibold text-white"
                  : "shrink-0 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition hover:border-[#3d4f7c]/40 hover:text-foreground"
              }
            >
              All
              <span
                className={
                  typeFilter === "all"
                    ? "ml-1 text-white/70"
                    : "ml-1 text-muted-foreground/70"
                  }
              >
                {activeModeCount}
              </span>
            </button>
            {typeFilters.map(([label, count]) => (
              <button
                key={label}
                type="button"
                onClick={() => setTypeFilter(label)}
                className={
                  typeFilter === label
                    ? "shrink-0 rounded-full bg-[#3d4f7c] px-2.5 py-1 text-[10px] font-semibold text-white"
                    : "shrink-0 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition hover:border-[#3d4f7c]/40 hover:text-foreground"
                }
              >
                {label}
                <span
                  className={
                    typeFilter === label
                      ? "ml-1 text-white/70"
                      : "ml-1 text-muted-foreground/70"
                  }
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {templates === null ? (
          <div className="text-[11px] text-muted-foreground">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
            No templates yet. {enableSave ? "Save the current draft to start your library." : "Visit a workspace with content to save one."}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
            No saved templates match this search.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <ul className="grid gap-2 md:grid-cols-2">
              {filteredTemplates.map((template) => {
                const selected = selectedTemplate?.id === template.id;
                return (
                  <li
                    key={template.id}
                    data-workspace-template-card={template.id}
                    data-workspace-template-mode={template.mode}
                    className={
                      selected
                        ? "flex min-h-40 flex-col rounded-lg border border-[#3d4f7c] bg-background p-3 shadow-[0_0_0_2px_rgba(61,79,124,0.10)]"
                        : "flex min-h-40 flex-col rounded-lg border border-border/60 bg-background p-3 transition hover:border-[#3d4f7c]/40"
                    }
                  >
                    <TemplateWireframe template={template} compact />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {template.name}
                          </span>
                          <span
                            className={
                              template.mode === "data-ready"
                                ? "rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300"
                                : "rounded-full bg-zinc-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
                            }
                          >
                            {template.mode === "data-ready" ? "Data ready" : "Starter"}
                          </span>
                          {template.visibility === "platform" ? (
                            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                              Platform
                            </span>
                          ) : null}
                          {!template.ownTenant ? (
                            <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Shared
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {template.description || "Saved from a real draft composition."}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {template.sectionCount} sections
                      </span>
                    </div>
                    <div
                      data-workspace-template-type-summary={template.id}
                      className="mt-3 flex flex-wrap gap-1"
                    >
                      {template.dataSourceSummary.map((label) => (
                        <span
                          key={`${template.id}-data-${label}`}
                          data-workspace-template-data-summary={label}
                          className="rounded-full border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700 dark:text-blue-300"
                        >
                          {label}
                        </span>
                      ))}
                      {template.typeSummary.slice(0, 4).map((label) => (
                        <span
                          key={`${template.id}-${label}`}
                          className="rounded-full border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
                        >
                          {label}
                        </span>
                      ))}
                      {template.categorySummary.slice(0, 2).map((label) => (
                        <span
                          key={`${template.id}-category-${label}`}
                          className="rounded-full border border-border/60 bg-background px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                      <button
                        type="button"
                        onClick={() => setSelectedTemplateId(template.id)}
                        className="rounded-md border border-border/60 px-2 py-1 text-[10px] font-semibold hover:bg-muted/50"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewTemplateId(template.id)}
                        disabled={pending}
                        className="rounded-md border border-[#3d4f7c] bg-[#3d4f7c] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#4a5e94] disabled:opacity-50"
                      >
                        Review apply
                      </button>
                      {template.ownTenant ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              handlePromote(template.id, template.visibility === "platform")
                            }
                            disabled={pending}
                            className="rounded-md border border-border/60 px-2 py-1 text-[10px] hover:bg-muted/50 disabled:opacity-50"
                            title="Super-admin only — promote to platform marketplace"
                          >
                            {template.visibility === "platform" ? "Unpromote" : "Promote"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setArchiveTemplateId(template.id)}
                            disabled={pending}
                            className="rounded-md border border-border/60 px-2 py-1 text-[10px] text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Archive
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            {selectedTemplate ? (
              <WorkspaceTemplatePreviewPanel
                template={selectedTemplate}
                pending={pending}
                onReviewApply={() => setReviewTemplateId(selectedTemplate.id)}
              />
            ) : null}
          </div>
        )}

        {reviewTemplate ? (
          <WorkspaceTemplateApplyReviewDialog
            template={reviewTemplate}
            currentDraftSections={currentDraftSections}
            pending={pending}
            onClose={() => setReviewTemplateId(null)}
            onApply={() => handleApply(reviewTemplate)}
          />
        ) : null}

        {archiveTemplate ? (
          <WorkspaceTemplateArchiveDialog
            template={archiveTemplate}
            pending={pending}
            onClose={() => setArchiveTemplateId(null)}
            onArchive={() => handleDelete(archiveTemplate.id)}
          />
        ) : null}

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

type CurrentDraftSectionSummary = {
  id: string;
  name: string;
  slotLabel: string;
  typeLabel: string;
};

function formatTemplateDate(value: string | null): string {
  if (!value) return "Draft snapshot";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Draft snapshot";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function TemplateWireframe({
  template,
  compact = false,
}: {
  template: WorkspaceTemplateRow;
  compact?: boolean;
}) {
  const sections = template.sections.slice(0, compact ? 6 : 9);
  return (
    <div
      data-workspace-template-wireframe={template.id}
      className={
        compact
          ? "mb-3 rounded-md border border-border/50 bg-muted/20 p-2"
          : "rounded-md border border-border/60 bg-muted/20 p-3"
      }
      aria-hidden
    >
      <div className={compact ? "flex h-16 flex-col gap-1.5" : "flex h-24 flex-col gap-2"}>
        <div className="flex items-center justify-between gap-2">
          <div className="h-2.5 w-1/2 rounded-sm bg-muted-foreground/20" />
          {template.mode === "data-ready" ? (
            <div className="h-2.5 w-12 rounded-sm bg-blue-500/25" />
          ) : (
            <div className="h-2.5 w-8 rounded-sm bg-muted-foreground/10" />
          )}
        </div>
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {sections.map((section, index) => {
            const isData = Boolean(section.dataSourceLabel);
            return (
              <div
                key={`${template.id}-wire-${section.slotKey}-${section.sortOrder}-${index}`}
                className={
                  isData
                    ? "rounded-sm border border-blue-500/20 bg-blue-500/15"
                    : "rounded-sm bg-muted-foreground/10"
                }
                title={section.label}
              />
            );
          })}
          {sections.length === 0 ? (
            <div className="col-span-3 rounded-sm border border-dashed border-border/60" />
          ) : null}
        </div>
        <div className="h-1.5 w-full rounded-sm bg-muted-foreground/15" />
      </div>
    </div>
  );
}

function WorkspaceTemplatePreviewPanel({
  template,
  pending,
  onReviewApply,
}: {
  template: WorkspaceTemplateRow;
  pending: boolean;
  onReviewApply: () => void;
}) {
  return (
    <aside
      data-workspace-template-preview={template.id}
      className="rounded-lg border border-border/60 bg-background p-3"
      aria-label={`${template.name} template preview`}
    >
      <TemplateWireframe template={template} />

      <div className="mt-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {template.mode === "data-ready"
              ? "Data-ready template"
              : "Starter template"}
          </div>
          <h4 className="mt-0.5 text-sm font-semibold leading-tight text-foreground">
            {template.name}
          </h4>
        </div>
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {formatTemplateDate(template.capturedAt ?? template.createdAt)}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {template.description ||
          "Reusable draft snapshot with cloned sections and preserved ordering."}
      </p>
      <div className="mt-3 grid gap-1.5">
        {template.dataSourceSummary.length > 0 ? (
          <div className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Live data
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {template.dataSourceSummary.map((label) => (
                <span
                  key={`${template.id}-preview-data-${label}`}
                  className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {template.categorySummary.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {template.categorySummary.map((label) => (
              <span
                key={`${template.id}-preview-category-${label}`}
                className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Section order
        </div>
        <ol
          data-workspace-template-preview-sections={template.id}
          className="mt-2 space-y-1"
        >
          {template.sections.slice(0, 8).map((section, index) => (
            <li
              key={`${template.id}-${section.slotKey}-${section.sortOrder}-${index}`}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5"
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                {section.name}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {section.label}
              </span>
            </li>
          ))}
          {template.sections.length > 8 ? (
            <li className="rounded-md border border-dashed border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground">
              +{template.sections.length - 8} more sections
            </li>
          ) : null}
        </ol>
      </div>
      <button
        type="button"
        onClick={onReviewApply}
        disabled={pending}
        className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md bg-[#3d4f7c] px-3 text-xs font-semibold text-white transition hover:bg-[#4a5e94] disabled:opacity-50"
      >
        Review apply
      </button>
    </aside>
  );
}

function WorkspaceTemplateApplyReviewDialog({
  template,
  currentDraftSections,
  pending,
  onClose,
  onApply,
}: {
  template: WorkspaceTemplateRow;
  currentDraftSections: CurrentDraftSectionSummary[];
  pending: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  return (
    <div
      data-workspace-template-apply-review={template.id}
      className="fixed inset-0 z-[135] flex items-center justify-center bg-zinc-950/45 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`workspace-template-apply-title-${template.id}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white text-zinc-950 shadow-2xl ring-1 ring-black/10">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Review saved template
            </div>
            <h4
              id={`workspace-template-apply-title-${template.id}`}
              className="mt-1 text-xl font-semibold tracking-tight"
            >
              Apply {template.name}
            </h4>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
              Applying a saved template clones its sections into this workspace
              and replaces the homepage draft composition. Existing sections are
              kept in the section library.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
            aria-label="Close saved template review"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Current draft</div>
              <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-500">
                {currentDraftSections.length} sections
              </span>
            </div>
            <ol
              data-workspace-template-review-current-sections
              className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1"
            >
              {currentDraftSections.slice(0, 12).map((section, index) => (
                <li
                  key={section.id}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                    <span className="text-[10px] font-semibold tabular-nums text-zinc-400">
                      {index + 1}
                    </span>
                    <span className="min-w-0 truncate">{section.name}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {section.slotLabel} · {section.typeLabel}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Saved template</div>
              <span className="rounded-full border border-indigo-100 bg-white px-2 py-0.5 text-xs font-medium text-indigo-700">
                {template.sectionCount} sections
              </span>
            </div>
            <ol
              data-workspace-template-review-next-sections={template.id}
              className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1"
            >
              {template.sections.map((section, index) => (
                <li
                  key={`${template.id}-review-${section.slotKey}-${section.sortOrder}-${index}`}
                  className="rounded-lg border border-indigo-100 bg-white px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-semibold tabular-nums text-indigo-700">
                      {index + 1}
                    </span>
                    <span className="min-w-0 truncate">{section.name}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {section.slotKey} · {section.label}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Keep current draft
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#3d4f7c] px-4 text-sm font-semibold text-white transition hover:bg-[#4a5e94] disabled:opacity-50"
          >
            {pending ? "Applying..." : "Apply saved template"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceTemplateArchiveDialog({
  template,
  pending,
  onClose,
  onArchive,
}: {
  template: WorkspaceTemplateRow;
  pending: boolean;
  onClose: () => void;
  onArchive: () => void;
}) {
  return (
    <div
      data-workspace-template-archive-review={template.id}
      className="fixed inset-0 z-[135] flex items-center justify-center bg-zinc-950/45 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`workspace-template-archive-title-${template.id}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white text-zinc-950 shadow-2xl ring-1 ring-black/10">
        <div className="border-b border-zinc-200 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Archive template
          </div>
          <h4
            id={`workspace-template-archive-title-${template.id}`}
            className="mt-1 text-xl font-semibold tracking-tight"
          >
            Archive {template.name}
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            This removes the template from the gallery without deleting the
            saved row. Published pages and existing section library entries are
            not changed.
          </p>
        </div>

        <div className="px-5 py-5">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-950">
                  {template.name}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {template.description ||
                    "Saved from a real draft composition."}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-500">
                {template.sectionCount} sections
              </span>
            </div>
            {template.typeSummary.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {template.typeSummary.slice(0, 5).map((label) => (
                  <span
                    key={`${template.id}-archive-${label}`}
                    className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Keep template
          </button>
          <button
            type="button"
            onClick={onArchive}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Archiving..." : "Archive template"}
          </button>
        </div>
      </div>
    </div>
  );
}
