"use client";

/**
 * First-run exit after AI-at-signup: replace the seeded homepage with another
 * PAGE_DESIGNS layout. The homepage Add gallery does not offer page templates
 * (`allowDbTemplates: false`), so without this picker a bad seed is permanent.
 *
 * Apply writes a DRAFT. The live site stays until the operator publishes.
 *
 * TUL-331: talent workspaces do NOT see this picker - their look change is the
 * finished theme gallery (Maison v2 / Folio / Gridline), not 14 agency/SaaS
 * page starters. Business workspaces see workspace|both starters only.
 */

import { useActionState, useEffect, useState } from "react";

import { starterSummariesForSurface } from "@/components/edit-chrome/empty-canvas-starter-surface";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { PAGE_DESIGN_SUMMARIES } from "@/lib/site-admin/builder-node/page-designs/summaries";
import { applyPageDesignToHomepage } from "@/lib/site-admin/edit-mode/page-design-apply-action";

import { meetsRole, useAdminShell } from "../state";

export function HomepageDesignSwap() {
  const t = useT();
  const { toast, state } = useAdminShell();
  const canEdit = meetsRole(state.role, "admin");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, formAction, pending] = useActionState(
    applyPageDesignToHomepage,
    undefined,
  );

  useEffect(() => {
    if (!formState) return;
    if (formState.ok) {
      toast(t("dashboard.adminWebsite.designSwap.appliedToast"));
      setSelectedId(null);
      return;
    }
    toast(formState.error);
  }, [formState, t, toast]);

  // Talent site look = finished theme gallery, not PAGE_DESIGN agency starters.
  if (!canEdit || state.workspaceType === "talent") return null;

  const designs = starterSummariesForSurface(PAGE_DESIGN_SUMMARIES, "workspace");
  const selected = designs.find((row) => row.id === selectedId);

  return (
    <section
      aria-label={t("dashboard.adminWebsite.designSwap.aria")}
      className="mb-[18px] rounded-admin-lg border border-admin-border bg-admin-card p-[16px]"
      data-homepage-design-swap="workspace"
    >
      <h2 className="m-0 text-admin-13h font-semibold text-admin-ink">
        {t("dashboard.adminWebsite.designSwap.title")}
      </h2>
      <p className="mt-[6px] mb-0 text-admin-11h leading-relaxed text-admin-ink-muted">
        {t("dashboard.adminWebsite.designSwap.body")}
      </p>
      <div className="mt-[12px] grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-[8px]">
        {designs.map((design) => {
          const active = design.id === selectedId;
          return (
            <button
              key={design.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedId(design.id)}
              className={`cursor-pointer rounded-admin-md border px-[10px] py-[8px] text-left ${
                active
                  ? "border-admin-ink bg-admin-accent-soft"
                  : "border-admin-border bg-admin-card"
              }`}
            >
              <span className="block text-admin-12h font-semibold text-admin-ink">
                {design.label}
              </span>
              <span className="mt-[2px] block text-admin-10h leading-relaxed text-admin-ink-muted">
                {design.description}
              </span>
            </button>
          );
        })}
      </div>
      {selected ? (
        <form action={formAction} className="mt-[12px] flex flex-wrap items-center gap-[8px]">
          <input type="hidden" name="designId" value={selected.id} />
          <p className="m-0 min-w-[220px] flex-1 text-admin-11h text-admin-ink">
            {interpolate(t("dashboard.adminWebsite.designSwap.confirm"), {
              label: selected.label,
            })}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => setSelectedId(null)}
            className="inline-flex cursor-pointer items-center rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink disabled:opacity-60"
          >
            {t("dashboard.adminWebsite.designSwap.cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex cursor-pointer items-center rounded-admin-md border border-admin-ink bg-admin-ink px-[12px] py-[6px] text-admin-12h font-semibold text-admin-surface disabled:opacity-60"
          >
            {t("dashboard.adminWebsite.designSwap.replace")}
          </button>
        </form>
      ) : null}
    </section>
  );
}
