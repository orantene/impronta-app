/**
 * WS1 — Platform Language Registry admin page.
 * /platform/admin/languages
 *
 * Lists all app_locales rows (including archived) and lets super_admin:
 *   - Add a new locale (code, labels, enabled flags, sort order, fallback)
 *   - Edit labels / sort order
 *   - Toggle enabled_admin / enabled_public
 *   - Set as default (exactly one default enforced by action)
 *   - Archive / restore
 */

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { AppLocaleRow } from "@/lib/language-settings/types";
import {
  createLocaleAction,
  updateLocaleAction,
  setDefaultLocaleAction,
  toggleLocaleEnabledAction,
  archiveLocaleAction,
  restoreLocaleAction,
} from "./actions";

export const dynamic = "force-dynamic";

// ─── Design tokens (same HQ palette as the rest of platform admin) ────────────

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#9BA8B7",
  red: "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

// ─── Data ─────────────────────────────────────────────────────────────────────

type LocaleRowFull = AppLocaleRow & { created_at: string; updated_at: string };

async function loadLocales(): Promise<LocaleRowFull[] | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from("app_locales")
    .select(
      "code, label_native, label_en, enabled_admin, enabled_public, is_default, sort_order, fallback_locale, archived_at, created_at, updated_at",
    )
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) return null;
  return (data ?? []) as LocaleRowFull[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
        {subtitle && (
          <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {children}
    </section>
  );
}

function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "green" | "amber" | "red" | "neutral";
}) {
  const color =
    tone === "green" ? HQ.green
    : tone === "amber" ? HQ.amber
    : tone === "red" ? HQ.red
    : HQ.inkDim;
  const bg =
    tone === "green" ? "rgba(93,211,160,0.10)"
    : tone === "amber" ? "rgba(155,168,183,0.15)"
    : tone === "red" ? "rgba(243,103,114,0.10)"
    : "rgba(255,255,255,0.05)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 7px",
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        fontFamily: F,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// Inline toggle form.
function ToggleForm({
  code,
  field,
  current,
  label,
}: {
  code: string;
  field: "enabled_admin" | "enabled_public";
  current: boolean;
  label: string;
}) {
  return (
    <form action={toggleLocaleEnabledAction} style={{ display: "inline" }}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={current ? "false" : "true"} />
      <button
        type="submit"
        title={current ? `Disable ${label}` : `Enable ${label}`}
        style={{
          background: current ? "rgba(93,211,160,0.12)" : "rgba(255,255,255,0.06)",
          border: `1px solid ${current ? "rgba(93,211,160,0.25)" : HQ.borderSoft}`,
          borderRadius: 6,
          color: current ? HQ.green : HQ.inkDim,
          fontSize: 11,
          fontWeight: 600,
          padding: "3px 8px",
          cursor: "pointer",
          fontFamily: F,
          letterSpacing: 0.3,
        }}
      >
        {current ? "ON" : "OFF"}
      </button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PlatformLanguagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    error?: string;
    code?: string;
    edit?: string;
    show_archived?: string;
  }>;
}) {
  const params = await searchParams;
  const locales = await loadLocales();
  const showArchived = params.show_archived === "1";
  const editCode = params.edit ?? null;

  const active = (locales ?? []).filter((l) => !l.archived_at);
  const archived = (locales ?? []).filter((l) => l.archived_at);
  const visible = showArchived ? locales ?? [] : active;
  const editLocale = editCode ? (locales ?? []).find((l) => l.code === editCode) ?? null : null;

  const savedMsg =
    params.saved === "create" ? `Locale "${params.code ?? ""}" created.`
    : params.saved === "update" ? `Locale "${params.code ?? ""}" updated.`
    : params.saved === "default" ? `"${params.code ?? ""}" is now the default locale.`
    : params.saved === "toggle" ? `Locale "${params.code ?? ""}" updated.`
    : params.saved === "archive" ? `Locale "${params.code ?? ""}" archived.`
    : params.saved === "restore" ? `Locale "${params.code ?? ""}" restored.`
    : null;

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{
            fontFamily: FD,
            fontSize: 22,
            fontWeight: 600,
            margin: 0,
            letterSpacing: -0.3,
          }}
        >
          Language Registry
        </h1>
        <p style={{ fontSize: 12.5, color: HQ.inkMuted, margin: "4px 0 0" }}>
          Platform-level locale catalog. Add a language here and it flows to agencies that support
          it. Exactly one locale must be marked default at all times.
        </p>
      </div>

      {/* Feedback banners */}
      {savedMsg && (
        <div
          style={{
            border: "1px solid rgba(93,211,160,0.28)",
            background: "rgba(93,211,160,0.10)",
            color: HQ.green,
            borderRadius: 10,
            padding: "9px 12px",
            fontSize: 12.5,
            marginBottom: 14,
            fontFamily: F,
          }}
        >
          {savedMsg}
        </div>
      )}
      {params.error && (
        <div
          style={{
            border: "1px solid rgba(243,103,114,0.32)",
            background: "rgba(243,103,114,0.10)",
            color: HQ.red,
            borderRadius: 10,
            padding: "9px 12px",
            fontSize: 12.5,
            marginBottom: 14,
            fontFamily: F,
          }}
        >
          {params.error}
        </div>
      )}

      {/* Stats */}
      <HqCard
        title="Overview"
        subtitle="Active locales drive URL routing, admin pickers, and translation surfaces."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
          {[
            { label: "Total", value: (locales ?? []).length, tone: HQ.ink },
            { label: "Active", value: active.length, tone: HQ.green },
            { label: "Archived", value: archived.length, tone: archived.length > 0 ? HQ.amber : HQ.inkDim },
            { label: "Public", value: active.filter((l) => l.enabled_public).length, tone: HQ.green },
            { label: "Admin only", value: active.filter((l) => l.enabled_admin && !l.enabled_public).length, tone: HQ.amber },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: HQ.cardSoft,
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 10,
                padding: "10px 14px",
                minWidth: 90,
              }}
            >
              <div style={{ fontSize: 11, color: HQ.inkMuted }}>{stat.label}</div>
              <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 650, color: stat.tone }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Archive toggle link */}
        <a
          href={showArchived ? "/platform/admin/languages" : "/platform/admin/languages?show_archived=1"}
          style={{ fontSize: 11.5, color: HQ.inkMuted, textDecoration: "underline" }}
        >
          {showArchived ? "Hide archived locales" : `Show archived (${archived.length})`}
        </a>
      </HqCard>

      {/* Locale table */}
      <HqCard
        title={`Locales (${visible.length})`}
        subtitle="Toggle enabled flags inline. Use Set default to promote a locale."
      >
        {!locales ? (
          <div style={{ color: HQ.red, fontSize: 12.5 }}>
            Could not load locales — service client unavailable.
          </div>
        ) : visible.length === 0 ? (
          <div style={{ color: HQ.inkMuted, fontSize: 12.5 }}>
            No locales yet. Add the first one below.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  {["Code", "Native", "English", "Sort", "Admin", "Public", "Default", "Fallback", ""].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "6px 8px",
                          color: HQ.inkMuted,
                          fontSize: 10.5,
                          fontWeight: 600,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          borderBottom: `1px solid ${HQ.borderSoft}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((locale) => {
                  const isArchived = !!locale.archived_at;
                  return (
                    <tr
                      key={locale.code}
                      style={{
                        borderBottom: `1px solid ${HQ.borderSoft}`,
                        opacity: isArchived ? 0.5 : 1,
                      }}
                    >
                      {/* Code */}
                      <td
                        style={{
                          padding: "10px 8px",
                          fontFamily: "ui-monospace, monospace",
                          fontWeight: 600,
                          color: HQ.ink,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {locale.code}
                        {locale.is_default && (
                          <span style={{ marginLeft: 6 }}>
                            <Badge label="default" tone="green" />
                          </span>
                        )}
                        {isArchived && (
                          <span style={{ marginLeft: 6 }}>
                            <Badge label="archived" tone="red" />
                          </span>
                        )}
                      </td>
                      {/* Native label */}
                      <td style={{ padding: "10px 8px", color: HQ.ink }}>{locale.label_native}</td>
                      {/* EN label */}
                      <td style={{ padding: "10px 8px", color: HQ.inkMuted }}>{locale.label_en}</td>
                      {/* Sort order */}
                      <td
                        style={{
                          padding: "10px 8px",
                          color: HQ.inkDim,
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {locale.sort_order}
                      </td>
                      {/* enabled_admin toggle */}
                      <td style={{ padding: "10px 8px" }}>
                        {isArchived ? (
                          <Badge label="OFF" tone="red" />
                        ) : (
                          <ToggleForm
                            code={locale.code}
                            field="enabled_admin"
                            current={locale.enabled_admin}
                            label="Admin"
                          />
                        )}
                      </td>
                      {/* enabled_public toggle */}
                      <td style={{ padding: "10px 8px" }}>
                        {isArchived ? (
                          <Badge label="OFF" tone="red" />
                        ) : (
                          <ToggleForm
                            code={locale.code}
                            field="enabled_public"
                            current={locale.enabled_public}
                            label="Public"
                          />
                        )}
                      </td>
                      {/* Set default */}
                      <td style={{ padding: "10px 8px" }}>
                        {locale.is_default ? (
                          <Badge label="Yes" tone="green" />
                        ) : isArchived ? (
                          <Badge label="No" tone="neutral" />
                        ) : (
                          <form action={setDefaultLocaleAction} style={{ display: "inline" }}>
                            <input type="hidden" name="code" value={locale.code} />
                            <button
                              type="submit"
                              style={{
                                background: "transparent",
                                border: `1px solid ${HQ.borderSoft}`,
                                borderRadius: 6,
                                color: HQ.inkMuted,
                                fontSize: 11,
                                padding: "3px 8px",
                                cursor: "pointer",
                                fontFamily: F,
                              }}
                            >
                              Set default
                            </button>
                          </form>
                        )}
                      </td>
                      {/* Fallback locale */}
                      <td
                        style={{
                          padding: "10px 8px",
                          color: HQ.inkDim,
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 11.5,
                        }}
                      >
                        {locale.fallback_locale ?? <span style={{ color: HQ.inkDim }}>—</span>}
                      </td>
                      {/* Actions */}
                      <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                        <a
                          href={`/platform/admin/languages?edit=${encodeURIComponent(locale.code)}`}
                          style={{
                            fontSize: 11,
                            color: HQ.inkMuted,
                            textDecoration: "none",
                            marginRight: 10,
                            padding: "3px 8px",
                            border: `1px solid ${HQ.borderSoft}`,
                            borderRadius: 6,
                          }}
                        >
                          Edit
                        </a>
                        {isArchived ? (
                          <form action={restoreLocaleAction} style={{ display: "inline" }}>
                            <input type="hidden" name="code" value={locale.code} />
                            <button
                              type="submit"
                              style={{
                                background: "transparent",
                                border: `1px solid ${HQ.borderSoft}`,
                                borderRadius: 6,
                                color: HQ.amber,
                                fontSize: 11,
                                padding: "3px 8px",
                                cursor: "pointer",
                                fontFamily: F,
                              }}
                            >
                              Restore
                            </button>
                          </form>
                        ) : locale.is_default ? (
                          <span style={{ color: HQ.inkDim, fontSize: 11 }}>—</span>
                        ) : (
                          <form action={archiveLocaleAction} style={{ display: "inline" }}>
                            <input type="hidden" name="code" value={locale.code} />
                            <button
                              type="submit"
                              style={{
                                background: "transparent",
                                border: `1px solid ${HQ.borderSoft}`,
                                borderRadius: 6,
                                color: HQ.red,
                                fontSize: 11,
                                padding: "3px 8px",
                                cursor: "pointer",
                                fontFamily: F,
                              }}
                            >
                              Archive
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </HqCard>

      {/* Edit form (shown when ?edit=<code>) */}
      {editLocale && (
        <HqCard
          title={`Edit locale: ${editLocale.code}`}
          subtitle="Updating labels or sort order. Toggle enabled flags from the table above."
        >
          <form action={updateLocaleAction}>
            <input type="hidden" name="code" value={editLocale.code} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
                Native label
                <input
                  name="label_native"
                  defaultValue={editLocale.label_native}
                  required
                  style={inputStyle}
                  placeholder="e.g. Français"
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
                English label
                <input
                  name="label_en"
                  defaultValue={editLocale.label_en}
                  required
                  style={inputStyle}
                  placeholder="e.g. French"
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
                Fallback locale code
                <input
                  name="fallback_locale"
                  defaultValue={editLocale.fallback_locale ?? ""}
                  style={inputStyle}
                  placeholder="e.g. en"
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
                Sort order
                <input
                  name="sort_order"
                  type="number"
                  defaultValue={editLocale.sort_order}
                  style={inputStyle}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="submit" style={primaryButtonStyle}>
                Save changes
              </button>
              <Link
                href="/platform/admin/languages"
                style={{ fontSize: 12.5, color: HQ.inkMuted, textDecoration: "none" }}
              >
                Cancel
              </Link>
            </div>
          </form>
        </HqCard>
      )}

      {/* Add new locale */}
      <HqCard
        title="Add language"
        subtitle="BCP-47 code (e.g. en, es, fr, pt-BR). Code is immutable once created — archive and recreate to correct a typo."
      >
        <form action={createLocaleAction}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
              BCP-47 code *
              <input
                name="code"
                required
                style={inputStyle}
                placeholder="e.g. fr"
                pattern="[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*"
                title="Valid BCP-47 tag: 2-8 alpha chars, optional subtags (e.g. pt-BR)"
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
              Native label *
              <input
                name="label_native"
                required
                style={inputStyle}
                placeholder="e.g. Français"
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
              English label *
              <input
                name="label_en"
                required
                style={inputStyle}
                placeholder="e.g. French"
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
              Fallback locale code
              <input
                name="fallback_locale"
                style={inputStyle}
                placeholder="e.g. en (leave blank for none)"
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
              Sort order
              <input
                name="sort_order"
                type="number"
                defaultValue={100}
                style={inputStyle}
              />
            </label>
          </div>

          {/* Enabled flags */}
          <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 12.5,
                color: HQ.inkMuted,
                cursor: "pointer",
              }}
            >
              <input type="checkbox" name="enabled_admin" defaultChecked style={{ accentColor: HQ.green }} />
              Enable for admin
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 12.5,
                color: HQ.inkMuted,
                cursor: "pointer",
              }}
            >
              <input type="checkbox" name="enabled_public" defaultChecked style={{ accentColor: HQ.green }} />
              Enable for public
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 12.5,
                color: HQ.inkMuted,
                cursor: "pointer",
              }}
            >
              <input type="checkbox" name="is_default" style={{ accentColor: HQ.green }} />
              Set as default (clears current default)
            </label>
          </div>

          <button type="submit" style={primaryButtonStyle}>
            Add language
          </button>
        </form>
      </HqCard>

      {/* Rules summary */}
      <HqCard
        title="Rules"
        subtitle="These constraints are enforced server-side on every write."
      >
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 12.5,
            color: HQ.inkMuted,
            lineHeight: 1.8,
          }}
        >
          <li>
            <strong style={{ color: HQ.ink }}>BCP-47 codes only.</strong> e.g.{" "}
            <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>en</code>,{" "}
            <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>fr</code>,{" "}
            <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>pt-BR</code>.
          </li>
          <li>
            <strong style={{ color: HQ.ink }}>Exactly one default</strong> at all times. Setting a
            new default atomically clears the old one.
          </li>
          <li>
            <strong style={{ color: HQ.ink }}>Default cannot be archived or disabled.</strong> Promote
            another locale first.
          </li>
          <li>
            <strong style={{ color: HQ.ink }}>Code is immutable.</strong> Archive and recreate to fix
            a wrong code.
          </li>
          <li>
            Setting a locale as default automatically enables it for both admin and public.
          </li>
        </ul>
      </HqCard>
    </div>
  );
}

// ─── Shared input/button styles ───────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#F5F2EB",
  fontFamily: '"Inter", system-ui, sans-serif',
  fontSize: 13,
  padding: "8px 10px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const primaryButtonStyle: React.CSSProperties = {
  background: "rgba(93,211,160,0.15)",
  border: "1px solid rgba(93,211,160,0.30)",
  borderRadius: 8,
  color: "#5DD3A0",
  fontFamily: '"Inter", system-ui, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 16px",
  cursor: "pointer",
  letterSpacing: 0.2,
};
