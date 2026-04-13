import { SlidersHorizontal } from "lucide-react";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { TalentPageHeader } from "@/components/talent/talent-dashboard-primitives";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { ADMIN_PAGE_STACK, ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import {
  SelectSettingForm,
  UpsertSettingForm,
  ToggleSettingForm,
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
    key: "dashboard_theme",
    label: "Dashboard theme",
    description: "Switch the internal dashboard between dark and light appearance.",
    type: "select",
    options: [
      { value: "dark", label: "Dark" },
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

  return (
    <div className={ADMIN_PAGE_STACK}>
      <TalentPageHeader
        icon={SlidersHorizontal}
        title="Settings"
        description="Site-wide configuration and feature toggles."
      />

      {!supabase && (
        <p className="text-sm text-muted-foreground">
          Supabase not configured — settings cannot be loaded or saved.
        </p>
      )}

      {/* Site settings */}
      <DashboardSectionCard
        title="Site settings"
        description="General configuration. Some stored values are not yet applied to live public copy or metadata."
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

      {/* Feature toggles */}
      <DashboardSectionCard
        title="Feature toggles"
        description="Enable or disable site features without a deployment."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="divide-y divide-border/40">
          {toggleSettings.map((s) => (
            <div key={s.key} className="py-4 first:pt-0 last:pb-0">
              <ToggleSettingForm
                settingKey={s.key}
                currentValue={settingsMap[s.key] ?? "false"}
                label={s.label}
                description={s.description}
              />
            </div>
          ))}
        </div>
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Dashboard appearance"
        description="Controls the dashboard color theme for admin, talent, and client pages."
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
        title="Public appearance"
        description="Controls the public website and auth screen color theme without affecting dashboard pages."
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

      {/* Raw key/value view */}
      {Object.keys(settingsMap).length > 0 && (
        <DashboardSectionCard
          title="All stored settings"
          description="Every key currently in the settings table."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <div className="overflow-x-auto rounded-2xl border border-border/45 bg-card/30">
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
        </DashboardSectionCard>
      )}
    </div>
  );
}
