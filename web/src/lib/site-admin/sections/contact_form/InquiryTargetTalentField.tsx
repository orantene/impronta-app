"use client";

/**
 * FORMS-2b — friendly talent picker for the contact_form section's inquiry
 * routing target.
 *
 * FORMS-2 added `routingMode: "inquiry"` so a submission funnels into the
 * SHARED inquiry engine, attributed to `inquiryTargetTalentId`. The generic
 * ZodSchemaForm rendered that field as a RAW UUID text input — an operator had
 * to open another tab, find the talent, copy a uuid, and paste it. This widget
 * replaces that with the SAME roster picker the featured_talent inspector uses
 * (search + thumbnail grid, by name), persisting the selected talent's id.
 *
 * Reuse, not reinvention:
 *   - the modal is `TalentPicker` (kit) — the homepage featured-talent picker
 *   - search/resolve is `searchAgencyTalentAction` / resolve actions — the
 *     same tenant-roster-scoped server search engine
 * The only new surface is the id↔code translation (the picker speaks codes,
 * this schema field stores a single uuid), handled by the pure helpers in
 * `./inquiry-target`.
 *
 * The widget renders ONLY the inquiry-target control. routingMode itself stays
 * the generic enum chip row (unchanged), and the parent Editor only mounts this
 * when routingMode === "inquiry", so internal-mode forms are untouched.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TalentPicker } from "@/components/edit-chrome/inspectors/kit";
import { KIT } from "@/components/edit-chrome/inspectors/kit";
import {
  resolveTalentByCodesAction,
  resolveTalentByIdsAction,
  type TalentSearchHit,
} from "@/lib/site-admin/edit-mode/talent-search";
import {
  buildIdentityMaps,
  pickTargetIdFromConfirmedCodes,
  seedCodesForTargetId,
} from "./inquiry-target";

interface Props {
  /** Current persisted target talent UUID (or undefined for none). */
  value: string | undefined;
  /** Persist the new target id (undefined clears the target). */
  onChange: (next: string | undefined) => void;
}

export function InquiryTargetTalentField({ value, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resolved, setResolved] = useState<TalentSearchHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session-accumulated identity map. We learn code↔id pairs from every hit we
  // resolve (current target) or confirm (picker result) so we can translate in
  // both directions without changing the shared picker's code-only contract.
  const hitsRef = useRef<Map<string, TalentSearchHit>>(new Map());
  const [maps, setMaps] = useState(() =>
    buildIdentityMaps([] as TalentSearchHit[]),
  );

  const learnHits = useCallback((hits: TalentSearchHit[]) => {
    for (const h of hits) hitsRef.current.set(h.id, h);
    setMaps(buildIdentityMaps([...hitsRef.current.values()]));
  }, []);

  // Hydrate the persisted id → display (name + thumbnail) and learn its code.
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setResolved(null);
      setError(null);
      return;
    }
    setLoading(true);
    (async () => {
      const res = await resolveTalentByIdsAction({ ids: [value] });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setResolved(null);
        return;
      }
      setError(null);
      const hit = res.hits[0] ?? null;
      setResolved(hit);
      if (hit) learnHits([hit]);
    })();
    return () => {
      cancelled = true;
    };
  }, [value, learnHits]);

  // Codes to seed the picker with (the current target, when known).
  const initialCodes = useMemo(
    () => seedCodesForTargetId(value, maps.byId),
    [value, maps.byId],
  );

  // The picker emits the confirmed code(s); translate the single pick → id and
  // persist. If the confirmed code isn't yet in our session map, resolve it
  // (code → id) so we never persist undefined for a valid pick.
  const handleConfirm = useCallback(
    async (codes: string[]) => {
      setPickerOpen(false);
      const code = codes.find((c) => c && c.trim().length > 0);
      if (!code) {
        // Cleared the selection — talent-less "message the agency" inquiry.
        onChange(undefined);
        return;
      }
      let byCode = maps.byCode;
      if (!byCode.has(code)) {
        const res = await resolveTalentByCodesAction({ codes: [code] });
        if (res.ok && res.hits.length > 0) {
          learnHits(res.hits);
          byCode = buildIdentityMaps([
            ...hitsRef.current.values(),
          ]).byCode;
        }
      }
      const id = pickTargetIdFromConfirmedCodes([code], byCode);
      onChange(id);
    },
    [maps.byCode, onChange, learnHits],
  );

  return (
    <div className={KIT.field}>
      <span className={KIT.label}>Route inquiries to talent</span>
      <p className={KIT.hint}>
        Pick the roster talent this form books for. Submissions become real
        inquiries attributed to them. Leave empty to send a general
        &ldquo;message the agency&rdquo; inquiry instead.
      </p>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="h-12 animate-pulse rounded-lg border border-stone-100 bg-stone-50" />
      ) : resolved ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2.5 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-stone-200 text-[11px] font-semibold uppercase tracking-wider text-stone-600">
            {resolved.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolved.thumbnailUrl}
                alt={resolved.displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              initialsOf(resolved.displayName)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-stone-900">
              {resolved.displayName}
            </div>
            <div className="truncate text-[11px] text-stone-500">
              {resolved.roleLabel ?? resolved.profileCode}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="rounded-md border border-[#e5e0d5] bg-white px-2 py-1 text-[11px] font-medium text-stone-600 transition hover:border-stone-300 hover:text-rose-600"
          >
            Clear
          </button>
        </div>
      ) : value ? (
        // We have an id but couldn't resolve it (off-roster / changed roster).
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
          <span className="min-w-0 truncate text-[11px] text-amber-800">
            Saved talent is no longer on this roster.
          </span>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 transition hover:bg-amber-100"
          >
            Clear
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className={`${KIT.primaryButton} self-start`}
      >
        {resolved || value ? "Change talent" : "Pick talent"}
      </button>

      <TalentPicker
        open={pickerOpen}
        initialCodes={initialCodes}
        maxCount={1}
        onConfirm={handleConfirm}
        onCancel={() => setPickerOpen(false)}
      />
    </div>
  );
}

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "·";
  const words = trimmed.split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]!.toUpperCase()).join("");
}
