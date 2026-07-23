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
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

export const dynamic = "force-dynamic";

type Translate = (key: string) => string;

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
  t,
}: {
  code: string;
  field: "enabled_admin" | "enabled_public";
  current: boolean;
  label: string;
  t: Translate;
}) {
  return (
    <form action={toggleLocaleEnabledAction} style={{ display: "inline" }}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={current ? "false" : "true"} />
      <button
        type="submit"
        title={
          current
            ? interpolate(t("dashboard.platform.languages.disableTitle"), { label })
            : interpolate(t("dashboard.platform.languages.enableTitle"), { label })
        }
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
        {current
          ? t("dashboard.platform.languages.badgeOn")
          : t("dashboard.platform.languages.badgeOff")}
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
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const params = await searchParams;
  const locales = await loadLocales();
  const showArchived = params.show_archived === "1";
  const editCode = params.edit ?? null;

  const active = (locales ?? []).filter((l) => !l.archived_at);
  const archived = (locales ?? []).filter((l) => l.archived_at);
  const visible = showArchived ? locales ?? [] : active;
  const editLocale = editCode ? (locales ?? []).find((l) => l.code === editCode) ?? null : null;

  const code = params.code ?? "";
  const savedMsg =
    params.saved === "create" ? interpolate(t("dashboard.platform.languages.savedCreate"), { code })
    : params.saved === "update" ? interpolate(t("dashboard.platform.languages.savedUpdate"), { code })
    : params.saved === "default" ? interpolate(t("dashboard.platform.languages.savedDefault"), { code })
    : params.saved === "toggle" ? interpolate(t("dashboard.platform.languages.savedUpdate"), { code })
    : params.saved === "archive" ? interpolate(t("dashboard.platform.languages.savedArchive"), { code })
    : params.saved === "restore" ? interpolate(t("dashboard.platform.languages.savedRestore"), { code })
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
          {t("dashboard.platform.languages.title")}
        </h1>
        <p style={{ fontSize: 12.5, color: HQ.inkMuted, margin: "4px 0 0" }}>
          {t("dashboard.platform.languages.subtitle")}
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
        title={t("dashboard.platform.languages.overviewTitle")}
        subtitle={t("dashboard.platform.languages.overviewSubtitle")}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
          {[
            { label: t("dashboard.platform.languages.statTotal"), value: (locales ?? []).length, tone: HQ.ink },
            { label: t("dashboard.platform.languages.statActive"), value: active.length, tone: HQ.green },
            { label: t("dashboard.platform.languages.statArchived"), value: archived.length, tone: archived.length > 0 ? HQ.amber : HQ.inkDim },
            { label: t("dashboard.platform.languages.statPublic"), value: active.filter((l) => l.enabled_public).length, tone: HQ.green },
            { label: t("dashboard.platform.languages.statAdminOnly"), value: active.filter((l) => l.enabled_admin && !l.enabled_public).length, tone: HQ.amber },
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
          {showArchived
            ? t("dashboard.platform.languages.hideArchived")
            : interpolate(t("dashboard.platform.languages.showArchived"), { count: archived.length })}
        </a>
      </HqCard>

      {/* Locale table */}
      <HqCard
        title={interpolate(t("dashboard.platform.languages.localesTitle"), { count: visible.length })}
        subtitle={t("dashboard.platform.languages.localesSubtitle")}
      >
        {!locales ? (
          <div style={{ color: HQ.red, fontSize: 12.5 }}>
            {t("dashboard.platform.languages.loadError")}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ color: HQ.inkMuted, fontSize: 12.5 }}>
            {t("dashboard.platform.languages.localesEmpty")}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  {[
                    t("dashboard.platform.languages.colCode"),
                    t("dashboard.platform.languages.colNative"),
                    t("dashboard.platform.languages.colEnglish"),
                    t("dashboard.platform.languages.colSort"),
                    t("dashboard.platform.languages.colAdmin"),
                    t("dashboard.platform.languages.colPublic"),
                    t("dashboard.platform.languages.colDefault"),
                    t("dashboard.platform.languages.colFallback"),
                    "",
                  ].map((h) => (
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
                            <Badge label={t("dashboard.platform.languages.badgeDefault")} tone="green" />
                          </span>
                        )}
                        {isArchived && (
                          <span style={{ marginLeft: 6 }}>
                            <Badge label={t("dashboard.platform.languages.badgeArchived")} tone="red" />
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
                          <Badge label={t("dashboard.platform.languages.badgeOff")} tone="red" />
                        ) : (
                          <ToggleForm
                            code={locale.code}
                            field="enabled_admin"
                            current={locale.enabled_admin}
                            label={t("dashboard.platform.languages.colAdmin")}
                            t={t}
                          />
                        )}
                      </td>
                      {/* enabled_public toggle */}
                      <td style={{ padding: "10px 8px" }}>
                        {isArchived ? (
                          <Badge label={t("dashboard.platform.languages.badgeOff")} tone="red" />
                        ) : (
                          <ToggleForm
                            code={locale.code}
                            field="enabled_public"
                            current={locale.enabled_public}
                            label={t("dashboard.platform.languages.colPublic")}
                            t={t}
                          />
                        )}
                      </td>
                      {/* Set default */}
                      <td style={{ padding: "10px 8px" }}>
                        {locale.is_default ? (
                          <Badge label={t("dashboard.platform.languages.badgeYes")} tone="green" />
                        ) : isArchived ? (
                          <Badge label={t("dashboard.platform.languages.badgeNo")} tone="neutral" />
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
                              {t("dashboard.platform.languages.setDefault")}
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
                          {t("dashboard.platform.languages.edit")}
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
                              {t("dashboard.platform.languages.restore")}
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
                              {t("dashboard.platform.languages.archive")}
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
          title={interpolate(t("dashboard.platform.languages.editTitle"), { code: editLocale.code })}
          subtitle={t("dashboard.platform.languages.editSubtitle")}
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
                {t("dashboard.platform.languages.nativeLabel")}
                <input
                  name="label_native"
                  defaultValue={editLocale.label_native}
                  required
                  style={inputStyle}
                  placeholder={t("dashboard.platform.languages.nativePlaceholder")}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
                {t("dashboard.platform.languages.englishLabel")}
                <input
                  name="label_en"
                  defaultValue={editLocale.label_en}
                  required
                  style={inputStyle}
                  placeholder={t("dashboard.platform.languages.englishPlaceholder")}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
                {t("dashboard.platform.languages.fallbackLabel")}
                <input
                  name="fallback_locale"
                  defaultValue={editLocale.fallback_locale ?? ""}
                  style={inputStyle}
                  placeholder={t("dashboard.platform.languages.fallbackPlaceholder")}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
                {t("dashboard.platform.languages.sortOrderLabel")}
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
                {t("dashboard.platform.languages.saveChanges")}
              </button>
              <Link
                href="/platform/admin/languages"
                style={{ fontSize: 12.5, color: HQ.inkMuted, textDecoration: "none" }}
              >
                {t("dashboard.platform.languages.cancel")}
              </Link>
            </div>
          </form>
        </HqCard>
      )}

      {/* Add new locale */}
      <HqCard
        title={t("dashboard.platform.languages.addTitle")}
        subtitle={t("dashboard.platform.languages.addSubtitle")}
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
              {t("dashboard.platform.languages.codeLabel")}
              <input
                name="code"
                required
                style={inputStyle}
                placeholder={t("dashboard.platform.languages.codePlaceholder")}
                pattern="[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*"
                title={t("dashboard.platform.languages.codeTitle")}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
              {t("dashboard.platform.languages.nativeLabelRequired")}
              <input
                name="label_native"
                required
                style={inputStyle}
                placeholder={t("dashboard.platform.languages.nativePlaceholder")}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
              {t("dashboard.platform.languages.englishLabelRequired")}
              <input
                name="label_en"
                required
                style={inputStyle}
                placeholder={t("dashboard.platform.languages.englishPlaceholder")}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
              {t("dashboard.platform.languages.fallbackLabel")}
              <input
                name="fallback_locale"
                style={inputStyle}
                placeholder={t("dashboard.platform.languages.fallbackPlaceholderFull")}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: HQ.inkMuted }}>
              {t("dashboard.platform.languages.sortOrderLabel")}
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
              {t("dashboard.platform.languages.enableAdmin")}
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
              {t("dashboard.platform.languages.enablePublic")}
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
              {t("dashboard.platform.languages.setAsDefault")}
            </label>
          </div>

          <button type="submit" style={primaryButtonStyle}>
            {t("dashboard.platform.languages.addButton")}
          </button>
        </form>
      </HqCard>

      {/* Rules summary */}
      <HqCard
        title={t("dashboard.platform.languages.rulesTitle")}
        subtitle={t("dashboard.platform.languages.rulesSubtitle")}
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
            <strong style={{ color: HQ.ink }}>{t("dashboard.platform.languages.ruleBcp47Strong")}</strong>{" "}
            {t("dashboard.platform.languages.ruleBcp47Rest")}{" "}
            <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>en</code>,{" "}
            <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>fr</code>,{" "}
            <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>pt-BR</code>.
          </li>
          <li>
            <strong style={{ color: HQ.ink }}>{t("dashboard.platform.languages.ruleOneDefaultStrong")}</strong>{" "}
            {t("dashboard.platform.languages.ruleOneDefaultRest")}
          </li>
          <li>
            <strong style={{ color: HQ.ink }}>{t("dashboard.platform.languages.ruleDefaultProtectedStrong")}</strong>{" "}
            {t("dashboard.platform.languages.ruleDefaultProtectedRest")}
          </li>
          <li>
            <strong style={{ color: HQ.ink }}>{t("dashboard.platform.languages.ruleImmutableStrong")}</strong>{" "}
            {t("dashboard.platform.languages.ruleImmutableRest")}
          </li>
          <li>{t("dashboard.platform.languages.ruleDefaultEnables")}</li>
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
