"use client";

import { useState } from "react";
import { Avatar, ClientTrustChip, CompactLockedCard, EmptyState, GhostButton, Icon, LockedCard, MoreWithSection, PrimaryButton, PrimaryCard, ReadOnlyChip, StatusCard, StatusStrip, SwipeableRow } from "../primitives";
import { COLORS, FONTS, TRANSITION, meetsRole, useAdminShell } from "../state";
import { downloadCsv } from "../wave2";
import { FabWithQuickCreate } from "./InboxPage";
import { StatusBadge } from "./PitchesPage-1";
import { selectStyle } from "./WorkspaceTopbar";
import { Grid, PageHeader } from "./pages-shared";
import { byName } from "@/lib/field-engine/sort-comparators";


// ════════════════════════════════════════════════════════════════════
// CLIENTS
// ════════════════════════════════════════════════════════════════════

export function ClientsPage() {
  const { state, openDrawer, openUpgrade, toast, effectiveClients, importedClients } = useAdminShell();
  // Phase 3.12 — use bridge clients when available, fall back to mock.
  // importedClients (CSV imports from proto state) are always merged in.
  const clients = [...effectiveClients, ...importedClients];
  const canEdit = meetsRole(state.role, "manager");
  const isFree = state.plan === "free";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "dormant">("all");
  const [sort, setSort] = useState<"name" | "bookings" | "status">("name");

  const filteredClients = clients
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.contact ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "name") return byName(a, b);
      if (sort === "bookings") return b.bookingsYTD - a.bookingsYTD;
      if (sort === "status") return a.status.localeCompare(b.status);
      return 0;
    });

  const exportClientsCsv = () => {
    downloadCsv(
      `clients-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredClients.map((c) => ({
        name: c.name,
        contact: c.contact ?? "",
        bookingsYTD: c.bookingsYTD,
        status: c.status,
        trust: c.trust ?? "",
      })),
    );
    toast(`Exported ${filteredClients.length} rows to CSV`);
  };

  if (isFree) {
    return (
      <>
        <PageHeader
          title="Clients"
          subtitle="Inquiries from your channels. Filter by what needs you."
        />
        <Grid cols="2">
          <PrimaryCard
            title="One inquiry so far"
            description="A test inquiry from a friend referral. No client relationship yet."
            icon={<Icon name="mail" size={14} stroke={1.7} />}
            affordance="See inquiry"
            onClick={() => openDrawer("inquiry-peek", { id: "iq1" })}
          />
          <LockedCard
            title="Owned client list"
            description="With Studio, every inquiry on your domain becomes a client you own. We never share your client list with anyone — including Tulala discovery."
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Owned client list",
                why: "On Free, the public directory introduces you to clients. On Studio, those clients are yours.",
                requiredPlan: "studio",
                unlocks: ["Private client database", "Booking history per client", "Custom relationship fields"],
              })
            }
          />
        </Grid>
        <MoreWithSection plan="agency">
          <CompactLockedCard
            title="Per-client booking history"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Client history",
                why: "Track every booking, brief and contact across years.",
                requiredPlan: "agency",
              })
            }
          />
          <CompactLockedCard
            title="Custom client fields"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Client field catalog",
                why: "Add fields that match how your team actually segments clients.",
                requiredPlan: "agency",
              })
            }
          />
        </MoreWithSection>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} clients you've worked with. Each one carries booking history and notes.`}
        actions={
          <>
            <GhostButton size="sm" onClick={exportClientsCsv}>Export CSV</GhostButton>
            {canEdit ? (
              <PrimaryButton onClick={() => openDrawer("client-profile", { id: "new" })}>
                Add client
              </PrimaryButton>
            ) : (
              <ReadOnlyChip />
            )}
          </>
        }
      />

      {/* Status strip — replaces 4-up StatusCard wall */}
      <StatusStrip
        ariaLabel="Clients overview"
        items={[
          { id: "active",  label: "Active",   value: clients.filter((c) => c.status === "active").length,  tone: "green",  active: statusFilter === "active",  onClick: () => setStatusFilter(statusFilter === "active" ? "all" : "active") },
          { id: "dormant", label: "Dormant",  value: clients.filter((c) => c.status === "dormant").length, tone: "dim",    active: statusFilter === "dormant", onClick: () => setStatusFilter(statusFilter === "dormant" ? "all" : "dormant") },
          { id: "trust",   label: "Verified+", value: clients.filter((c) => c.trust && c.trust !== "basic").length, tone: "indigo" },
          { id: "ytd",     label: "Bookings YTD", value: clients.reduce((sum, c) => sum + c.bookingsYTD, 0), tone: "ink" },
        ]}
      />

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          aria-label="Search clients by name or contact"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or contact…"
          style={{
            flex: 1,
            minWidth: 200,
            padding: "9px 12px",
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            outline: "none",
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          aria-label="Status"
          style={selectStyle}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="dormant">Dormant</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Sort"
          style={selectStyle}
        >
          <option value="name">Name</option>
          <option value="bookings">Bookings</option>
          <option value="status">Status</option>
        </select>
        {(search.trim() || statusFilter !== "all" || sort !== "name") && (
          <button
            type="button"
            onClick={() => { setSearch(""); setStatusFilter("all"); setSort("name"); }}
            style={{
              padding: "7px 10px",
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
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${COLORS.borderSoft}`,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1.2fr) 80px 100px 60px", gap: 14, padding: "9px 18px", borderBottom: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }} className="bg-admin-surface-alt text-admin-ink-muted">
          <span>Client</span>
          <span>Bookings</span>
          <span>Status</span>
          <span>Trust</span>
          <span />
        </div>
        {filteredClients.length === 0 && (
          <EmptyState
            icon="user"
            title="No clients match"
            body="Try a different search or clear the status filter."
            primaryLabel="Clear filters"
            onPrimary={() => {
              setSearch("");
              setStatusFilter("all");
            }}
            compact
          />
        )}
        {filteredClients.map((client, idx) => (
          <SwipeableRow key={client.id}>
          <button
            type="button"
            onClick={() => openDrawer("client-profile", { id: client.id })}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1.2fr) 80px 100px 60px",
              alignItems: "center",
              gap: 14,
              padding: "14px 18px",
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
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <Avatar initials={client.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()} size={32} tone="auto" hashSeed={client.name} />
              <div className="min-w-0">
                <div className="text-admin-ink text-admin-13h font-semibold">{client.name}</div>
                <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">{client.contact}</div>
              </div>
            </div>
            <div className="text-admin-ink-muted text-xs">
              {client.bookingsYTD} bookings YTD
            </div>
            <div>
              <StatusBadge tone={client.status === "active" ? "green" : "dim"} label={client.status} />
            </div>
            <div>
              {client.trust ? (
                <ClientTrustChip level={client.trust} compact />
              ) : (
                <span className="text-admin-ink-dim text-admin-11">—</span>
              )}
            </div>
            <div className="flex justify-end">
              <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
            </div>
          </button>
          </SwipeableRow>
        ))}
      </div>

      {state.plan === "studio" && (
        <MoreWithSection plan="agency">
          <CompactLockedCard
            title="Custom client fields"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Client field catalog",
                why: "Add the fields your team segments clients by — region, brand tier, preferred talent.",
                requiredPlan: "agency",
              })
            }
          />
          <CompactLockedCard
            title="Booking history reports"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Reports",
                why: "Export per-client booking volume and revenue.",
                requiredPlan: "agency",
              })
            }
          />
        </MoreWithSection>
      )}

      {/* FAB — full quick-create menu (mobile only) */}
      {canEdit && <FabWithQuickCreate />}

    </>
  );
}
