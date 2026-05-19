"use client";

import { useState } from "react";
import { pinNextConversation as pinNextConversationP } from "../messages";
import { ClientTrustChip, CompactLockedCard, EmptyState, GhostButton, Icon, MoreWithSection, PrimaryButton, ReadOnlyChip, SecondaryButton, StatusPill, StatusStrip } from "../primitives";
import { COLORS, FONTS, FREE_PLAN_VALUE, RICH_INQUIRIES, TRANSITION, describeSource, getInquiries, meetsRole, useAdminShell } from "../state";
import type { InquirySource, RichInquiry } from "../state";
import { downloadCsv } from "../wave2";
import { FabWithQuickCreate } from "./InboxPage";
import { PageHeader } from "./pages-shared";


// ════════════════════════════════════════════════════════════════════
// WORK
// ════════════════════════════════════════════════════════════════════

export function WorkPage() {
  const { state, openDrawer, setPage, openUpgrade, toast, effectiveMessagesInquiries, effectiveBookings } = useAdminShell();
  const canEdit = meetsRole(state.role, "coordinator");
  const isFree = state.plan === "free";

  // Normalise real RichInquiry rows to the flat shape the list rows need.
  // Falls back to mock getInquiries only when the bridge hasn't loaded any data.
  const bridgeInquiries = effectiveMessagesInquiries.length > 0
    ? effectiveMessagesInquiries.map((r) => ({
        id: r.id,
        client: r.clientName,
        brief: r.brief,
        talent: r.requirementGroups.flatMap((g) => g.talents.map((t) => t.name)),
        stage: r.stage,
        amount: r.offer?.total ?? null,
        source: r.source,
        richRef: r,
      }))
    : getInquiries(state.plan).map((iq) => ({
        ...iq,
        source: RICH_INQUIRIES.find((r) => r.clientName === iq.client)?.source ?? null,
        richRef: RICH_INQUIRIES.find((r) => r.clientName === iq.client) ?? null,
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
    toast(`Exported ${filteredInquiries.length} rows to CSV`);
  };

  const drafts = bridgeInquiries.filter((i) => i.stage === "draft" || i.stage === "hold" || i.stage === "submitted");
  const awaiting = bridgeInquiries.filter((i) => i.stage === "offer_pending" || i.stage === "awaiting-client");
  const confirmed = effectiveBookings.length > 0 ? effectiveBookings : bridgeInquiries.filter((i) => i.stage === "confirmed" || i.stage === "booked" || i.stage === "approved");

  return (
    <>
      <PageHeader
        title="Workflow"
        subtitle="Every open inquiry grouped by where it's stuck — from first brief to confirmed booking."
        actions={
          <>
            <GhostButton size="sm" onClick={exportCsv}>Export CSV</GhostButton>
            {!canEdit && <ReadOnlyChip />}
            {canEdit && (
              <PrimaryButton onClick={() => openDrawer("new-inquiry")}>
                New inquiry
              </PrimaryButton>
            )}
          </>
        }
      />

      <StatusStrip
        ariaLabel="Pipeline overview"
        items={[
          { id: "drafts",    label: "Drafts & holds", value: drafts.length,    tone: "amber",  onClick: () => openDrawer("drafts-holds") },
          { id: "awaiting",  label: "Awaiting client", value: awaiting.length, tone: "amber",  onClick: () => openDrawer("awaiting-client") },
          { id: "confirmed", label: "Confirmed",       value: Array.isArray(confirmed) ? confirmed.length : 0, tone: "green",  onClick: () => openDrawer("confirmed-bookings") },
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
            <h2
              style={{
                fontFamily: FONTS.display,
                fontSize: 20,
                fontWeight: 500,
                color: COLORS.ink,
                margin: 0,
                letterSpacing: -0.2,
              }}
            >
              Active pipeline
            </h2>
            {(search.trim() || sourceFilter !== "all" || sort !== "newest") && (
              <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                {filteredInquiries.length} {filteredInquiries.length === 1 ? "result" : "results"}
                {search.trim() && ` for "${search.trim()}"`}
              </div>
            )}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              aria-label="Search pipeline by client or brief"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client or brief…"
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
              aria-label="Sort"
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
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="client">Client</option>
              <option value="amount">Amount</option>
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
                <span aria-hidden>×</span> Clear
              </button>
            )}
            <GhostButton onClick={() => openDrawer("filter-config")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="filter" size={12} stroke={1.7} />
                Filter
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
              title={search.trim() ? `No results for "${search.trim()}"` : "No inquiries match"}
              body={search.trim() ? "Try a different search term or clear the query." : "When a brief comes in via this channel, it'll show up here. You can also log one manually."}
              primaryLabel={search.trim() ? "Clear search" : "New inquiry"}
              onPrimary={() => { if (search.trim()) setSearch(""); else openDrawer("new-inquiry"); }}
            />
          )}
          {filteredInquiries.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1.4fr) minmax(0,2fr) 110px 110px 70px",
                gap: 14,
                padding: "9px 18px",
                background: "rgba(11,11,13,0.02)",
                borderBottom: `1px solid ${COLORS.borderSoft}`,
                fontFamily: FONTS.body,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: COLORS.inkMuted,
              }}
            >
              <span>Client · brief</span>
              <span>Talent</span>
              <span>Stage</span>
              <span>Amount</span>
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
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.05 }}>
                    {iq.client}
                  </span>
                  {rich && <ClientTrustChip level={rich.clientTrust} compact />}
                  {iq.source && <SourceChip source={iq.source as RichInquiry["source"]} />}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
                  {iq.brief}
                </div>
              </div>
              <div style={{ fontSize: 12, color: COLORS.inkMuted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {talentList || "—"}
              </div>
              <div>
                <StageBadge stage={iq.stage} />
              </div>
              <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
                {(iq.amount as string | null) ?? "—"}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
            title="Private inquiry inbox"
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Private inquiries",
                why: "Take inquiries on your own domain — keep your client list private.",
                requiredPlan: "studio",
              })
            }
          />
          <CompactLockedCard
            title="Custom email templates"
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Email templates",
                why: "Send branded offers and updates from your own email-from address.",
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
 * Origin chip rendered next to the client name on a pipeline row. Uses
 * `describeSource` so the visible text always reflects what's in state —
 * e.g. "via acme-models.com", "via Tulala Hub", "added by email".
 * Kept tiny and outline-styled so it never competes with stage colour.
 */
