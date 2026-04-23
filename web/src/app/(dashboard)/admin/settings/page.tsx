import Link from "next/link";
import { Languages, SlidersHorizontal, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_TH,
} from "@/lib/dashboard-shell-classes";
import {
  SelectSettingForm,
  ToggleSettingTableRow,
  UpsertSettingForm,
} from "./settings-forms";

type Setting = { key: string; value: unknown };

function settingToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";
  return JSON.stringify(value);
}

const KNOWN_SETTINGS: Array<{
  key: string;
  label: string;
  description?: string;
  type: "text" | "toggle" | "select";
  options?: Array<{ value: string; label: string }>;
}> = [
  {
    key: "site_name",
    label: "Stored site name",
    description: "Saved for future CMS wiring. It does not yet update live metadata.",
    type: "text",
  },
  {
    key: "site_tagline",
    label: "Stored site tagline",
    description: "Saved for future homepage wiring. It is not yet shown on the live public site.",
    type: "text",
  },
  {
    key: "contact_email",
    label: "Stored agency contact email",
    description: "Saved for agency operations and future public contact forms.",
    type: "text",
  },
  {
    key: "agency_whatsapp_number",
    label: "Agency WhatsApp",
    description:
      "Phone number used for inquiry WhatsApp drafts. Store digits with country code.",
    type: "text",
  },
  {
    key: "directory_public",
    label: "Directory public",
    description: "Allow unauthenticated visitors to browse the talent directory.",
    type: "toggle",
  },
  {
    key: "inquiries_open",
    label: "Inquiries open",
    description: "Allow clients to submit new booking inquiries.",
    type: "toggle",
  },
  {
    key: "inquiry_engine_v2_enabled",
    label: "Inquiry engine v2 (Phase 2)",
    description:
      "When on, new inquiries created through v2 paths use the workflow engine (participants, offers, messaging).",
    type: "toggle",
  },
  {
    key: "default_coordinator_user_id",
    label: "Default coordinator (agency)",
    description: "Profile UUID for auto-assigned coordinator on agency-sourced inquiries.",
    type: "text",
  },
  {
    key: "platform_coordinator_user_id",
    label: "Platform coordinator (hub)",
    description: "Profile UUID used when source_type is hub.",
    type: "text",
  },
  {
    key: "coordinator_timeout_hours",
    label: "Coordinator acceptance timeout (hours)",
    description: "How long to wait before timing out a pending coordinator assignment.",
    type: "text",
  },
  {
    key: "inquiry_expiry_hours",
    label: "Default inquiry expiry window (hours)",
    description: "Used when setting expires_at on new inquiries (app logic).",
    type: "text",
  },
  {
    key: "dashboard_theme",
    label: "Dashboard theme",
    description: "Switch the internal dashboard between light and dark appearance.",
    type: "select",
    options: [
      { value: "light", label: "Light" },
    ],
  },
  {
    key: "site_theme",
    label: "Public site theme",
    description: "Switch the public site and auth screens between dark and light appearance.",
    type: "select",
    options: [
      { value: "dark", label: "Dark" },
      { value: "light", label: "Light" },
    ],
  },
  {
    key: "public_font_preset",
    label: "Public typography",
    description:
      "Font pairing for the public site, directory, and auth screens. Admin uses a separate system font stack.",
    type: "select",
    options: [
      { value: "impronta", label: "Impronta — Raleway + Cinzel" },
      { value: "editorial", label: "Editorial — Inter + Playfair Display" },
    ],
  },
];

