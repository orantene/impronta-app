"use client";

import { useState } from "react";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { workspacePathHost } from "@/lib/saas/workspace-public-url";
import { pinNextConversation as pinNextConversationP } from "../messages";
import { ClientTrustChip, CompactLockedCard, EmptyState, GhostButton, Icon, MoreWithSection, PrimaryButton, ReadOnlyChip, SecondaryButton, StatusPill, StatusStrip } from "../primitives";
import { COLORS, FONTS, FREE_PLAN_VALUE, TRANSITION, describeSourceChannelKey, describeSourceKeys, meetsRole, useAdminShell } from "../state";
import type { InquirySource, RichInquiry } from "../state";
import { downloadCsv } from "../wave2";
import { FabWithQuickCreate } from "./InboxPage";
import { PageHeader } from "./pages-shared";


// ════════════════════════════════════════════════════════════════════
// WORK
// ════════════════════════════════════════════════════════════════════

export function WorkPage() {
  const t = useT();
  const { state, openDrawer, setPage, openUpgrade, toast, effectiveMessagesInquiries, effectiveBookings } = useAdminShell();
  const canEdit = meetsRole(state.role, "manager");
  const isFree = state.plan === "free";

  // Normalise real RichInquiry rows to the flat shape the list rows need.
  // Context already handles empty-vs-mock via the bridge presence check —
  // we just map whatever the context gives us. Removing the `length > 0`
  // gate was the fix that stopped real tenants with 0 inquiries from
  // seeing mock "24 active" data on their dashboard.
  const bridgeInquiries = effectiveMessagesInquiries.map((r) => ({
    id: r.id,
    client: r.clientName,
    brief: r.brief,
    talent: r.requirementGroups.flatMap((g) => g.talents.map((t) => t.name)),
    stage: r.stage,
    amount: r.offer?.total ?? null,
    source: r.source,
    richRef: r,
  }));

  type SourceKind = "all" | "direct" | "hub" | "manual" | "marketplace";
  const [sourceFilter, setSourceFilter] = useState<SourceKind>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "client" | "amount">("newest");

  const filteredInquiries = bridgeInquiries
    .filter((iq) => sourceFilter === "all" || iq.source?.kind === sourceFilter)
    .filter((iq) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return iq.client.toLowerCase().includes(q) || iq.brief.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === "client") return a.client.localeCompare(b.client);
      if (sort === "amount") {
        const an = parseInt(((a.amount as string | null) ?? "0").replace(/[^\d]/g, "")) || 0;
        const bn = parseInt(((b.amount as string | null) ?? "0").replace(/[^\d]/g, "")) || 0;
        return bn - an;
      }
      return sort === "oldest" ? 1 : -1;
    });

  const exportCsv = () => {
    downloadCsv(
      `pipeline-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredInquiries.map((iq) => ({
        client: iq.client,
        brief: iq.brief,
        talent: Array.isArray(iq.talent) ? (iq.talent as string[]).join(", ") : "",
        stage: iq.stage,
        amount: (iq.amount as string | null) ?? "",
        source: iq.source?.kind ?? "",
      })),
    );
    toast(interpolate(t("dashboard.adminWork.exportedRows"), { count: filteredInquiries.length }));
  };

  // Legacy stage names ("hold", "awaiting-client", "confirmed") came from the
  // old mock-inquiry shape. The bridge now returns canonical InquiryStage
  // names from the server. Drop the legacy comparisons — they were dead
  // code that the type system now flags.
  const drafts = bridgeInquiries.filter((i) => i.stage === "draft" || i.stage === "submitted");
  const awaiting = bridgeInquiries.filter((i) => i.stage === "offer_pending");
  const confirmed = effectiveBookings.length > 0 ? effectiveBookings : bridgeInquiries.filter((i) => i.stage === "booked" || i.stage === "approved");

  return (
    <>
      <PageHeader
        title={t("dashboard.adminWork.title")}
        subtitle={t("dashboard.adminWork.subtitle")}
        actions={
          <>
            <GhostButton size="sm" onClick={exportCsv}>{t("dashboard.adminWork.exportCsv")}</GhostButton>
            {!canEdit && <ReadOnlyChip />}
            {canEdit && (
              <PrimaryButton onClick={() => openDrawer("new-inquiry")}>
                {t("dashboard.adminWork.newInquiry")}
              </PrimaryButton>
            )}
          </>
        }
      />

      <StatusStrip
        ariaLabel={t("dashboard.adminWork.pipelineOverviewAria")}
        items={[
          { id: "drafts",    label: t("dashboard.adminWork.draftsHolds"), value: drafts.length,    tone: "amber",  onClick: () => openDrawer("drafts-holds") },
          { id: "awaiting",  label: t("dashboard.adminWork.awaitingClient"), value: awaiting.length, tone: "amber",  onClick: () => openDrawer("awaiting-client") },
          { id: "confirmed", label: t("dashboard.adminWork.confirmed"),       value: Array.isArray(confirmed) ? confirmed.length : 0, tone: "green",  onClick: () => openDrawer("confirmed-bookings") },
        ]}
      />

      {/* Pipeline list */}
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div>
            <h2 style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 500, margin: 0, letterSpacing: -0.2 }} className="text-admin-ink">
              {t("dashboard.adminWork.activePipeline")}
            </h2>
            {(search.trim() || sourceFilter !== "all" || sort !== "newest") && (
              <div style={{ fontFamily: FONTS.body, fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">
                {interpolate(t(filteredInquiries.length === 1 ? "dashboard.adminWork.resultCountOne" : "dashboard.adminWork.resultCountOther"), { count: filteredInquiries.length })}
                {search.trim() && ` ${interpolate(t("dashboard.adminWork.resultForQuery"), { query: search.trim() })}`}
              </div>
            )}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              aria-label={t("dashboard.adminWork.searchAria")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("dashboard.adminWork.searchPlaceholder")}
              style={{
                padding: "7px 10px",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.ink,
                background: "#fff",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 7,
                outline: "none",
                width: 180,
              }}
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              aria-label={t("dashboard.adminWork.sortAria")}
              style={{
                padding: "7px 10px",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.ink,
                background: "#fff",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 7,
                cursor: "pointer",
              }}
            >
              <option value="newest">{t("dashboard.adminWork.sortNewest")}</option>
              <option value="oldest">{t("dashboard.adminWork.sortOldest")}</option>
              <option value="client">{t("dashboard.adminWork.sortClient")}</option>
              <option value="amount">{t("dashboard.adminWork.sortAmount")}</option>
            </select>
            <SourceFilterChips value={sourceFilter} onChange={setSourceFilter} />
            {(search.trim() || sort !== "newest" || sourceFilter !== "all") && (
              <button
                type="button"
                onClick={() => { setSearch(""); setSort("newest"); setSourceFilter("all"); }}
                style={{
                  padding: "4px 10px",
                  background: "transparent",
                  color: COLORS.inkMuted,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span aria-hidden>×</span> {t("dashboard.adminWork.clear")}
              </button>
            )}
            <GhostButton onClick={() => openDrawer("filter-config")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="filter" size={12} stroke={1.7} />
                {t("dashboard.adminWork.filter")}
              </span>
            </GhostButton>
          </div>
        </div>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: `1px solid ${COLORS.borderSoft}`,
            overflow: "hidden",
          }}
        >
          {filteredInquiries.length === 0 && (
            <EmptyState
              icon="mail"
              title={search.trim() ? interpolate(t("dashboard.adminWork.emptySearchTitle"), { query: search.trim() }) : t("dashboard.adminWork.emptyTitle")}
              body={search.trim() ? t("dashboard.adminWork.emptySearchBody") : t("dashboard.adminWork.emptyBody")}
              primaryLabel={search.trim() ? t("dashboard.adminWork.clearSearch") : t("dashboard.adminWork.newInquiry")}
              onPrimary={() => { if (search.trim()) setSearch(""); else openDrawer("new-inquiry"); }}
            />
          )}
          {filteredInquiries.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,2fr) 110px 110px 70px", gap: 14, padding: "9px 18px", background: "rgba(11,11,13,0.02)", borderBottom: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }} className="text-admin-ink-muted">
              <span>{t("dashboard.adminWork.colClientBrief")}</span>
              <span>{t("dashboard.adminWork.colTalent")}</span>
              <span>{t("dashboard.adminWork.colStage")}</span>
              <span>{t("dashboard.adminWork.colAmount")}</span>
              <span />
            </div>
          )}
          {filteredInquiries.map((iq, idx) => {
            const rich = iq.richRef as RichInquiry | null;
            const talentList = (iq.talent as string[]).join(", ");
            return (
            <button
              key={iq.id}
              onClick={() => {
                if (rich) {
                  pinNextConversationP(rich.id);
                  setPage("messages");
                } else {
                  openDrawer("inquiry-peek", { id: iq.id });
                }
              }}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1.4fr) minmax(0,2fr) 110px 110px 70px",
                alignItems: "center",
                gap: 14,
                padding: "13px 18px",
                background: "transparent",
                border: "none",
                borderTop: idx > 0 ? `1px solid ${COLORS.borderSoft}` : "none",
                cursor: "pointer",
                fontFamily: FONTS.body,
                textAlign: "left",
                width: "100%",
                transition: `background ${TRANSITION.micro}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.025)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div className="min-w-0">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: -0.05 }} className="text-admin-ink">
                    {iq.client}
                  </span>
                  {rich && <ClientTrustChip level={rich.clientTrust} compact />}
                  {iq.source && <SourceChip source={iq.source as RichInquiry["source"]} />}
                </div>
                <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
                  {iq.brief}
                </div>
              </div>
              <div style={{ fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink-muted">
                {talentList || "—"}
              </div>
              <div>
                <StageBadge stage={iq.stage} />
              </div>
              <div className="text-admin-ink-muted text-xs">
                {(iq.amount as string | null) ?? "—"}
              </div>
              <div className="flex justify-end">
                <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
              </div>
            </button>
            );
          })}
        </div>
      </section>

      {isFree && (
        <MoreWithSection plan="studio">
          <CompactLockedCard
            title={t("dashboard.adminWork.lockPrivateInbox")}
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminWork.upPrivateInquiriesFeature"),
                why: t("dashboard.adminWork.upPrivateInquiriesWhy"),
                requiredPlan: "studio",
              })
            }
          />
          <CompactLockedCard
            title={t("dashboard.adminWork.lockEmailTemplates")}
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminWork.upEmailTemplatesFeature"),
                why: t("dashboard.adminWork.upEmailTemplatesWhy"),
                requiredPlan: "studio",
              })
            }
          />
        </MoreWithSection>
      )}
      {canEdit && <FabWithQuickCreate />}
    </>
  );
}