function SourceChip({ source }: { source: InquirySource }) {
  const d = describeSource(source);
  return (
    <span
      title={d.long}
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
      {d.short}
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
  const opts: { v: typeof value; label: string }[] = [
    { v: "all", label: "All sources" },
    { v: "direct", label: "Direct" },
    { v: "hub", label: "Hub" },
    { v: "manual", label: "Manual" },
    { v: "marketplace", label: "Marketplace" },
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
  const map: Record<string, { label: string; tone: "ink" | "amber" | "green" | "dim" | "red" }> = {
    draft: { label: "Draft", tone: "dim" },
    hold: { label: "On hold", tone: "amber" },
    "awaiting-client": { label: "Awaiting client", tone: "amber" },
    confirmed: { label: "Confirmed", tone: "green" },
    archived: { label: "Archived", tone: "dim" },
  };
  const m = map[stage] ?? { label: stage, tone: "dim" as const };
  return <StatusPill tone={m.tone} label={m.label} />;
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
  const { setPage, openDrawer } = useAdminShell();
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
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
                            color: COLORS.inkMuted,
              marginBottom: 4,
            }}
          >
            Today on Free
          </div>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: -0.1,
              color: COLORS.ink,
            }}
          >
            What works right now
          </div>
        </div>
        <GhostButton onClick={() => openDrawer("plan-compare")}>
          Compare plans →
        </GhostButton>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {FREE_PLAN_VALUE.map((v, idx) => {
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
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: COLORS.green,
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="check" size={11} stroke={2.5} color="#fff" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                  {v.label}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
                  {v.detail}
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
                    {v.used.current} / {v.used.cap} {v.used.unit}
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
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: near ? COLORS.amber : COLORS.fill,
                      }}
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
        <span style={{ fontSize: 12, color: COLORS.inkMuted, flex: 1 }}>
          Caps are soft. We&apos;ll nudge before you run out — never block mid-conversation.
        </span>
        <SecondaryButton onClick={() => setPage("talent")}>Open roster</SecondaryButton>
        <PrimaryButton onClick={() => setPage("work")}>See pipeline</PrimaryButton>
      </div>
    </div>
  );
}
