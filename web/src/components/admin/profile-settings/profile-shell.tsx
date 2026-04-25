"use client";

import * as React from "react";
import {
  ArrowUpRight,
  Hash,
  LayoutGrid,
  LayoutList,
  ListOrdered,
  MoreHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import {
  DrawerActionBar,
  DrawerCallout,
  DrawerEmpty,
  DrawerGhostButton,
  DrawerPrimaryButton,
} from "@/components/admin/drawer/drawer-pieces";
import {
  DRAWER_INPUT_CLASS,
  DrawerItemRow,
  DrawerQActions,
  DrawerQField,
  DrawerQToggle,
  DrawerRowAction,
} from "@/components/admin/drawer/drawer-item-row";

/**
 * ProfileShell — Profile settings page client wrapper.
 *
 * Field groups and taxonomy kinds render as cards. Each card opens a
 * right-side drawer with the field rows / term rows. Quick-edit per row
 * mirrors the mockup's field-row pattern (label, key, required, visibility,
 * + filterable / searchable / AI-visible toggles).
 *
 * For deeper edits (field type changes, ordering, archiving), users follow
 * the "Open in full editor" link out to /admin/fields or /admin/taxonomy.
 */

export type ProfileFieldGroup = {
  id: string;
  slug: string;
  name_en: string;
};

export type ProfileFieldDef = {
  id: string;
  field_group_id: string | null;
  key: string;
  label_en: string;
  required_level: string | null;
  value_type: string | null;
  public_visible: boolean;
  profile_visible: boolean;
  card_visible: boolean;
  filterable: boolean;
  searchable: boolean;
  ai_visible: boolean;
};

export type ProfileTaxonomyTerm = {
  id: string;
  kind: string;
  slug: string;
  name_en: string;
};

const TAXONOMY_LABEL: Record<string, string> = {
  talent_type: "Profile types",
  tag: "Tags",
  skill: "Skills",
  industry: "Industries",
  event_type: "Event types",
  fit_label: "Fit labels",
  language: "Languages",
  location_country: "Countries (synced)",
  location_city: "Cities (synced)",
};

const TAXONOMY_ORDER = [
  "talent_type",
  "tag",
  "skill",
  "industry",
  "event_type",
  "fit_label",
  "language",
  "location_country",
  "location_city",
];

const SYNCED_KINDS = new Set(["location_country", "location_city"]);

function taxonomyIcon(kind: string): LucideIcon {
  if (SYNCED_KINDS.has(kind)) return Hash;
  if (kind === "language") return ListOrdered;
  return LayoutGrid;
}

type DrawerKind =
  | { kind: "field-group"; group: ProfileFieldGroup }
  | { kind: "vocab"; vocabKind: string };

export function ProfileShell({
  groups,
  fields,
  terms,
}: {
  groups: ProfileFieldGroup[];
  fields: ProfileFieldDef[];
  terms: ProfileTaxonomyTerm[];
}) {
  const [open, setOpen] = React.useState<DrawerKind | null>(null);

  const fieldsByGroup = React.useMemo(() => {
    const map = new Map<string, ProfileFieldDef[]>();
    for (const f of fields) {
      const gid = f.field_group_id ?? "ungrouped";
      const arr = map.get(gid) ?? [];
      arr.push(f);
      map.set(gid, arr);
    }
    return map;
  }, [fields]);

  const termsByKind = React.useMemo(() => {
    const map = new Map<string, ProfileTaxonomyTerm[]>();
    for (const t of terms) {
      const arr = map.get(t.kind) ?? [];
      arr.push(t);
      map.set(t.kind, arr);
    }
    return map;
  }, [terms]);

  const totalFields = fields.length;
  const totalRequired = fields.filter(
    (f) => f.required_level && f.required_level !== "none",
  ).length;
  const userKinds = TAXONOMY_ORDER.filter((k) => !SYNCED_KINDS.has(k));
  const userKindTerms = terms.filter((t) => !SYNCED_KINDS.has(t.kind));
  const syncedKindCount = TAXONOMY_ORDER.filter((k) =>
    SYNCED_KINDS.has(k),
  ).length;

  // Drawer chrome
  const drawerProps = (() => {
    if (!open) return null;
    if (open.kind === "field-group") {
      const groupFields = fieldsByGroup.get(open.group.id) ?? [];
      const reqCount = groupFields.filter(
        (f) => f.required_level && f.required_level !== "none",
      ).length;
      return {
        title: open.group.name_en,
        subtitle: `${groupFields.length} fields${reqCount > 0 ? ` · ${reqCount} required` : ""}`,
        icon: LayoutList as LucideIcon,
        wide: true,
        body: (
          <FieldGroupDrawerBody
            group={open.group}
            fields={groupFields}
          />
        ),
      };
    }
    const kindTerms = termsByKind.get(open.vocabKind) ?? [];
    const synced = SYNCED_KINDS.has(open.vocabKind);
    return {
      title: TAXONOMY_LABEL[open.vocabKind] ?? open.vocabKind,
      subtitle: `${kindTerms.length} term${kindTerms.length === 1 ? "" : "s"}${synced ? " · synced" : ""}`,
      icon: taxonomyIcon(open.vocabKind),
      wide: true,
      body: (
        <VocabKindDrawerBody
          kind={open.vocabKind}
          terms={kindTerms}
          synced={synced}
        />
      ),
    };
  })();

  return (
    <>
      {/* Profile structure — one tile per field group */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eae7db] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#5b5b63] before:size-1.5 before:rounded-full before:bg-current before:content-['']">
            Fields
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[17px] font-semibold tracking-tight text-foreground sm:text-lg">
              Profile structure
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {groups.length} groups · {totalFields} fields · {totalRequired} required
            </p>
          </div>
          <a
            href="/admin/fields#add-group"
            className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11.5px] font-semibold text-foreground shadow-sm transition-colors hover:border-foreground/40"
          >
            + New group
          </a>
          <div aria-hidden className="hidden h-px flex-1 bg-border/50 sm:block" />
        </div>
        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 bg-muted/[0.18] p-6 text-center text-sm text-muted-foreground">
            No field groups yet. Create one in Fields.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => {
              const counts = fieldsByGroup.get(g.id) ?? [];
              const reqCount = counts.filter(
                (f) => f.required_level && f.required_level !== "none",
              ).length;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setOpen({ kind: "field-group", group: g })}
                  aria-haspopup="dialog"
                  className="group relative block w-full rounded-2xl border border-border/60 bg-card/50 p-4 text-left shadow-sm transition-[border-color,box-shadow,background-color,transform] duration-200 hover:-translate-y-px hover:border-foreground/40 hover:bg-muted/30 hover:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-[9px]"
                      style={{
                        backgroundColor: "rgba(201, 162, 39, 0.12)",
                        color: "#8b6d1f",
                        boxShadow: "inset 0 0 0 1px rgba(201, 162, 39, 0.4)",
                      }}
                    >
                      <LayoutList className="size-[15px]" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-display text-[15px] font-semibold tracking-tight text-foreground">
                        {g.name_en}
                      </h3>
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {counts.length} field{counts.length === 1 ? "" : "s"}
                        {reqCount > 0 ? ` · ${reqCount} required` : ""}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Lists — one tile per taxonomy kind */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eae7db] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#5b5b63] before:size-1.5 before:rounded-full before:bg-current before:content-['']">
            Lists
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[17px] font-semibold tracking-tight text-foreground sm:text-lg">
              Tags, skills, industries — what fields choose from
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {userKinds.length} lists · {userKindTerms.length} terms (plus{" "}
              {syncedKindCount} synced from Locations)
            </p>
          </div>
          <a
            href="/admin/taxonomy"
            className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11.5px] font-semibold text-foreground shadow-sm transition-colors hover:border-foreground/40"
          >
            + New list
          </a>
          <div aria-hidden className="hidden h-px flex-1 bg-border/50 sm:block" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {TAXONOMY_ORDER.map((kind) => {
            const kindTerms = termsByKind.get(kind) ?? [];
            const synced = SYNCED_KINDS.has(kind);
            const Icon = taxonomyIcon(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setOpen({ kind: "vocab", vocabKind: kind })}
                aria-haspopup="dialog"
                className="group relative block w-full rounded-2xl border border-border/60 bg-card/50 p-4 text-left shadow-sm transition-[border-color,box-shadow,background-color,transform] duration-200 hover:-translate-y-px hover:border-foreground/40 hover:bg-muted/30 hover:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-[9px] text-foreground"
                    style={{
                      backgroundColor: "#f5f4ef",
                      boxShadow: "inset 0 0 0 1px rgba(24, 24, 27, 0.1)",
                    }}
                  >
                    <Icon className="size-[15px]" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-[15px] font-semibold tracking-tight text-foreground">
                      {TAXONOMY_LABEL[kind] ?? kind}
                    </h3>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                      {kindTerms.length} term{kindTerms.length === 1 ? "" : "s"}
                      {synced ? " · synced" : ""}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <DrawerShell
        open={drawerProps !== null}
        onOpenChange={(o) => {
          if (!o) setOpen(null);
        }}
        title={drawerProps?.title ?? ""}
        subtitle={drawerProps?.subtitle}
        icon={drawerProps?.icon ?? LayoutList}
        wide={drawerProps?.wide}
      >
        {drawerProps?.body}
      </DrawerShell>
    </>
  );
}

/* ─── Field group drawer body ─── */

function FieldGroupDrawerBody({
  group,
  fields,
}: {
  group: ProfileFieldGroup;
  fields: ProfileFieldDef[];
}) {
  const [search, setSearch] = React.useState("");
  const filtered = fields.filter((f) =>
    f.label_en.toLowerCase().includes(search.toLowerCase()) ||
    f.key.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <DrawerActionBar
        primary={
          <a
            href={`/admin/fields#group-${group.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            + Add field
          </a>
        }
        searchPlaceholder={`Search ${group.name_en.toLowerCase()}…`}
        searchValue={search}
        onSearchChange={setSearch}
      />
      <DrawerCallout>
        <strong>{group.name_en}</strong> — fields here render together as one
        section on the profile and registration form.
      </DrawerCallout>

      {filtered.length === 0 ? (
        <DrawerEmpty>
          {fields.length === 0
            ? "No fields in this group yet."
            : `No fields match "${search}".`}
        </DrawerEmpty>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((f) => (
            <DrawerItemRow
              key={f.id}
              title={f.label_en}
              slug={f.key}
              customStatus={
                f.required_level && f.required_level !== "none"
                  ? {
                      label: f.required_level,
                      tone:
                        f.required_level === "required"
                          ? "required"
                          : "recommended",
                    }
                  : { label: "optional", tone: "neutral" }
              }
              actions={
                <DrawerRowAction label="More">
                  <MoreHorizontal className="size-3.5" aria-hidden />
                </DrawerRowAction>
              }
              quickEdit={<FieldQuickEdit field={f} />}
            />
          ))}
        </div>
      )}

      <DrawerQActions>
        <a
          href={`/admin/fields#group-${group.id}`}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
        >
          Open full field editor
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </DrawerQActions>
    </div>
  );
}

function FieldQuickEdit({ field }: { field: ProfileFieldDef }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <DrawerQField label="Label">
          <input className={DRAWER_INPUT_CLASS} defaultValue={field.label_en} />
        </DrawerQField>
        <DrawerQField label="Key">
          <input
            className={`${DRAWER_INPUT_CLASS} font-mono`}
            defaultValue={field.key}
          />
        </DrawerQField>
        <DrawerQField label="Type">
          <select
            className={DRAWER_INPUT_CLASS}
            defaultValue={field.value_type ?? "text"}
          >
            <option value="text">Text</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="number">Number</option>
            <option value="select">Select</option>
            <option value="taxonomy_single">List (single)</option>
            <option value="taxonomy_multi">List (multi)</option>
            <option value="text_multi">Text (multi)</option>
          </select>
        </DrawerQField>
        <DrawerQField label="Required">
          <select
            className={DRAWER_INPUT_CLASS}
            defaultValue={field.required_level ?? "optional"}
          >
            <option value="optional">Optional</option>
            <option value="recommended">Recommended</option>
            <option value="required">Required</option>
          </select>
        </DrawerQField>
      </div>
      <div className="flex flex-wrap gap-3 pt-1">
        <DrawerQToggle
          label="Public on profile"
          defaultChecked={field.public_visible && field.profile_visible}
        />
        <DrawerQToggle
          label="Show on card"
          defaultChecked={field.card_visible}
        />
        <DrawerQToggle
          label="Filterable"
          defaultChecked={field.filterable}
        />
        <DrawerQToggle
          label="Searchable"
          defaultChecked={field.searchable}
        />
        <DrawerQToggle
          label="AI visible"
          defaultChecked={field.ai_visible}
        />
      </div>
      <DrawerQActions destructive={<DrawerGhostButton>Archive</DrawerGhostButton>}>
        <DrawerGhostButton>Cancel</DrawerGhostButton>
        <DrawerPrimaryButton>Save</DrawerPrimaryButton>
      </DrawerQActions>
    </div>
  );
}

/* ─── Vocab kind drawer body ─── */

function VocabKindDrawerBody({
  kind,
  terms,
  synced,
}: {
  kind: string;
  terms: ProfileTaxonomyTerm[];
  synced: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const filtered = terms.filter((t) =>
    t.name_en.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      {synced ? null : (
        <DrawerActionBar
          primary={
            <a
              href={`/admin/taxonomy?show=${kind}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90"
            >
              + Add term
            </a>
          }
          searchPlaceholder="Search terms…"
          searchValue={search}
          onSearchChange={setSearch}
        />
      )}
      <DrawerCallout>
        {synced ? (
          <>
            <strong>{TAXONOMY_LABEL[kind] ?? kind}</strong> is{" "}
            <strong>synced from Locations</strong> — read only here. Add
            countries / cities in <em>Directory → Locations</em>.
          </>
        ) : (
          <>
            <strong>{TAXONOMY_LABEL[kind] ?? kind}</strong> is used by fields
            in your profile schema. Renaming or archiving a term propagates to
            every profile using it.
          </>
        )}
      </DrawerCallout>

      {filtered.length === 0 ? (
        <DrawerEmpty>
          {terms.length === 0
            ? "No terms in this list yet."
            : `No terms match "${search}".`}
        </DrawerEmpty>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((t) => (
            <DrawerItemRow
              key={t.id}
              title={t.name_en}
              slug={t.slug}
              actions={
                <DrawerRowAction label="More">
                  <MoreHorizontal className="size-3.5" aria-hidden />
                </DrawerRowAction>
              }
              quickEdit={
                synced ? undefined : <TermQuickEdit term={t} />
              }
            />
          ))}
        </div>
      )}

      <DrawerQActions>
        <a
          href={`/admin/taxonomy?show=${kind}`}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
        >
          Open full list editor
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </DrawerQActions>
    </div>
  );
}

function TermQuickEdit({ term }: { term: ProfileTaxonomyTerm }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <DrawerQField label="Name">
          <input className={DRAWER_INPUT_CLASS} defaultValue={term.name_en} />
        </DrawerQField>
        <DrawerQField label="Slug">
          <input
            className={`${DRAWER_INPUT_CLASS} font-mono`}
            defaultValue={term.slug}
          />
        </DrawerQField>
      </div>
      <div className="flex flex-wrap gap-3 pt-1">
        <DrawerQToggle label="Show on home (browse by)" />
        <DrawerQToggle label="Show in directory filters" defaultChecked />
      </div>
      <DrawerQActions destructive={<DrawerGhostButton>Archive</DrawerGhostButton>}>
        <DrawerGhostButton>Cancel</DrawerGhostButton>
        <DrawerPrimaryButton>Save</DrawerPrimaryButton>
      </DrawerQActions>
    </div>
  );
}