/**
 * Origin chip rendered next to the client name on a pipeline row. Uses the
 * localized `describeSourceKeys` sibling so the visible text always reflects
 * what's in state, in the active locale — e.g. "via acme-models.com",
 * "via Tulala Hub", "added by email" / "anadido por correo". Kept tiny and
 * outline-styled so it never competes with stage colour.
 */
function SourceChip({ source }: { source: InquirySource }) {
  const t = useT();
  const k = describeSourceKeys(source);
  // Manual sources interpolate a localized channel label into the short/long
  // templates (the channel name itself is translated, not just the frame).
  const channel = source.kind === "manual" ? t(describeSourceChannelKey(source)) : undefined;
  const shortParams = { ...(k.shortParams ?? {}), ...(channel ? { channel } : {}) };
  const longParams = { ...(k.longParams ?? {}), ...(channel ? { channel } : {}) };
  const shortText = interpolate(t(k.shortKey), shortParams);
  const longText = interpolate(t(k.longKey), longParams);
  return (
    <span
      title={longText}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px",
        background: "transparent",
        color: COLORS.inkMuted,
        border: `1px solid ${COLORS.borderSoft}`,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: 0.2,
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {shortText}
    </span>
  );
}

/**
 * Compact source-filter row above the pipeline. Lives inline rather than
 * in a drawer because filtering by origin is a primary slicing axis for
 * the coordinator (a hub-forwarded inquiry behaves differently).
 */
