"use client";

/**
 * FeaturedTalentContentInspector — bespoke Content tab for featured_talent.
 *
 * This is the section agency operators touch most often in steady-state
 * editing. The generic fallback rendered the `sourceMode` discriminated
 * union as a raw enum dropdown plus all other fields always-visible,
 * regardless of mode. Operators ended up copy-pasting profile codes from
 * another tab. This panel fixes that:
 *
 *   1. Mode as a visual tile picker (3 tiles: Hand-picked / By role / Latest).
 *      Each tile has a wireframe + a one-line rationale.
 *   2. A conditional sub-panel for the selected mode (only the relevant
 *      fields render). Switching modes warns if the other mode's work would
 *      be lost, and stashes that work in a ref so re-selecting the mode
 *      restores it within the same session.
 *   3. Hand-picked mode is a TalentPicker modal launcher, not a code array.
 *   4. Header copy (eyebrow / headline / intro) in a calm top group.
 *   5. Footer CTA collapsed by default.
 *   6. Grid tuning (limit, columns, variant) in Advanced.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { resolveBuilderNodeRole } from "@/lib/site-admin/builder-node";

import {
  KIT,
  InspectorGroup,
  InspectorItemRow,
  InspectorRowDelete,
  VisualChipGroup,
  CtaDuoEditor,
  DraggableList,
  TalentPicker,
  type CtaShape,
} from "./kit";
import {
  resolveTalentByCodesAction,
  type TalentSearchHit,
} from "@/lib/site-admin/edit-mode/talent-search";
import { v11FeaturedTalentPreset } from "@/lib/site-admin/sections/featured_talent/presets";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import { useEditorLocale } from "../use-editor-locale";

type SourceMode =
  | "manual_pick"
  | "auto_featured_flag"
  | "auto_by_service"
  | "auto_by_destination"
  | "auto_recent";
type Variant = "grid" | "carousel";
type LayoutPreset = "standard" | "v11-showcase";
type HeaderAlign = "split" | "left" | "center";
type CardChrome = "standard" | "v11-noir";
type ImageTreatment = "natural" | "cinematic";
type ActionStyle = "primary-duo" | "outline-duo";

interface Props {
  draftProps: Record<string, unknown>;
  tenantId: string;
  selectedBuilderNodeId: string | null;
  onChange: (next: Record<string, unknown>) => void;
}

function modeOptions(
  t: ReturnType<typeof useEditorLocale>["t"],
): ReadonlyArray<{
  value: SourceMode;
  label: string;
  info: string;
}> {
  return [
    {
      value: "manual_pick",
      label: t("Hand-picked"),
      info: t("Choose specific talent by name. Ideal when you want editorial control over the lineup."),
    },
    {
      value: "auto_featured_flag",
      label: t("Featured latest"),
      info: t("Auto-fills with your most recently featured talent. Set-and-forget."),
    },
    {
      value: "auto_by_service",
      label: t("By role"),
      info: t("Filters roster by a service category (models, hair, photographers…)."),
    },
    {
      value: "auto_by_destination",
      label: t("By destination"),
      info: t("Filters roster by location slug. Good for city or region pages."),
    },
    {
      value: "auto_recent",
      label: t("Most recent"),
      info: t("Auto-fills with the roster's most recently approved talent."),
    },
  ];
}

function cleanObject<T extends Record<string, unknown>>(o: T): T {
  const out = { ...o };
  for (const k of Object.keys(out)) {
    const v = out[k as keyof T];
    if (v === "" || v === null || v === undefined) delete out[k as keyof T];
  }
  return out;
}

export function FeaturedTalentContentInspector({
  draftProps,
  tenantId,
  selectedBuilderNodeId,
  onChange,
}: Props) {
  const { t } = useEditorLocale();
  const eyebrow = (draftProps.eyebrow as string | undefined) ?? "";
  const headline = (draftProps.headline as string | undefined) ?? "";
  const copy = (draftProps.copy as string | undefined) ?? "";
  const sourceMode =
    (draftProps.sourceMode as SourceMode | undefined) ?? "auto_featured_flag";
  const manualProfileCodes =
    (draftProps.manualProfileCodes as string[] | undefined) ?? [];
  const filterServiceSlug =
    (draftProps.filterServiceSlug as string | undefined) ?? "";
  const filterDestinationSlug =
    (draftProps.filterDestinationSlug as string | undefined) ?? "";
  const limit = (draftProps.limit as number | undefined) ?? 6;
  const columnsDesktop = (draftProps.columnsDesktop as number | undefined) ?? 3;
  const variant = (draftProps.variant as Variant | undefined) ?? "grid";
  const layoutPreset =
    (draftProps.layoutPreset as LayoutPreset | undefined) ?? "standard";
  const headerAlign =
    (draftProps.headerAlign as HeaderAlign | undefined) ??
    (layoutPreset === "v11-showcase" ? "center" : "split");
  const cardChrome =
    (draftProps.cardChrome as CardChrome | undefined) ??
    (layoutPreset === "v11-showcase" ? "v11-noir" : "standard");
  const imageTreatment =
    (draftProps.imageTreatment as ImageTreatment | undefined) ??
    (layoutPreset === "v11-showcase" ? "cinematic" : "natural");
  const actionStyle =
    (draftProps.actionStyle as ActionStyle | undefined) ??
    (layoutPreset === "v11-showcase" ? "outline-duo" : "primary-duo");
  const showBookmarkIcon =
    (draftProps.showBookmarkIcon as boolean | undefined) ?? false;
  const requestCta = (draftProps.requestCta as CtaShape | undefined) ?? null;
  const footerCta = (draftProps.footerCta as CtaShape | undefined) ?? null;
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Per-mode stash. If the operator fills manual codes, switches to
  // by-service, the codes would otherwise be dropped on the next save.
  // Stash by mode so re-selecting restores what they had — until this
  // section's panel unmounts (new selection or exit).
  const stashRef = useRef<{
    manual_pick: string[];
    auto_by_service: string;
    auto_by_destination: string;
  }>({
    manual_pick: manualProfileCodes,
    auto_by_service: filterServiceSlug,
    auto_by_destination: filterDestinationSlug,
  });

  const focusRole = useMemo(() => {
    if (!selectedBuilderNodeId) return null;
    const role = resolveBuilderNodeRole(selectedBuilderNodeId);
    if (role === "subheadline" || role === "headline" || role === "copy" || role === "footerCta") {
      return role;
    }
    return null;
  }, [selectedBuilderNodeId]);

  const focusLabel = useMemo(() => {
    if (focusRole === "subheadline") return t("Eyebrow");
    if (focusRole === "headline") return t("Headline");
    if (focusRole === "copy") return t("Intro copy");
    if (focusRole === "footerCta") return t("Footer link");
    return null;
  }, [focusRole, t]);

  useEffect(() => {
    if (!focusRole) return;
    const root = rootRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-featured-talent-node-role="${focusRole}"]`,
    );
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const focusable = target.querySelector<HTMLElement>(
      "[contenteditable='true'],input,textarea,select,button",
    );
    focusable?.focus({ preventScroll: true });
  }, [focusRole]);

  function update(patch: Record<string, unknown>) {
    onChange(cleanObject({ ...draftProps, ...patch }));
  }

  function applyV11Preset() {
    onChange({
      ...draftProps,
      ...v11FeaturedTalentPreset,
      presentation: { ...v11FeaturedTalentPreset.presentation },
    });
  }

  const fieldOn = (key: string) =>
    (draftProps[key] as boolean | undefined) !== false;

  function switchMode(next: SourceMode) {
    if (next === sourceMode) return;
    // Stash outgoing mode's data.
    if (sourceMode === "manual_pick") {
      stashRef.current.manual_pick = manualProfileCodes;
    } else if (sourceMode === "auto_by_service") {
      stashRef.current.auto_by_service = filterServiceSlug;
    } else if (sourceMode === "auto_by_destination") {
      stashRef.current.auto_by_destination = filterDestinationSlug;
    }

    const patch: Record<string, unknown> = { sourceMode: next };
    // Clear fields that don't apply to the new mode.
    patch.manualProfileCodes = undefined;
    patch.filterServiceSlug = undefined;
    patch.filterDestinationSlug = undefined;
    // Restore from stash for the new mode.
    if (next === "manual_pick" && stashRef.current.manual_pick.length > 0) {
      patch.manualProfileCodes = stashRef.current.manual_pick;
    }
    if (next === "auto_by_service" && stashRef.current.auto_by_service) {
      patch.filterServiceSlug = stashRef.current.auto_by_service;
    }
    if (next === "auto_by_destination" && stashRef.current.auto_by_destination) {
      patch.filterDestinationSlug = stashRef.current.auto_by_destination;
    }
    update(patch);
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {focusRole && focusLabel ? (
        <div
          className="rounded-lg border px-3 py-2 text-xs font-medium"
          style={{
            borderColor: "#bfdbfe",
            background: "#eff6ff",
            color: "#1d4ed8",
          }}
        >
          {t("Editing selected canvas node:")} {focusLabel}
        </div>
      ) : null}

      <div className={KIT.field} data-featured-talent-node-role="subheadline">
        <label className={KIT.label}>{t("Eyebrow")}</label>
        <input
          type="text"
          className={KIT.input}
          placeholder={t("Optional, e.g. Featured this month")}
          maxLength={60}
          value={eyebrow}
          onChange={(e) => update({ eyebrow: e.target.value || undefined })}
        />
      </div>
      <div className={KIT.field} data-featured-talent-node-role="headline">
        <label className={KIT.label}>{t("Headline")}</label>
        <RichEditor
          value={headline}
          onChange={(next) => update({ headline: next || undefined })}
          variant="single"
          tenantId={tenantId}
          placeholder={t("A section title that names the set")}
          ariaLabel={t("Headline")}
        />
      </div>
      <div className={KIT.field} data-featured-talent-node-role="copy">
        <label className={KIT.label}>{t("Description")}</label>
        <RichEditor
          value={copy}
          onChange={(next) => update({ copy: next || undefined })}
          variant="multi"
          tenantId={tenantId}
          placeholder={t("Optional, one paragraph of context")}
          ariaLabel={t("Description")}
        />
      </div>

      <InspectorGroup title={t("Layout")} storageKey="featured_talent:layout-main">
        <VisualChipGroup<Variant>
          value={variant}
          onChange={(v) => update({ variant: v })}
          options={[
            {
              value: "grid",
              label: t("Uniform card grid"),
              preview: <GridPreview />,
            },
            {
              value: "carousel",
              label: t("Horizontal rail"),
              preview: <CarouselPreview />,
            },
          ]}
          columns={2}
        />
      </InspectorGroup>

      <InspectorGroup
        title={t("Preset")}
        collapsible
        storageKey="featured_talent:preset"
        defaultOpen={false}
      >
        <p className={KIT.hint}>
          {t("V11 showcase: centered header, four-card noir grid, cinematic images, outline buttons, and Explore Talent footer link.")}
        </p>
        <button type="button" className={KIT.primaryButton} onClick={applyV11Preset}>
          {t("Apply full preset")}
        </button>
      </InspectorGroup>

      <InspectorGroup title={t("Talent source")} storageKey="featured_talent:source">
        <VisualChipGroup<SourceMode>
          value={sourceMode}
          onChange={switchMode}
          options={modeOptions(t).map((opt) => ({
            ...opt,
            preview: <ModePreview value={opt.value} />,
          }))}
          columns={3}
        />

        <div className="mt-2">
          {sourceMode === "manual_pick" ? (
            <ManualPickPanel
              codes={manualProfileCodes}
              max={12}
              onChange={(codes) =>
                update({
                  manualProfileCodes: codes.length > 0 ? codes : undefined,
                })
              }
            />
          ) : null}
          {sourceMode === "auto_by_service" ? (
            <AutoFilterInput
              label={t("Service slug")}
              placeholder={t("e.g. models, hair-and-makeup")}
              value={filterServiceSlug}
              onChange={(v) =>
                update({ filterServiceSlug: v || undefined })
              }
              hint={t("Exactly matches your service_category_slug. Check /admin/taxonomy for valid slugs.")}
            />
          ) : null}
          {sourceMode === "auto_by_destination" ? (
            <AutoFilterInput
              label={t("Destination slug")}
              placeholder={t("e.g. tulum, los-cabos")}
              value={filterDestinationSlug}
              onChange={(v) =>
                update({ filterDestinationSlug: v || undefined })
              }
              hint={t("Matches destinations on talent profiles.")}
            />
          ) : null}
          {sourceMode === "auto_featured_flag" ? (
            <SteadyStateNote text={t("Featured-flagged talent appear here in your chosen order. Nothing to configure.")} />
          ) : null}
          {sourceMode === "auto_recent" ? (
            <SteadyStateNote text={t("The most recently approved roster talent appear here. Updates as your roster grows.")} />
          ) : null}
        </div>
      </InspectorGroup>

      <InspectorGroup
        title={t("Visual style")}
        info={t("Controls the visual system around the live talent cards.")}
        storageKey="featured_talent:prototype"
        collapsible
        defaultOpen={false}
      >
        <VisualChipGroup<LayoutPreset>
          value={layoutPreset}
          onChange={(v) => update({ layoutPreset: v })}
          options={[
            {
              value: "v11-showcase",
              label: t("V11 showcase"),
              info: t("Centered title, four-card noir grid, footer arrow."),
              preview: <ShowcasePreview />,
            },
            {
              value: "standard",
              label: t("Standard"),
              info: t("Uses the tenant directory-card family and normal header."),
              preview: <GridPreview />,
            },
          ]}
          columns={2}
        />
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className={KIT.field}>
            <label className={KIT.label}>{t("Header alignment")}</label>
            <VisualChipGroup<HeaderAlign>
              value={headerAlign}
              onChange={(v) => update({ headerAlign: v })}
              options={[
                { value: "split", label: t("Split"), preview: null },
                { value: "left", label: t("Left"), preview: null },
                { value: "center", label: t("Center"), preview: null },
              ]}
              columns={3}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>{t("Card chrome")}</label>
            <VisualChipGroup<CardChrome>
              value={cardChrome}
              onChange={(v) => update({ cardChrome: v })}
              options={[
                { value: "v11-noir", label: t("V11 noir"), preview: null },
                { value: "standard", label: t("Theme"), preview: null },
              ]}
              columns={2}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>{t("Image treatment")}</label>
            <VisualChipGroup<ImageTreatment>
              value={imageTreatment}
              onChange={(v) => update({ imageTreatment: v })}
              options={[
                { value: "cinematic", label: t("Cinematic"), preview: null },
                { value: "natural", label: t("Natural"), preview: null },
              ]}
              columns={2}
            />
          </div>
          <div className={KIT.field}>
            <label className={KIT.label}>{t("Action style")}</label>
            <VisualChipGroup<ActionStyle>
              value={actionStyle}
              onChange={(v) => update({ actionStyle: v })}
              options={[
                { value: "outline-duo", label: t("Outline duo"), preview: null },
                { value: "primary-duo", label: t("Primary"), preview: null },
              ]}
              columns={2}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <ToggleRow
            label={t("Bookmark glyph")}
            checked={showBookmarkIcon}
            onChange={(checked) => update({ showBookmarkIcon: checked })}
          />
          <ToggleRow
            label={t("Featured badge")}
            checked={fieldOn("showBadge")}
            onChange={(checked) => update({ showBadge: checked })}
          />
        </div>
      </InspectorGroup>

      <InspectorGroup
        title={t("Card fields")}
        info={t("Choose which public profile fields are visible on each card.")}
        collapsible
        storageKey="featured_talent:card-content"
        defaultOpen={false}
      >
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            ["showName", t("Name")],
            ["showPrimaryType", t("Primary role")],
            ["showSecondaryType", t("Secondary role")],
            ["showCity", t("City")],
            ["showLanguages", t("Languages")],
            ["showAvailability", t("Availability")],
          ].map(([key, label]) => (
            <ToggleRow
              key={key}
              label={label}
              checked={fieldOn(key)}
              onChange={(checked) => update({ [key]: checked })}
            />
          ))}
        </div>
        <p className={KIT.hint}>
          {t("Availability only appears when a real public availability label exists; this section does not invent availability claims.")}
        </p>
      </InspectorGroup>

      <InspectorGroup
        title={t("Card actions")}
        info={t("Optional per-card Request/Add to inquiry action.")}
        collapsible
        storageKey="featured_talent:card-actions"
        defaultOpen={false}
      >
        <CtaDuoEditor
          primary={requestCta}
          secondary={null}
          onChangePrimary={(next) => update({ requestCta: next ?? undefined })}
          onChangeSecondary={() => {}}
          allowSecondary={false}
        />
      </InspectorGroup>

      <InspectorGroup
        title={t("Footer link")}
        info={t('Optional "See the full roster" style link under the grid.')}
        collapsible
        storageKey="featured_talent:footer"
        defaultOpen={Boolean(footerCta)}
      >
        <CtaDuoEditor
          primary={footerCta}
          secondary={null}
          onChangePrimary={(next) => update({ footerCta: next ?? undefined })}
          onChangeSecondary={() => {}}
          allowSecondary={false}
          primaryNodeRole="footerCta"
        />
      </InspectorGroup>

      <InspectorGroup
        title={t("Advanced")}
        advanced
        collapsible
        storageKey="featured_talent:advanced"
      >
        <div className={KIT.field}>
          <label className={KIT.label}>{t("Maximum cards:")} {limit}</label>
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={limit}
            onChange={(e) => update({ limit: Number(e.target.value) })}
            className="w-full accent-stone-900"
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>
            {t("Desktop columns:")} {columnsDesktop}
          </label>
          <input
            type="range"
            min={2}
            max={4}
            step={1}
            value={columnsDesktop}
            onChange={(e) =>
              update({ columnsDesktop: Number(e.target.value) })
            }
            className="w-full accent-stone-900"
          />
        </div>
      </InspectorGroup>
    </div>
  );
}

// ── manual pick (picker launcher + selected list) ─────────────────────────

function ManualPickPanel({
  codes,
  max,
  onChange,
}: {
  codes: string[];
  max: number;
  onChange: (next: string[]) => void;
}) {
  const { t } = useEditorLocale();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resolved, setResolved] = useState<TalentSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate code → richer display whenever codes change. Keeps the picker
  // closed-state view informative (thumbs + names, not raw codes).
  useEffect(() => {
    let cancelled = false;
    if (codes.length === 0) {
      setResolved([]);
      return;
    }
    setLoading(true);
    (async () => {
      const res = await resolveTalentByCodesAction({ codes });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setResolved([]);
        return;
      }
      setError(null);
      setResolved(res.hits);
    })();
    return () => {
      cancelled = true;
    };
  }, [codes]);

  const missingCount = useMemo(() => {
    const present = new Set(resolved.map((r) => r.profileCode));
    return codes.filter((c) => !present.has(c)).length;
  }, [codes, resolved]);

  const canPickMore = codes.length < max;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-stone-600">
          {codes.length === 0
            ? t("No one picked yet.")
            : t("{count} of {max} picked")
                .replace("{count}", String(codes.length))
                .replace("{max}", String(max))}
          {missingCount > 0 ? (
            <span className="ml-1.5 text-rose-600">
              · {missingCount} {t("off-roster")}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className={KIT.primaryButton}
        >
          {codes.length === 0 ? t("Pick talent") : t("Edit selection")}
        </button>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
          {error}
        </p>
      ) : null}

      {loading && resolved.length === 0 ? (
        <div className="space-y-1.5">
          {Array.from({ length: Math.min(codes.length, 3) }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border border-stone-100 bg-stone-50"
            />
          ))}
        </div>
      ) : resolved.length > 0 ? (
        <DraggableList<TalentSearchHit>
          items={resolved}
          keyOf={(h) => h.profileCode}
          onReorder={(next) => onChange(next.map((h) => h.profileCode))}
        >
          {(hit, _i, handleProps) => (
            <InspectorItemRow
              handleProps={handleProps}
              thumb={
                hit.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hit.thumbnailUrl}
                    alt={hit.displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    {initials(hit.displayName)}
                  </span>
                )
              }
              trailing={
                <InspectorRowDelete
                  onClick={() =>
                    onChange(codes.filter((c) => c !== hit.profileCode))
                  }
                />
              }
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-stone-900">
                  {hit.displayName}
                </div>
                <div className="truncate text-[11px] text-stone-500">
                  {hit.roleLabel ?? hit.profileCode}
                </div>
              </div>
            </InspectorItemRow>
          )}
        </DraggableList>
      ) : null}

      {!canPickMore ? (
        <p className={KIT.hint}>
          {t("Maximum {max} picks. Remove someone to add another.").replace(
            "{max}",
            String(max),
          )}
        </p>
      ) : null}

      <TalentPicker
        open={pickerOpen}
        initialCodes={codes}
        maxCount={max}
        onConfirm={(next) => {
          onChange(next);
          setPickerOpen(false);
        }}
        onCancel={() => setPickerOpen(false)}
      />
    </div>
  );
}

function AutoFilterInput({
  label,
  placeholder,
  value,
  onChange,
  hint,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <div className={KIT.field}>
      <label className={KIT.label}>{label}</label>
      <input
        type="text"
        className={KIT.input}
        placeholder={placeholder}
        value={value}
        maxLength={120}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className={KIT.hint}>{hint}</p>
    </div>
  );
}

function SteadyStateNote({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-stone-100 bg-stone-50/60 px-3 py-2 text-[11px] leading-relaxed text-stone-600">
      {text}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-2.5 py-2 text-[12px] font-medium text-stone-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

// ── mode previews ─────────────────────────────────────────────────────────

function ShowcasePreview() {
  return (
    <svg viewBox="0 0 68 36" className="h-[36px] w-[68px]" aria-hidden>
      <rect x="8" y="3" width="52" height="4" rx="1" className="fill-amber-500" />
      {[0, 1, 2, 3].map((col) => (
        <g key={col} transform={`translate(${4 + col * 16} 11)`}>
          <rect width="13" height="20" rx="1.5" className="fill-stone-900" />
          <rect x="2" y="14" width="9" height="1.5" rx=".5" className="fill-stone-100" />
          <rect x="2" y="17" width="6" height="1" rx=".5" className="fill-amber-500" />
        </g>
      ))}
    </svg>
  );
}

function ModePreview({ value }: { value: SourceMode }) {
  const common = "w-[68px] h-[36px]";
  if (value === "manual_pick") {
    return (
      <svg viewBox="0 0 68 36" className={common} aria-hidden>
        <rect x="3" y="6" width="13" height="24" rx="2" className="fill-stone-400" />
        <rect x="19" y="6" width="13" height="24" rx="2" className="fill-stone-900" />
        <rect x="35" y="6" width="13" height="24" rx="2" className="fill-stone-400" />
        <rect x="51" y="6" width="13" height="24" rx="2" className="fill-stone-900" />
        <circle cx="25.5" cy="33.5" r="1.5" className="fill-stone-900" />
        <circle cx="57.5" cy="33.5" r="1.5" className="fill-stone-900" />
      </svg>
    );
  }
  if (value === "auto_featured_flag") {
    return (
      <svg viewBox="0 0 68 36" className={common} aria-hidden>
        <rect x="3" y="6" width="13" height="24" rx="2" className="fill-stone-300" />
        <rect x="19" y="6" width="13" height="24" rx="2" className="fill-stone-300" />
        <rect x="35" y="6" width="13" height="24" rx="2" className="fill-stone-300" />
        <rect x="51" y="6" width="13" height="24" rx="2" className="fill-stone-300" />
        <path
          d="M6 12 l2 0 l1-2 l1 2 l2 0 l-1.5 1.5 l.5 2 l-2-1 l-2 1 l.5-2z"
          className="fill-amber-500"
        />
      </svg>
    );
  }
  if (value === "auto_by_service") {
    return (
      <svg viewBox="0 0 68 36" className={common} aria-hidden>
        <rect x="3" y="3" width="62" height="5" rx="2" className="fill-stone-900/80" />
        <rect x="3" y="12" width="13" height="20" rx="2" className="fill-stone-300" />
        <rect x="19" y="12" width="13" height="20" rx="2" className="fill-stone-300" />
        <rect x="35" y="12" width="13" height="20" rx="2" className="fill-stone-300" />
        <rect x="51" y="12" width="13" height="20" rx="2" className="fill-stone-300" />
      </svg>
    );
  }
  if (value === "auto_by_destination") {
    return (
      <svg viewBox="0 0 68 36" className={common} aria-hidden>
        <circle cx="20" cy="18" r="10" className="fill-none stroke-stone-500" strokeWidth="1" />
        <path
          d="M20 10 v16 M12 18 h16"
          className="stroke-stone-500"
          strokeWidth="1"
          fill="none"
        />
        <rect x="36" y="10" width="28" height="4" rx="1" className="fill-stone-400" />
        <rect x="36" y="17" width="22" height="4" rx="1" className="fill-stone-400" />
        <rect x="36" y="24" width="26" height="4" rx="1" className="fill-stone-400" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 68 36" className={common} aria-hidden>
      <rect x="3" y="6" width="13" height="24" rx="2" className="fill-stone-500" />
      <rect x="19" y="6" width="13" height="24" rx="2" className="fill-stone-400" />
      <rect x="35" y="6" width="13" height="24" rx="2" className="fill-stone-300" />
      <rect x="51" y="6" width="13" height="24" rx="2" className="fill-stone-200" />
    </svg>
  );
}

function GridPreview() {
  return (
    <svg viewBox="0 0 68 36" className="w-[68px] h-[36px]" aria-hidden>
      {[0, 1, 2].map((col) =>
        [0, 1].map((row) => (
          <rect
            key={`${col}-${row}`}
            x={3 + col * 22}
            y={3 + row * 16}
            width={18}
            height={14}
            rx={2}
            className="fill-stone-400"
          />
        )),
      )}
    </svg>
  );
}

function CarouselPreview() {
  return (
    <svg viewBox="0 0 68 36" className="w-[68px] h-[36px]" aria-hidden>
      <rect x="3" y="6" width="18" height="24" rx="2" className="fill-stone-400" />
      <rect x="24" y="6" width="18" height="24" rx="2" className="fill-stone-400" />
      <rect x="45" y="6" width="18" height="24" rx="2" className="fill-stone-400" />
      <rect x="65" y="6" width="4" height="24" rx="1" className="fill-stone-300" />
    </svg>
  );
}

function initials(s: string) {
  const trimmed = s.trim();
  if (!trimmed) return "·";
  const words = trimmed.split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]!.toUpperCase()).join("");
}
