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

import { useMemo, useRef, useState } from "react";

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
import { useEffect } from "react";
import { RichEditor } from "@/components/edit-chrome/rich-editor";

type SourceMode =
  | "manual_pick"
  | "auto_featured_flag"
  | "auto_by_service"
  | "auto_by_destination"
  | "auto_recent";
type Variant = "grid" | "carousel";

interface Props {
  draftProps: Record<string, unknown>;
  tenantId: string;
  onChange: (next: Record<string, unknown>) => void;
}

const MODE_OPTIONS: ReadonlyArray<{
  value: SourceMode;
  label: string;
  info: string;
}> = [
  {
    value: "manual_pick",
    label: "Hand-picked",
    info: "Choose specific talent by name. Ideal when you want editorial control over the lineup.",
  },
  {
    value: "auto_featured_flag",
    label: "Featured latest",
    info: "Auto-fills with your most recently featured talent. Set-and-forget.",
  },
  {
    value: "auto_by_service",
    label: "By role",
    info: "Filters roster by a service category (models, hair, photographers…).",
  },
  {
    value: "auto_by_destination",
    label: "By destination",
    info: "Filters roster by location slug. Good for city or region pages.",
  },
  {
    value: "auto_recent",
    label: "Most recent",
    info: "Auto-fills with the roster's most recently approved talent.",
  },
];

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
  onChange,
}: Props) {
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
  const footerCta = (draftProps.footerCta as CtaShape | undefined) ?? null;

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

  function update(patch: Record<string, unknown>) {
    onChange(cleanObject({ ...draftProps, ...patch }));
  }

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
    <div className="flex flex-col gap-6">
      <InspectorGroup title="Header" storageKey="featured_talent:header">
        <div className={KIT.field}>
          <label className={KIT.label}>Eyebrow</label>
          <input
            type="text"
            className={KIT.input}
            placeholder="Optional — e.g. Featured this month"
            maxLength={60}
            value={eyebrow}
            onChange={(e) => update({ eyebrow: e.target.value || undefined })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Headline</label>
          <RichEditor
            value={headline}
            onChange={(next) => update({ headline: next || undefined })}
            variant="single"
            tenantId={tenantId}
            placeholder="A section title that names the set"
            ariaLabel="Headline"
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Intro copy</label>
          <RichEditor
            value={copy}
            onChange={(next) => update({ copy: next || undefined })}
            variant="multi"
            tenantId={tenantId}
            placeholder="Optional — one paragraph of context"
            ariaLabel="Intro copy"
          />
        </div>
      </InspectorGroup>

      <InspectorGroup
        title="Who shows up"
        info="Decide how this section fills — manually curate, or let it auto-fill from your roster."
      >
        <VisualChipGroup<SourceMode>
          value={sourceMode}
          onChange={switchMode}
          options={MODE_OPTIONS.map((opt) => ({
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
              label="Service slug"
              placeholder="e.g. models, hair-and-makeup"
              value={filterServiceSlug}
              onChange={(v) =>
                update({ filterServiceSlug: v || undefined })
              }
              hint="Exactly matches your service_category_slug. Check /admin/taxonomy for valid slugs."
            />
          ) : null}
          {sourceMode === "auto_by_destination" ? (
            <AutoFilterInput
              label="Destination slug"
              placeholder="e.g. tulum, los-cabos"
              value={filterDestinationSlug}
              onChange={(v) =>
                update({ filterDestinationSlug: v || undefined })
              }
              hint="Matches destinations on talent profiles."
            />
          ) : null}
          {sourceMode === "auto_featured_flag" ? (
            <SteadyStateNote text="Featured-flagged talent appear here in your chosen order. Nothing to configure." />
          ) : null}
          {sourceMode === "auto_recent" ? (
            <SteadyStateNote text="The most recently approved roster talent appear here. Updates as your roster grows." />
          ) : null}
        </div>
      </InspectorGroup>

      <InspectorGroup
        title="Footer link"
        info='Optional "See the full roster" style link under the grid.'
        collapsible
        storageKey="featured_talent:footer"
        defaultOpen={Boolean(footerCta)}
      >
        <CtaDuoEditor
          primary={footerCta}
          secondary={null}
          onChangePrimary={(next) => update({ footerCta: next ?? undefined })}
          onChangeSecondary={() => {}}
          secondaryAddLabel="(not used on this section)"
        />
      </InspectorGroup>

      <InspectorGroup
        title="Advanced"
        advanced
        collapsible
        storageKey="featured_talent:advanced"
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Maximum cards — {limit}</label>
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={limit}
            onChange={(e) => update({ limit: Number(e.target.value) })}
            className="w-full accent-zinc-900"
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>
            Desktop columns — {columnsDesktop}
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
            className="w-full accent-zinc-900"
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Layout</label>
          <VisualChipGroup<Variant>
            value={variant}
            onChange={(v) => update({ variant: v })}
            options={[
              {
                value: "grid",
                label: "Grid",
                preview: <GridPreview />,
              },
              {
                value: "carousel",
                label: "Carousel",
                preview: <CarouselPreview />,
              },
            ]}
            columns={2}
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
        <span className="text-[11px] text-zinc-600">
          {codes.length === 0
            ? "No one picked yet."
            : `${codes.length} of ${max} picked`}
          {missingCount > 0 ? (
            <span className="ml-1.5 text-rose-600">
              · {missingCount} off-roster
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className={KIT.primaryButton}
        >
          {codes.length === 0 ? "Pick talent" : "Edit selection"}
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
              className="h-12 animate-pulse rounded-lg border border-zinc-100 bg-zinc-50"
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
                <div className="truncate text-[13px] font-medium text-zinc-900">
                  {hit.displayName}
                </div>
                <div className="truncate text-[11px] text-zinc-500">
                  {hit.roleLabel ?? hit.profileCode}
                </div>
              </div>
            </InspectorItemRow>
          )}
        </DraggableList>
      ) : null}

      {!canPickMore ? (
        <p className={KIT.hint}>
          Maximum {max} picks. Remove someone to add another.
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
    <div className="rounded-md border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
      {text}
    </div>
  );
}

// ── mode previews ─────────────────────────────────────────────────────────

function ModePreview({ value }: { value: SourceMode }) {
  const common = "w-[68px] h-[36px]";
  if (value === "manual_pick") {
    return (
      <svg viewBox="0 0 68 36" className={common} aria-hidden>
        <rect x="3" y="6" width="13" height="24" rx="2" className="fill-zinc-400" />
        <rect x="19" y="6" width="13" height="24" rx="2" className="fill-zinc-900" />
        <rect x="35" y="6" width="13" height="24" rx="2" className="fill-zinc-400" />
        <rect x="51" y="6" width="13" height="24" rx="2" className="fill-zinc-900" />
        <circle cx="25.5" cy="33.5" r="1.5" className="fill-zinc-900" />
        <circle cx="57.5" cy="33.5" r="1.5" className="fill-zinc-900" />
      </svg>
    );
  }
  if (value === "auto_featured_flag") {
    return (
      <svg viewBox="0 0 68 36" className={common} aria-hidden>
        <rect x="3" y="6" width="13" height="24" rx="2" className="fill-zinc-300" />
        <rect x="19" y="6" width="13" height="24" rx="2" className="fill-zinc-300" />
        <rect x="35" y="6" width="13" height="24" rx="2" className="fill-zinc-300" />
        <rect x="51" y="6" width="13" height="24" rx="2" className="fill-zinc-300" />
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
        <rect x="3" y="3" width="62" height="5" rx="2" className="fill-zinc-900/80" />
        <rect x="3" y="12" width="13" height="20" rx="2" className="fill-zinc-300" />
        <rect x="19" y="12" width="13" height="20" rx="2" className="fill-zinc-300" />
        <rect x="35" y="12" width="13" height="20" rx="2" className="fill-zinc-300" />
        <rect x="51" y="12" width="13" height="20" rx="2" className="fill-zinc-300" />
      </svg>
    );
  }
  if (value === "auto_by_destination") {
    return (
      <svg viewBox="0 0 68 36" className={common} aria-hidden>
        <circle cx="20" cy="18" r="10" className="fill-none stroke-zinc-500" strokeWidth="1" />
        <path
          d="M20 10 v16 M12 18 h16"
          className="stroke-zinc-500"
          strokeWidth="1"
          fill="none"
        />
        <rect x="36" y="10" width="28" height="4" rx="1" className="fill-zinc-400" />
        <rect x="36" y="17" width="22" height="4" rx="1" className="fill-zinc-400" />
        <rect x="36" y="24" width="26" height="4" rx="1" className="fill-zinc-400" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 68 36" className={common} aria-hidden>
      <rect x="3" y="6" width="13" height="24" rx="2" className="fill-zinc-500" />
      <rect x="19" y="6" width="13" height="24" rx="2" className="fill-zinc-400" />
      <rect x="35" y="6" width="13" height="24" rx="2" className="fill-zinc-300" />
      <rect x="51" y="6" width="13" height="24" rx="2" className="fill-zinc-200" />
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
            className="fill-zinc-400"
          />
        )),
      )}
    </svg>
  );
}

function CarouselPreview() {
  return (
    <svg viewBox="0 0 68 36" className="w-[68px] h-[36px]" aria-hidden>
      <rect x="3" y="6" width="18" height="24" rx="2" className="fill-zinc-400" />
      <rect x="24" y="6" width="18" height="24" rx="2" className="fill-zinc-400" />
      <rect x="45" y="6" width="18" height="24" rx="2" className="fill-zinc-400" />
      <rect x="65" y="6" width="4" height="24" rx="1" className="fill-zinc-300" />
    </svg>
  );
}

function initials(s: string) {
  const trimmed = s.trim();
  if (!trimmed) return "·";
  const words = trimmed.split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]!.toUpperCase()).join("");
}