export default async function AdminSettingsPage() {
  const supabase = await getCachedServerSupabase();

  let settingsMap: Record<string, string> = {};

  if (supabase) {
    const { data, error } = await supabase
      .from("settings")
      .select("key, value");

    if (!error && data) {
      settingsMap = Object.fromEntries(
        (data as Setting[]).map((s) => [s.key, settingToString(s.value)]),
      );
    }
  }

  const textSettings = KNOWN_SETTINGS.filter((s) => s.type === "text");
  const toggleSettings = KNOWN_SETTINGS.filter((s) => s.type === "toggle");
  const selectSettings = KNOWN_SETTINGS.filter((s) => s.type === "select");
  const dashboardAppearanceSettings = selectSettings.filter(
    (s) => s.key === "dashboard_theme",
  );
  const publicAppearanceSettings = selectSettings.filter(
    (s) => s.key === "site_theme",
  );
  const publicTypographySettings = selectSettings.filter(
    (s) => s.key === "public_font_preset",
  );

  const settingsGroupNav = [
    { id: "workspace", label: "Workspace" },
    { id: "features", label: "Features" },
    { id: "appearance", label: "Appearance" },
    { id: "integrations", label: "Integrations" },
    { id: "advanced", label: "Advanced" },
  ];

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={SlidersHorizontal}
        title="Settings"
        description="Workspace configuration, feature flags, appearance, and integrations. Rarely changed — the daily operator surfaces live under Home, Pipeline, Roster, and Site."
      />

      {/* Anchor nav — keeps the page scannable and signals this surface is secondary. */}
      <nav
        aria-label="Settings sections"
        className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/50 bg-card/30 p-1.5 text-xs"
      >
        {settingsGroupNav.map((g) => (
          <a
            key={g.id}
            href={`#${g.id}`}
            className={cn(
              "rounded-xl px-3 py-1.5 font-medium text-muted-foreground",
              "transition-colors hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {g.label}
          </a>
        ))}
      </nav>

      {!supabase && (
        <p className="text-sm text-muted-foreground">
          Supabase not configured — settings cannot be loaded or saved.
        </p>
      )}

      {/* ── Workspace ─────────────────────────────────────────────────── */}
      <section id="workspace" className="space-y-4 scroll-mt-24">
        <header className="space-y-1">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Workspace
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Agency details
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Stored agency identifiers used across the dashboard. Some values
            are saved for future public-site wiring and are not yet applied
            to live metadata.
          </p>
        </header>
        <DashboardSectionCard
          title="Agency details"
          description="Name, tagline, contact email, WhatsApp for inquiry drafts."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <div className="space-y-6">
            {textSettings.map((s) => (
              <UpsertSettingForm
                key={s.key}
                settingKey={s.key}
                currentValue={settingsMap[s.key] ?? ""}
                label={s.label}
                description={s.description}
              />
            ))}
          </div>
        </DashboardSectionCard>
      </section>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section id="features" className="space-y-4 scroll-mt-24">
        <header className="space-y-1">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Features
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Feature flags
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Enable or disable site features without a deployment. Each row
            is one flag in the database.
          </p>
        </header>
        <DashboardSectionCard
          title="Toggles"
          description="Each row is a flag. Flip once; lives until next explicit change."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <div className="overflow-hidden rounded-xl border border-border/50 bg-card/25 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[min(100%,520px)] text-sm">
                <caption className="sr-only">
                  Site feature flags. First column describes the feature;
                  second column is an on-off switch.
                </caption>
                <thead className={ADMIN_TABLE_HEAD}>
                  <tr className="border-b border-border/45 text-left">
                    <th scope="col" className={ADMIN_TABLE_TH}>
                      Feature
                    </th>
                    <th scope="col" className={cn(ADMIN_TABLE_TH, "w-[10rem] text-right")}>
                      Enabled
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {toggleSettings.map((s) => (
                    <ToggleSettingTableRow
                      key={s.key}
                      settingKey={s.key}
                      currentValue={settingsMap[s.key] ?? "false"}
                      label={s.label}
                      description={s.description}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DashboardSectionCard>
      </section>

      {/* ── Appearance ────────────────────────────────────────────────── */}
      <section id="appearance" className="space-y-4 scroll-mt-24">
        <header className="space-y-1">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Appearance
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Themes & typography
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Dashboard theme controls the internal admin chrome. Public
            theme + typography control the storefront only — nothing
            here touches the section composer output.
          </p>
        </header>
        <div className="grid gap-4 lg:grid-cols-3">
          <DashboardSectionCard
            title="Dashboard theme"
            description="Admin / talent / client pages."
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <div className="space-y-6">
              {dashboardAppearanceSettings.map((s) => (
                <SelectSettingForm
                  key={s.key}
                  settingKey={s.key}
                  currentValue={settingsMap[s.key] ?? "dark"}
                  label={s.label}
                  description={s.description}
                  options={s.options ?? []}
                />
              ))}
            </div>
          </DashboardSectionCard>
          <DashboardSectionCard
            title="Public theme"
            description="Storefront + auth screens."
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <div className="space-y-6">
              {publicAppearanceSettings.map((s) => (
                <SelectSettingForm
                  key={s.key}
                  settingKey={s.key}
                  currentValue={settingsMap[s.key] ?? "dark"}
                  label={s.label}
                  description={s.description}
                  options={s.options ?? []}
                />
              ))}
            </div>
          </DashboardSectionCard>
          <DashboardSectionCard
            title="Public typography"
            description="Font pairing, public surfaces only."
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <div className="space-y-6">
              {publicTypographySettings.map((s) => (
                <SelectSettingForm
                  key={s.key}
                  settingKey={s.key}
                  currentValue={settingsMap[s.key] ?? "impronta"}
                  label={s.label}
                  description={s.description}
                  options={s.options ?? []}
                />
              ))}
            </div>
          </DashboardSectionCard>
        </div>
      </section>

      {/* ── Integrations ──────────────────────────────────────────────── */}
      <section id="integrations" className="space-y-4 scroll-mt-24">
        <header className="space-y-1">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Integrations
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Connected workspaces
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each of these opens its own deeper settings surface. They are
            linked from here to keep the top-level admin calm.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/settings/languages"
            className={cn(
              "group flex items-start gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 shadow-sm",
              "transition-[border-color,background-color,box-shadow] duration-200",
              "hover:border-[var(--impronta-gold-border)]/55 hover:bg-[var(--impronta-gold)]/[0.03] hover:shadow-md",
            )}
          >
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)]">
              <Languages className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Languages & locales</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Add locales, defaults, public visibility, translation inventory.
              </p>
            </div>
          </Link>
          <Link
            href="/admin/ai-workspace/settings"
            className={cn(
              "group flex items-start gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 shadow-sm",
              "transition-[border-color,background-color,box-shadow] duration-200",
              "hover:border-[var(--impronta-gold-border)]/55 hover:bg-[var(--impronta-gold)]/[0.03] hover:shadow-md",
            )}
          >
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)]">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">AI workspace</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Chat provider, hybrid search, embeddings, quality v2 toggles.
              </p>
            </div>
          </Link>
          <Link
            href="/admin/site-settings/content/posts"
            className={cn(
              "group flex items-start gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 shadow-sm",
              "transition-[border-color,background-color,box-shadow] duration-200",
              "hover:border-[var(--impronta-gold-border)]/55 hover:bg-[var(--impronta-gold)]/[0.03] hover:shadow-md",
            )}
          >
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)]">
              <SlidersHorizontal className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Content & nav</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Posts, header/footer links — edited from the Site area.
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* ── Advanced (raw k/v dump, collapsed) ────────────────────────── */}
      {Object.keys(settingsMap).length > 0 && (
        <section id="advanced" className="space-y-4 scroll-mt-24">
          <header className="space-y-1">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Advanced
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Raw settings
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Read-only dump of every key in the settings table. Collapsed by
              default — open only when debugging.
            </p>
          </header>
          <details className="group rounded-2xl border border-border/45 bg-card/30 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
              <span>
                {Object.keys(settingsMap).length} stored key
                {Object.keys(settingsMap).length === 1 ? "" : "s"}
              </span>
              <span className="text-[11px] text-muted-foreground/80 transition-colors group-open:text-foreground">
                Expand ▾
              </span>
            </summary>
            <div className="overflow-x-auto border-t border-border/40">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-b from-muted/30 to-transparent">
                  <tr className="border-b border-border/40 text-left">
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Key
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/25">
                  {Object.entries(settingsMap).map(([k, v]) => (
                    <tr key={k} className="hover:bg-[var(--impronta-gold)]/[0.04]">
                      <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">{k}</td>
                      <td className="px-4 py-2.5 text-sm">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