function SourceFilterChips({
  value,
  onChange,
}: {
  value: "all" | "direct" | "hub" | "manual" | "marketplace";
  onChange: (v: "all" | "direct" | "hub" | "manual" | "marketplace") => void;
}) {
  const t = useT();
  const opts: { v: typeof value; label: string }[] = [
    { v: "all", label: t("dashboard.adminWork.sourceAll") },
    { v: "direct", label: t("dashboard.adminWork.sourceDirect") },
    { v: "hub", label: t("dashboard.adminWork.sourceHub") },
    { v: "manual", label: t("dashboard.adminWork.sourceManual") },
    { v: "marketplace", label: t("dashboard.adminWork.sourceMarketplace") },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        background: "rgba(11,11,13,0.04)",
        borderRadius: 999,
        padding: 2,
        gap: 0,
      }}
    >
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.v)}
            style={{
              border: "none",
              background: active ? "#fff" : "transparent",
              color: active ? COLORS.ink : COLORS.inkMuted,
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: active ? 600 : 500,
              padding: "4px 10px",
              borderRadius: 999,
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: active ? "0 1px 2px rgba(11,11,13,0.06)" : "none",
              transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pipeline-stage badge. Translates stage id → label + tone, then delegates
 * to the StatusPill primitive.
 */
function StageBadge({ stage }: { stage: string }) {
  const t = useT();
  const map: Record<string, { labelKey: string; tone: "ink" | "amber" | "green" | "dim" | "red" }> = {
    draft: { labelKey: "dashboard.adminWork.stageDraft", tone: "dim" },
    hold: { labelKey: "dashboard.adminWork.stageHold", tone: "amber" },
    "awaiting-client": { labelKey: "dashboard.adminWork.stageAwaitingClient", tone: "amber" },
    confirmed: { labelKey: "dashboard.adminWork.stageConfirmed", tone: "green" },
    archived: { labelKey: "dashboard.adminWork.stageArchived", tone: "dim" },
  };
  const m = map[stage];
  return <StatusPill tone={m?.tone ?? "dim"} label={m ? t(m.labelKey) : stage} />;
}

/**
 * "Today on Free" — the value-not-walls panel. Replaces the old "here's
 * what's locked" framing with an honest list of what works on Free, plus
 * concrete usage caps shown as soft progress bars (not blockers). When a
 * cap nears 80% we surface a one-line upgrade nudge inline.
 *
 * Why: the prior architecture made Free feel like a sandbox with all the
 * doors locked. The actual model is "your agency is live, with caps." We
 * now lead with that.
 */
export function FreeValuePanel() {
  const t = useT();
  const { setPage, openDrawer, effectiveRoster, effectiveTenant } = useAdminShell();
  // Patch the static FREE_PLAN_VALUE entries that contain fixture data:
  // - "roster" → real count from bridge (cap stays 5)
  // - "storefront" → real subdomain URL
  const freePlanItems = FREE_PLAN_VALUE.map((v): typeof v & { detailOverride?: string } => {
    if (v.id === "roster" && v.used) {
      return { ...v, used: { ...v.used, current: effectiveRoster.length } };
    }
    if (v.id === "storefront") {
      // Real public host replaces the fixture detail; localized frame.
      // Must NOT synthesize `<slug>.tulala.digital`: branded subdomains are a
      // paid-tier feature and are provisioned per tenant, so for a Free
      // workspace that host is never attached and 404s. workspacePathHost is
      // the canonical Free address (tulala.digital/w/<slug>).
      return {
        ...v,
        detailOverride: interpolate(t("dashboard.adminWork.storefrontLivesAt"), {
          domain: workspacePathHost(effectiveTenant.slug),
        }),
      };
    }
    return v;
  });
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "18px 20px",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }} className="text-admin-ink-muted">
            {t("dashboard.adminWork.todayOnFree")}
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, letterSpacing: -0.1 }} className="text-admin-ink">
            {t("dashboard.adminWork.whatWorksNow")}
          </div>
        </div>
        <GhostButton onClick={() => openDrawer("plan-compare")}>
          {t("dashboard.adminWork.comparePlans")}
        </GhostButton>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {freePlanItems.map((v, idx) => {
          const pct = v.used ? Math.min(100, Math.round((v.used.current / v.used.cap) * 100)) : 0;
          const near = v.used ? pct >= 80 : false;
          return (
            <div
              key={v.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 0",
                borderTop: idx === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
              }}
            >
              <span style={{ width: 18, height: 18, borderRadius: 999, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} className="bg-admin-green">
                <Icon name="check" size={11} stroke={2.5} color="#fff" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-admin-ink text-admin-13 font-semibold">
                  {t(v.labelKey)}
                </div>
                <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
                  {v.detailOverride ?? t(v.detailKey)}
                </div>
              </div>
              {v.used && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 11,
                      color: near ? COLORS.amber : COLORS.inkMuted,
                      letterSpacing: 0.2,
                    }}
                  >
                    {v.used.current} / {v.used.cap} {t(v.used.unitKey)}
                  </span>
                  <div
                    style={{
                      width: 60,
                      height: 4,
                      background: "rgba(11,11,13,0.06)",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{ '--progress-w': `${pct}%`, '--progress-bg': near ? COLORS.amber : COLORS.fill }}
                      className="w-[var(--progress-w)] h-full bg-[var(--progress-bg)]"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 14,
          paddingTop: 14,
          borderTop: `1px solid ${COLORS.borderSoft}`,
        }}
      >
        <span style={{ fontSize: 12, flex: 1 }} className="text-admin-ink-muted">
          {t("dashboard.adminWork.capsAreSoft")}
        </span>
        <SecondaryButton onClick={() => setPage("talent")}>{t("dashboard.adminWork.openRoster")}</SecondaryButton>
        <PrimaryButton onClick={() => setPage("work")}>{t("dashboard.adminWork.seePipeline")}</PrimaryButton>
      </div>
    </div>
  );
}
