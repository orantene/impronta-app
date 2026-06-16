import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { updatePlatformFieldGroupAction } from "../actions";
import { FieldGroupsReorderPanel } from "./field-groups-reorder-panel";

export const dynamic = "force-dynamic";

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  red: "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

type GroupRow = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  description_en: string | null;
  description_es: string | null;
  sort_order: number;
  is_active: boolean;
  field_count: number;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${HQ.borderSoft}`,
  borderRadius: 8,
  background: "#101014",
  color: HQ.ink,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: F,
};

function HqCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: F,
        marginBottom: 16,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color: HQ.ink }}>
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

function Input({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 5, color: HQ.inkMuted, fontSize: 11, fontWeight: 650 }}>
      {label}
      <input name={name} type={type} defaultValue={defaultValue ?? ""} style={inputStyle} />
    </label>
  );
}

function Textarea({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  return (
    <label style={{ display: "grid", gap: 5, color: HQ.inkMuted, fontSize: 11, fontWeight: 650 }}>
      {label}
      <textarea name={name} defaultValue={defaultValue ?? ""} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
    </label>
  );
}

function GroupForm({ group }: { group: GroupRow }) {
  return (
    <form action={updatePlatformFieldGroupAction} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="id" value={group.id} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, color: HQ.ink, fontWeight: 700 }}>{group.name_en}</div>
          <div style={{ fontSize: 11, color: HQ.inkDim, fontFamily: "ui-monospace, monospace" }}>
            {group.slug} · {group.field_count} field{group.field_count === 1 ? "" : "s"}
          </div>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, color: group.is_active ? HQ.green : HQ.red, fontSize: 12, fontWeight: 700 }}>
          <input type="checkbox" name="is_active" defaultChecked={group.is_active} />
          Active
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Input label="Slug" name="slug" defaultValue={group.slug} />
        <Input label="Sort order" name="sort_order" type="number" defaultValue={group.sort_order} />
        <Input label="Name EN" name="name_en" defaultValue={group.name_en} />
        <Input label="Name ES" name="name_es" defaultValue={group.name_es} />
        <Textarea label="Description EN" name="description_en" defaultValue={group.description_en} />
        <Textarea label="Description ES" name="description_es" defaultValue={group.description_es} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="submit"
          style={{
            border: "1px solid rgba(93,211,160,0.35)",
            background: "rgba(93,211,160,0.12)",
            color: HQ.green,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: F,
            cursor: "pointer",
          }}
        >
          Save group
        </button>
        <span style={{ color: HQ.inkDim, fontSize: 11.5 }}>
          Order controls the platform default; tenants can override supported ordering later.
        </span>
      </div>
    </form>
  );
}

async function loadGroups(): Promise<GroupRow[] | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  const [groupsR, fieldsR] = await Promise.all([
    sb
      .from("profile_field_groups")
      // name_en/name_es folded into name_i18n (WS3); description_* kept.
      .select("id, slug, name_i18n, description_en, description_es, sort_order, is_active")
      .order("sort_order", { ascending: true }),
    sb.from("profile_field_definitions").select("field_group_id"),
  ]);

  if (groupsR.error) return null;

  const counts = new Map<string, number>();
  for (const row of (fieldsR.data ?? []) as Array<{ field_group_id: string | null }>) {
    if (!row.field_group_id) continue;
    counts.set(row.field_group_id, (counts.get(row.field_group_id) ?? 0) + 1);
  }

  return ((groupsR.data ?? []) as Array<
    Omit<GroupRow, "field_count" | "name_en" | "name_es"> & {
      name_i18n: Record<string, string | null> | null;
    }
  >)
    .map((group) => ({
      id: group.id,
      slug: group.slug,
      name_en: group.name_i18n?.en ?? "",
      name_es: group.name_i18n?.es ?? null,
      description_en: group.description_en,
      description_es: group.description_es,
      sort_order: group.sort_order,
      is_active: group.is_active,
      field_count: counts.get(group.id) ?? 0,
    }))
    .sort((a, b) => a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en));
}

export default async function PlatformFieldGroupsBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const groups = await loadGroups();

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      <div style={{ marginBottom: 16, fontSize: 12 }}>
        <Link href="/platform/admin/catalog" style={{ color: HQ.inkMuted, textDecoration: "none" }}>
          ← Profile Fields
        </Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, margin: 0 }}>Field Groups Builder</h1>
        <div style={{ fontSize: 12.5, color: HQ.inkMuted, marginTop: 4 }}>
          Edit group order, bilingual names, descriptions, and lifecycle state for the Tulala profile engine.
        </div>
      </div>

      {params.saved && (
        <div style={{ border: "1px solid rgba(93,211,160,0.28)", background: "rgba(93,211,160,0.10)", color: HQ.green, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 14 }}>
          Saved group.
        </div>
      )}
      {params.error && (
        <div style={{ border: "1px solid rgba(243,103,114,0.32)", background: "rgba(243,103,114,0.10)", color: HQ.red, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 14 }}>
          {params.error}
        </div>
      )}

      {!groups ? (
        <HqCard title="Unavailable" subtitle="Could not load field groups.">
          <div style={{ color: HQ.inkMuted, fontSize: 12 }}>Retry shortly.</div>
        </HqCard>
      ) : (
        <>
          <HqCard
            title="Default group order"
            subtitle="Drag groups into the order the resolver should use before tenant overrides."
          >
            <FieldGroupsReorderPanel groups={groups} />
          </HqCard>

          {groups.map((group) => (
            <HqCard
              key={group.id}
              title={group.name_en}
              subtitle={`${group.slug} · ${group.field_count} field${group.field_count === 1 ? "" : "s"} · ${group.is_active ? "active" : "archived"}`}
            >
              <GroupForm group={group} />
            </HqCard>
          ))}
        </>
      )}
    </div>
  );
}
