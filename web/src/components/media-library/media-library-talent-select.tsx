"use client";

/**
 * media-library-talent-select.tsx — "filter by talent".
 *
 * The library already had an OWNERSHIP filter with a "Talent" chip, and that
 * chip answers a different question: it means "anything a talent owns", not
 * "Ana's photos". A workspace admin looking for one model's images had to
 * scroll a 1,900-asset library. This is the missing axis, and it is a
 * SERVER-side filter (`?talentId=`) like every other one here.
 *
 * It is a filtered list, not a `<select>`: a roster runs to hundreds of names,
 * and typing three letters must be the fast path. No avatars — `talent_profiles`
 * has no avatar column, so an avatar would cost a per-talent media lookup for
 * decoration; the profile code is the free disambiguator between two people
 * with the same display name.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, User } from "lucide-react";

import { FIELD_KIT } from "../edit-chrome/inspectors/field-kit/tokens";
import type { MediaLibraryWireTalent } from "@/lib/media/library-wire";
import { LIBRARY_FOCUS_CLASS, LibraryPopover } from "./media-library-kit";

export type TalentSelectLabels = {
  /** Button label when nothing is picked, and the "clear" row. */
  all: string;
  /** Accessible name of the control. */
  label: string;
  searchPlaceholder: string;
  noMatches: string;
};

export function MediaLibraryTalentSelect({
  talents,
  value,
  labels,
  onChange,
}: {
  talents: ReadonlyArray<MediaLibraryWireTalent>;
  value: string | null;
  labels: TalentSelectLabels;
  onChange: (talentProfileId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open]);

  const selected = talents.find((talent) => talent.id === value) ?? null;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return talents;
    return talents.filter(
      (talent) =>
        talent.name.toLowerCase().includes(needle) ||
        (talent.profileCode ?? "").toLowerCase().includes(needle),
    );
  }, [query, talents]);

  // Nothing to filter by ⇒ no control. A workspace with an empty roster gets a
  // toolbar with one less dead affordance in it, not a select of nothing.
  if (talents.length === 0) return null;

  const active = !!selected;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labels.label}
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex max-w-[190px] shrink-0 items-center gap-1.5 border transition-colors ${LIBRARY_FOCUS_CLASS}`}
        style={{
          background: active ? FIELD_KIT.accentFill : FIELD_KIT.surface,
          borderColor: active ? FIELD_KIT.accent : FIELD_KIT.border,
          color: active ? FIELD_KIT.accent : FIELD_KIT.muted,
          borderRadius: FIELD_KIT.radius.chip,
          fontSize: FIELD_KIT.font.label,
          fontWeight: FIELD_KIT.weight.label,
          height: FIELD_KIT.size.control,
          padding: "0 8px",
        }}
        data-media-talent-filter
      >
        <User className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{selected ? selected.name : labels.all}</span>
        <ChevronDown className="size-3 shrink-0" aria-hidden />
      </button>

      <LibraryPopover open={open} onClose={() => setOpen(false)} label={labels.label}>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className={`mb-1 w-full border px-2 ${LIBRARY_FOCUS_CLASS}`}
          style={{
            height: FIELD_KIT.size.control,
            borderRadius: FIELD_KIT.radius.chip,
            borderColor: FIELD_KIT.border,
            background: FIELD_KIT.surface,
            color: FIELD_KIT.ink,
            fontSize: FIELD_KIT.font.value,
          }}
        />
        <ul className="grid gap-0.5">
          <li>
            <TalentRow
              name={labels.all}
              code={null}
              selected={!selected}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            />
          </li>
          {matches.map((talent) => (
            <li key={talent.id}>
              <TalentRow
                name={talent.name}
                code={talent.profileCode}
                selected={talent.id === value}
                onClick={() => {
                  onChange(talent.id);
                  setOpen(false);
                }}
              />
            </li>
          ))}
          {matches.length === 0 ? (
            <li
              className="px-2 py-3 text-center"
              style={{ fontSize: FIELD_KIT.font.label, color: FIELD_KIT.muted }}
            >
              {labels.noMatches}
            </li>
          ) : null}
        </ul>
      </LibraryPopover>
    </div>
  );
}

function TalentRow({
  name,
  code,
  selected,
  onClick,
}: {
  name: string;
  code: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-[color:var(--media-library-hover)] ${LIBRARY_FOCUS_CLASS}`}
      style={{
        borderRadius: FIELD_KIT.radius.chip,
        background: selected ? FIELD_KIT.accentFill : "transparent",
      }}
    >
      <span className="min-w-0 flex-1">
        <span
          className="block truncate"
          style={{
            fontSize: FIELD_KIT.font.value,
            fontWeight: FIELD_KIT.weight.label,
            color: selected ? FIELD_KIT.accent : FIELD_KIT.ink,
          }}
        >
          {name}
        </span>
        {code ? (
          <span
            className="block truncate"
            style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.mutedSoft }}
          >
            {code}
          </span>
        ) : null}
      </span>
      {selected ? (
        <Check className="size-3.5 shrink-0" style={{ color: FIELD_KIT.accent }} />
      ) : null}
    </button>
  );
}
