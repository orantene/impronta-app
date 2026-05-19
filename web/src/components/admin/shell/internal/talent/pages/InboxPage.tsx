"use client";

import { useState } from "react";
import { pinNextConversation as pinNextConversationT } from "../../messages";
import { EmptyState, Icon } from "../../primitives";
import { COLORS, FONTS, INQUIRY_STAGE_META, TALENT_REQUESTS, useAdminShell } from "../../state";
import { type InboxFilter, type InboxItem } from "../shared/client-threads-1";
import { AIReplyAssistant, BulkActionBar, InboxFilterChips, InboxPowerToolbar, InboxRow } from "../shared/client-threads-2";
import { myInquiries, myStatusOn } from "../shared/inquiry-bridge-1";
import { PageHeader } from "../shared/page-chrome-1";
import { TALENT_INQUIRY_TO_CONV } from "../shared/today-1";



export function InboxPage() {
  const { openDrawer, setTalentPage, toast } = useAdminShell();
  const goToMessages = (riOrConvId: string) => {
    pinNextConversationT(TALENT_INQUIRY_TO_CONV[riOrConvId] ?? riOrConvId);
    setTalentPage("messages");
  };
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("action");
  // Audit #23 — bulk-select state. Set of row keys (`${source}-${id}`).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Audit #24 — saved views. Persisted per-session; production reads
  // from a `talent_saved_views` table.
  const [savedView, setSavedView] = useState<string>("default");
  // Audit #26 — smart-sort axis.
  const [sortAxis, setSortAxis] = useState<"urgency" | "newest" | "value" | "fit">("urgency");
  const allMine = myInquiries();

  // Derive unified InboxItems from both data sources.
  const items: InboxItem[] = [
    ...allMine.map((i): InboxItem => {
      const status = myStatusOn(i);
      const category: InboxFilter =
        status === "pending"
          ? "action"
          : i.stage === "approved" || i.stage === "booked"
            ? "confirmed"
            : i.stage === "rejected" || i.stage === "expired" || status === "declined"
              ? "closed"
              : "active";
      const microcopy =
        status === "pending"
          ? "Awaiting your answer"
          : i.stage === "coordination"
            ? "Coordinator picking talent"
            : i.stage === "offer_pending"
              ? "Offer with client"
              : i.stage === "approved"
                ? "Approved · awaiting booking"
                : i.stage === "booked"
                  ? "Booked"
                  : INQUIRY_STAGE_META[i.stage].label;
      return {
        id: i.id,
        source: "inquiry",
        category,
        client: i.clientName,
        clientTrust: i.clientTrust,
        brief: i.brief,
        kindLabel: "Inquiry",
        kindTone: status === "pending" ? "coral" : "indigo",
        microcopy,
        ageHrs: i.lastActivityHrs,
        date: i.date ?? undefined,
        agency: i.agencyName,
        onOpen: () => goToMessages(i.id),
      };
    }),
    ...TALENT_REQUESTS.map((r): InboxItem => {
      const category: InboxFilter =
        r.status === "needs-answer"
          ? "action"
          : r.status === "accepted"
            ? "confirmed"
            : r.status === "viewed"
              ? "active"
              : "closed";
      const microcopy =
        r.status === "needs-answer"
          ? "Needs your answer"
          : r.status === "viewed"
            ? "Viewed · no answer required yet"
            : r.status === "accepted"
              ? "You accepted"
              : r.status === "declined"
                ? "You declined"
                : "Expired";
      const kindLabel = r.kind.charAt(0).toUpperCase() + r.kind.slice(1);
      return {
        id: r.id,
        source: "request",
        category,
        client: r.client,
        clientTrust: r.clientTrust,
        brief: r.brief,
        kindLabel,
        kindTone: r.status === "needs-answer" ? "coral" : "amber",
        microcopy,
        ageHrs: r.ageHrs,
        date: r.date,
        amount: r.amount,
        agency: r.agency,
        onOpen: () => goToMessages(r.inquiryId ?? r.id),
      };
    }),
  ];

  // Audit #24 — saved-view filter rules. Each view is a function that
  // takes the items and returns the subset.
  const applySavedView = (its: InboxItem[]) => {
    if (savedView === "verified") return its.filter((it) => it.clientTrust !== "basic");
    if (savedView === "expiring") return its.filter((it) => (it.ageHrs ?? 0) > 16);
    if (savedView === "agency") return its.filter((it) => it.agency !== undefined);
    return its;
  };

  // Apply search + filter + saved view
  const filtered = applySavedView(
    items.filter((it) => {
      if (filter !== "all" && it.category !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!it.client.toLowerCase().includes(q) && !it.brief.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    }),
  );

  // Audit #26 — smart sort. Mutates filtered's sort axis.
  const sorted = [...filtered].sort((a, b) => {
    if (sortAxis === "newest") return (a.ageHrs ?? 0) - (b.ageHrs ?? 0);
    if (sortAxis === "value") {
      const valA = parseFloat((a.amount ?? "0").replace(/[^0-9.]/g, "")) || 0;
      const valB = parseFloat((b.amount ?? "0").replace(/[^0-9.]/g, "")) || 0;
      return valB - valA;
    }
    if (sortAxis === "fit") {
      // Mock: verified clients > silver > gold > basic; tie-broken by age.
      const tierRank: Record<string, number> = { gold: 0, silver: 1, verified: 2, basic: 3 };
      return (tierRank[a.clientTrust ?? "basic"] ?? 3) - (tierRank[b.clientTrust ?? "basic"] ?? 3);
    }
    // urgency: action items first, then by age
    const actA = a.category === "action" ? 0 : 1;
    const actB = b.category === "action" ? 0 : 1;
    if (actA !== actB) return actA - actB;
    return (b.ageHrs ?? 0) - (a.ageHrs ?? 0);
  });

  const counts = {
    action: items.filter((it) => it.category === "action").length,
    active: items.filter((it) => it.category === "active").length,
    confirmed: items.filter((it) => it.category === "confirmed").length,
    closed: items.filter((it) => it.category === "closed").length,
    all: items.length,
  };

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Inquiries from your agencies plus holds and casting calls. Filter by what you need to do."
      />

      {/* Search bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "#fff",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: "9px 14px",
          marginBottom: 12,
        }}
      >
        <Icon name="search" size={13} color={COLORS.inkDim} />
        <input
          type="text"
          placeholder="Search by client or brief…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: "none",
            background: "transparent",
            outline: "none",
            fontFamily: FONTS.body,
            fontSize: 13.5,
            color: COLORS.ink,
            flex: 1,
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: COLORS.inkDim }}
          >
            <Icon name="x" size={12} color={COLORS.inkDim} />
          </button>
        )}
      </div>

      {/* Filter chip strip — same pattern as Calendar */}
      <InboxFilterChips filter={filter} onChange={setFilter} counts={counts} />

      {/* Audit #24 + #26 — saved views + smart-sort toolbar. Sits above
          the list so all triage controls are in one place. */}
      <InboxPowerToolbar
        savedView={savedView}
        onSavedViewChange={setSavedView}
        sortAxis={sortAxis}
        onSortChange={setSortAxis}
        totalShown={filtered.length}
      />

      {/* Audit #23 — bulk action bar. Renders only when selection > 0. */}
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
        />
      )}

      <div style={{ height: 16 }} />

      {/* E1: AI reply assistant prototype. Shows when there's an action
          item — suggests a reply for the top pending. Mock — production
          calls an LLM with the inquiry context. Privacy: opt-in toggle
          in Settings (per spec); on by default in this prototype. */}
      {counts.action > 0 && (
        <AIReplyAssistant
          item={items.find((it) => it.category === "action") ?? null}
        />
      )}

      {/* Unified list — same row anatomy across all kinds. */}
      <section
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          padding: "0 14px",
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: "32px 12px" }}>
            <EmptyState
              icon="mail"
              title={
                search
                  ? `No ${filter === "all" ? "items" : filter + " items"} match "${search}"`
                  : filter === "action"
                    ? "Inbox zero. Enjoy the quiet."
                    : filter === "closed"
                      ? "Archive is clear"
                      : filter === "all"
                        ? "No jobs yet"
                        : `No ${filter} items`
              }
              body={
                filter === "action"
                  ? "You're caught up — every offer, hold, and request has been handled. Open a different filter to peek at what's in flight."
                  : filter === "all"
                    ? "You'll see here every job an agency invites you to. Make sure your profile is complete so agencies find you."
                    : "Switch filter above to see other items."
              }
              primaryLabel={!search && filter === "all" ? "Complete your profile" : undefined}
              onPrimary={!search && filter === "all" ? () => setTalentPage("profile") : undefined}
              compact
            />
          </div>
        ) : (
          sorted.map((it, idx) => {
            const key = `${it.source}-${it.id}`;
            return (
              <InboxRow
                key={key}
                item={it}
                first={idx === 0}
                checked={selected.has(key)}
                onToggleCheck={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
                onTemplate={() => openDrawer("reply-templates", { itemId: key })}
              />
            );
          })
        )}
      </section>
    </>
  );
}
