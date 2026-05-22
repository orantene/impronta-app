"use client";

/**
 * Platform Admin — tenant management section stack.
 *
 * The display-oriented sections (Summary, Links, Owner & billing, Analytics,
 * System & audit) plus <TenantSectionStack/>, the ordered stack rendered by
 * both the management drawer and the full-page detail. Interactive sections
 * (Members, Plan override) live in tenant-sections-manage.tsx.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  HQ,
  HQ_FD,
  HQ_FM,
  Chip,
  PlanChip,
  StatusChip,
  EntityChip,
  MonoId,
} from "./hq-kit";
import {
  Accordion,
  Btn,
  fmtDate,
  type OnChanged,
  type SectionProps,
} from "./tenant-section-kit";
import {
  MembersSection,
  PlanOverrideSection,
} from "./tenant-sections-manage";
import { CommissionSection } from "./tenant-commission-section";
import type { TenantManagementDetail } from "../../tenant-management-data";

// ─── Shared mini-primitives ────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  caption,
  tone = "ink",
}: {
  label: string;
  value: ReactNode;
  caption?: string;
  tone?: "ink" | "amber" | "green" | "dim";
}) {
  const color =
    tone === "amber"
      ? HQ.amber
      : tone === "green"
        ? HQ.green
        : tone === "dim"
          ? HQ.inkDim
          : HQ.ink;
  return (
    <div
      style={{
        background: HQ.cardSofter,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: HQ.inkDim,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 19,
          fontWeight: 500,
          color,
          fontFamily: HQ_FD,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      {caption && (
        <span style={{ fontSize: 10.5, color: HQ.inkMuted }}>{caption}</span>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "7px 0",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
      }}
    >
      <span style={{ width: 130, flexShrink: 0, color: HQ.inkMuted }}>{k}</span>
      <span style={{ flex: 1, minWidth: 0, color: HQ.ink, textAlign: "right" }}>
        {v}
      </span>
    </div>
  );
}

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
};

function localeLabel(code: string): string {
  return LOCALE_LABELS[code] ?? code.toUpperCase();
}

// ─── A. Summary ─────────────────────────────────────────────────────────────────

function SummarySection({ detail, defaultOpen }: SectionProps) {
  const atCapacity =
    detail.seats !== null && detail.activeTalentCount >= detail.seats;
  return (
    <Accordion title="Summary" defaultOpen={defaultOpen ?? true}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
          gap: 8,
          paddingTop: 10,
        }}
      >
        <StatTile
          label="Plan"
          value={<PlanChip plan={detail.plan} />}
          caption={detail.entityType}
        />
        <StatTile label="Status" value={<StatusChip status={detail.status} />} />
        <StatTile
          label="Talents"
          value={`${detail.activeTalentCount}`}
          caption={`${detail.totalTalentCount} total on roster`}
          tone={atCapacity ? "amber" : "ink"}
        />
        <StatTile
          label="Talent types"
          value={detail.talentTypeCount}
          caption="active categories"
        />
        <StatTile
          label="Seat limit"
          value={detail.seats === null ? "∞" : detail.seats}
          caption={atCapacity ? "at capacity" : "available"}
          tone={atCapacity ? "amber" : "ink"}
        />
        <StatTile label="Staff" value={detail.staffCount} caption="members" />
        <StatTile
          label="Created"
          value={<span style={{ fontSize: 13 }}>{detail.createdAtLabel}</span>}
        />
        <StatTile
          label="Last updated"
          value={<span style={{ fontSize: 13 }}>{detail.updatedAtLabel}</span>}
        />
      </div>
      {detail.talentTypes.length > 0 && (
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}
        >
          {detail.talentTypes.map((t) => (
            <Chip key={t} outline>
              {t}
            </Chip>
          ))}
        </div>
      )}
    </Accordion>
  );
}

// ─── B. Links ────────────────────────────────────────────────────────────────

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 0",
        borderTop: `1px solid ${HQ.borderSoft}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: HQ.inkMuted,
            fontWeight: 600,
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: HQ.inkDim,
            fontFamily: HQ_FM,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {url}
        </div>
      </div>
      <Btn
        size="sm"
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Btn>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: "none" }}
      >
        <Btn size="sm" tone="primary">
          Open ↗
        </Btn>
      </a>
    </div>
  );
}

function LinksSection({ detail, defaultOpen }: SectionProps) {
  const { urls } = detail;
  return (
    <Accordion title="Links" defaultOpen={defaultOpen ?? true}>
      <LinkRow label="Public site" url={urls.publicSite} />
      <LinkRow label="Admin dashboard" url={urls.adminDashboard} />
      <LinkRow label="Billing & plan" url={urls.billing} />
      {urls.customDomain && (
        <LinkRow label="Custom domain" url={urls.customDomain} />
      )}
      <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: "10px 0 0" }}>
        Opening the admin dashboard requires a workspace membership or support
        access — platform super-admins are not auto-members of every workspace.
      </p>
    </Accordion>
  );
}

// ─── C. Owner & billing ──────────────────────────────────────────────────────

function OwnerBillingSection({ detail, defaultOpen }: SectionProps) {
  const { owner, billing, override } = detail;
  return (
    <Accordion title="Owner & billing" defaultOpen={defaultOpen ?? true}>
      <div style={{ paddingTop: 8 }}>
        {owner ? (
          <div
            style={{
              background: HQ.cardSofter,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: HQ.ink }}>
              {owner.displayName}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: HQ.inkMuted,
                fontFamily: HQ_FM,
                marginTop: 1,
              }}
            >
              {owner.email}
            </div>
            <div
              style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}
            >
              <Chip bg={HQ.greenSoft} color={HQ.green}>
                Owner · billing responsible
              </Chip>
            </div>
            <div style={{ marginTop: 6 }}>
              <MonoId value={owner.profileId} />
            </div>
          </div>
        ) : (
          <div
            style={{
              background: HQ.redSoft,
              border: "1px solid rgba(243,103,114,0.25)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12,
              color: HQ.red,
            }}
          >
            No active owner — billing is unassigned. Assign an owner from the
            Members section.
          </div>
        )}

        <div style={{ marginTop: 4 }}>
          <KV k="Effective plan" v={<PlanChip plan={billing.effectivePlan} />} />
          {billing.basePlan && (
            <KV
              k="Base plan"
              v={
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <PlanChip plan={billing.basePlan} />
                  <span style={{ fontSize: 10.5, color: HQ.inkDim }}>
                    under override
                  </span>
                </span>
              }
            />
          )}
          <KV
            k="Subscription"
            v={
              billing.subscriptionStatus
                ? `${billing.subscriptionPlan ?? "—"} · ${billing.subscriptionStatus}`
                : "No paid subscription"
            }
          />
          {billing.currentPeriodEnd && (
            <KV k="Renews / ends" v={fmtDate(billing.currentPeriodEnd)} />
          )}
          {billing.trialEnd && (
            <KV k="Stripe trial ends" v={fmtDate(billing.trialEnd)} />
          )}
          <KV
            k="Stripe customer"
            v={
              billing.stripeCustomerId ? (
                <MonoId value={billing.stripeCustomerId} />
              ) : (
                <span style={{ color: HQ.inkDim }}>None</span>
              )
            }
          />
          <KV
            k="Plan source"
            v={
              override
                ? "Platform override (see below)"
                : billing.subscriptionStatus
                  ? "Stripe subscription"
                  : "Plan tier default"
            }
          />
        </div>
      </div>
    </Accordion>
  );
}

// ─── D. Language & localization ─────────────────────────────────────────────

function LanguageLocalizationSection({ detail, defaultOpen }: SectionProps) {
  const language = detail.language;
  const activeLocales = language.activeLocales;
  const isDefaultActive = activeLocales.includes(language.defaultLocale);
  const hasLocales = activeLocales.length > 0;
  const isSupportedState =
    hasLocales &&
    isDefaultActive &&
    activeLocales.every((locale) => locale === "en" || locale === "es");
  const readinessTone = isSupportedState ? "green" : "amber";

  return (
    <Accordion title="Language & Localization" defaultOpen={defaultOpen ?? false}>
      <div style={{ paddingTop: 4 }}>
        <KV k="Default language" v={localeLabel(language.defaultLocale)} />
        <KV
          k="Active languages"
          v={
            <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {activeLocales.map((locale) => (
                <Chip key={locale} outline>
                  {localeLabel(locale)}
                </Chip>
              ))}
            </span>
          }
        />
        <KV
          k="Public switcher"
          v={
            language.switcherStatus === "shown"
              ? "Shown when visitors can choose EN/ES"
              : activeLocales.length > 1
                ? "Hidden by tenant preference"
                : "Hidden because only one language is active"
          }
        />
        <KV
          k="Switcher preference"
          v={language.showLanguageSwitcher ? "Show when bilingual" : "Hidden"}
        />
        <KV
          k="Settings mode"
          v={language.mode === "tenant-managed" ? "Tenant managed" : "Platform fallback"}
        />
        <KV
          k="Readiness"
          v={
            <Chip bg={readinessTone === "green" ? HQ.greenSoft : HQ.amberSoft} color={readinessTone === "green" ? HQ.green : HQ.amber}>
              {isSupportedState ? "Supported" : "Needs review"}
            </Chip>
          }
        />
        <KV k="Last updated" v={language.updatedAt ? fmtDate(language.updatedAt) : "Not set"} />
      </div>
      <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: "10px 0 0" }}>
        Platform Admin visibility is wired to the canonical tenant identity
        locale settings. Editing stays in workspace settings until platform
        override semantics are product-approved.
      </p>
    </Accordion>
  );
}

// ─── G. Analytics (preview) ──────────────────────────────────────────────────

function AnalyticsSection({ detail, defaultOpen }: SectionProps) {
  return (
    <Accordion title="Analytics" defaultOpen={defaultOpen ?? false}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
          gap: 8,
          paddingTop: 10,
        }}
      >
        <StatTile label="Inquiries" value={detail.inquiryCount} caption="lifetime" />
        <StatTile label="Bookings" value={detail.bookingCount} caption="lifetime" />
        <StatTile
          label="Domains"
          value={detail.domainCount}
          caption="registered"
        />
      </div>
      <div
        style={{
          marginTop: 10,
          padding: "10px 12px",
          background: HQ.cardSofter,
          border: `1px dashed ${HQ.border}`,
          borderRadius: 10,
        }}
      >
        <div style={{ fontSize: 11.5, color: HQ.inkMuted, fontWeight: 600 }}>
          Workspace analytics — not tracked yet
        </div>
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 5 }}>
          {[
            "Revenue",
            "Traffic",
            "Profile views",
            "Conversion rate",
            "Active users",
            "Saved talents",
          ].map((m) => (
            <Chip key={m} outline>
              {m}
            </Chip>
          ))}
        </div>
        <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: "8px 0 0" }}>
          Inquiry and booking totals above are real. The metrics above are not
          instrumented yet — this section is structured so they slot in without
          a redesign.
        </p>
      </div>
    </Accordion>
  );
}

// ─── H. System & audit ───────────────────────────────────────────────────────

function SystemAuditSection({ detail, defaultOpen }: SectionProps) {
  return (
    <Accordion title="System & audit" defaultOpen={defaultOpen ?? false}>
      <div style={{ paddingTop: 4 }}>
        <KV k="Workspace ID" v={<MonoId value={detail.id} />} />
        <KV k="Slug" v={<MonoId value={detail.slug} />} />
        <KV k="Entity type" v={<EntityChip entityType={detail.entityType} />} />
        <KV k="Created" v={fmtDate(detail.createdAt)} />
        <KV k="Last updated" v={fmtDate(detail.updatedAt)} />
      </div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: HQ.inkDim,
          margin: "12px 0 2px",
        }}
      >
        Recent platform actions
      </div>
      {detail.recentAudit.length === 0 ? (
        <div style={{ fontSize: 11.5, color: HQ.inkDim, padding: "8px 0" }}>
          No platform actions recorded for this workspace.
        </div>
      ) : (
        detail.recentAudit.map((a, i) => (
          <div
            key={`${a.action}-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 0",
              borderTop: `1px solid ${HQ.borderSoft}`,
              fontSize: 11.5,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background:
                  a.severity === "emergency"
                    ? HQ.red
                    : a.severity === "warn"
                      ? HQ.amber
                      : HQ.inkDim,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: HQ.inkMuted,
                fontFamily: HQ_FM,
                fontSize: 10.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {a.action}
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ color: HQ.inkDim, fontSize: 10.5 }}>
              {a.createdAtLabel}
            </span>
          </div>
        ))
      )}
    </Accordion>
  );
}

// ─── Stack ───────────────────────────────────────────────────────────────────

export function TenantSectionStack({
  detail,
  onChanged,
  mode,
}: {
  detail: TenantManagementDetail;
  onChanged: OnChanged;
  mode: "drawer" | "page";
}) {
  const drawer = mode === "drawer";
  // Memoise so a host re-render doesn't rebuild every section needlessly.
  const sections = useMemo(
    () => [
      <SummarySection key="s" detail={detail} onChanged={onChanged} defaultOpen />,
      <LinksSection
        key="l"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={!drawer}
      />,
      <OwnerBillingSection
        key="o"
        detail={detail}
        onChanged={onChanged}
        defaultOpen
      />,
      <MembersSection
        key="m"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={!drawer}
      />,
      <PlanOverrideSection
        key="p"
        detail={detail}
        onChanged={onChanged}
        defaultOpen
      />,
      <CommissionSection
        key="commission"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={false}
      />,
      <LanguageLocalizationSection
        key="lang"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={!drawer}
      />,
      <AnalyticsSection
        key="a"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={!drawer}
      />,
      <SystemAuditSection
        key="y"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={false}
      />,
    ],
    [detail, onChanged, drawer],
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sections}
    </div>
  );
}
