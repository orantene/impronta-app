"use client";

import { useState } from "react";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { Avatar, ClientTrustChip, CompactLockedCard, EmptyState, GhostButton, Icon, LockedCard, MoreWithSection, PrimaryButton, PrimaryCard, ReadOnlyChip, StatusStrip, SwipeableRow } from "../primitives";
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
  const t = useT();
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
    toast(interpolate(t("dashboard.adminClients.exportedRows"), { count: filteredClients.length }));
  };

  if (isFree) {
    return (
      <>
        <PageHeader
          title={t("dashboard.adminClients.title")}
          subtitle={t("dashboard.adminClients.freeSubtitle")}
        />
        <Grid cols="2">
          <PrimaryCard
            title={t("dashboard.adminClients.oneInquiryTitle")}
            description={t("dashboard.adminClients.oneInquiryDesc")}
            icon={<Icon name="mail" size={14} stroke={1.7} />}
            affordance={t("dashboard.adminClients.seeInquiry")}
            onClick={() => openDrawer("inquiry-peek", { id: "iq1" })}
          />
          <LockedCard
            title={t("dashboard.adminClients.ownedListTitle")}
            description={t("dashboard.adminClients.ownedListDesc")}
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminClients.upOwnedListFeature"),
                why: t("dashboard.adminClients.upOwnedListWhy"),
                requiredPlan: "studio",
                unlocks: [t("dashboard.adminClients.upOwnedListUnlock1"), t("dashboard.adminClients.upOwnedListUnlock2"), t("dashboard.adminClients.upOwnedListUnlock3")],
              })
            }
          />
        </Grid>
        <MoreWithSection plan="agency">
          <CompactLockedCard
            title={t("dashboard.adminClients.lockPerClientHistory")}
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminClients.upClientHistoryFeature"),
                why: t("dashboard.adminClients.upClientHistoryWhy"),
                requiredPlan: "agency",
              })
            }
          />
          <CompactLockedCard
            title={t("dashboard.adminClients.lockCustomFields")}
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminClients.upFieldCatalogFeature"),
                why: t("dashboard.adminClients.upFieldCatalogWhyFree"),
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
        title={t("dashboard.adminClients.title")}
        subtitle={interpolate(t("dashboard.adminClients.subtitle"), { count: clients.length })}
        actions={
          <>
            <GhostButton size="sm" onClick={exportClientsCsv}>{t("dashboard.adminClients.exportCsv")}</GhostButton>
            {canEdit ? (
              <PrimaryButton onClick={() => openDrawer("client-profile", { id: "new" })}>
                {t("dashboard.adminClients.addClient")}
              </PrimaryButton>
            ) : (
              <ReadOnlyChip />
            )}
          </>
        }
      />

      {/* Status strip — replaces 4-up StatusCard wall */}
      <StatusStrip
        ariaLabel={t("dashboard.adminClients.overviewAria")}
        items={[
          { id: "active",  label: t("dashboard.adminClients.active"),   value: clients.filter((c) => c.status === "active").length,  tone: "green",  active: statusFilter === "active",  onClick: () => setStatusFilter(statusFilter === "active" ? "all" : "active") },
          { id: "dormant", label: t("dashboard.adminClients.dormant"),  value: clients.filter((c) => c.status === "dormant").length, tone: "dim",    active: statusFilter === "dormant", onClick: () => setStatusFilter(statusFilter === "dormant" ? "all" : "dormant") },
          { id: "trust",   label: t("dashboard.adminClients.verifiedPlus"), value: clients.filter((c) => c.trust && c.trust !== "basic").length, tone: "indigo" },
          { id: "ytd",     label: t("dashboard.adminClients.bookingsYtd"), value: clients.reduce((sum, c) => sum + c.bookingsYTD, 0), tone: "ink" },
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
          aria-label={t("dashboard.adminClients.searchAria")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("dashboard.adminClients.searchPlaceholder")}
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
          aria-label={t("dashboard.adminClients.statusAria")}
          style={selectStyle}
        >
          <option value="all">{t("dashboard.adminClients.allStatuses")}</option>
          <option value="active">{t("dashboard.adminClients.active")}</option>
          <option value="dormant">{t("dashboard.adminClients.dormant")}</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label={t("dashboard.adminClients.sortAria")}
          style={selectStyle}
        >
          <option value="name">{t("dashboard.adminClients.sortName")}</option>
          <option value="bookings">{t("dashboard.adminClients.sortBookings")}</option>
          <option value="status">{t("dashboard.adminClients.sortStatus")}</option>
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
            <span aria-hidden>×</span> {t("dashboard.adminClients.clear")}
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
          <span>{t("dashboard.adminClients.colClient")}</span>
          <span>{t("dashboard.adminClients.colBookings")}</span>
          <span>{t("dashboard.adminClients.colStatus")}</span>
          <span>{t("dashboard.adminClients.colTrust")}</span>
          <span />
        </div>
        {filteredClients.length === 0 && (
          <EmptyState
            icon="user"
            title={t("dashboard.adminClients.emptyTitle")}
            body={t("dashboard.adminClients.emptyBody")}
            primaryLabel={t("dashboard.adminClients.clearFilters")}
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
              {/* Client type carries no photo/logo URL, so photoUrl is left
                  undefined — the Avatar primitive renders its letter-free
                  silhouette on a per-client tint (hashSeed only tints; it
                  never resolves to stock imagery). */}
              <Avatar photoUrl={undefined} size={32} tone="auto" hashSeed={client.name} />
              <div className="min-w-0">
                <div className="text-admin-ink text-admin-13h font-semibold">{client.name}</div>
                <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">{client.contact}</div>
              </div>
            </div>
            <div className="text-admin-ink-muted text-xs">
              {interpolate(t("dashboard.adminClients.bookingsYtdCount"), { count: client.bookingsYTD })}
            </div>
            <div>
              <StatusBadge tone={client.status === "active" ? "green" : "dim"} label={t(client.status === "active" ? "dashboard.adminClients.active" : "dashboard.adminClients.dormant")} />
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
            title={t("dashboard.adminClients.lockCustomFields")}
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminClients.upFieldCatalogFeature"),
                why: t("dashboard.adminClients.upFieldCatalogWhyStudio"),
                requiredPlan: "agency",
              })
            }
          />
          <CompactLockedCard
            title={t("dashboard.adminClients.lockReports")}
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminClients.upReportsFeature"),
                why: t("dashboard.adminClients.upReportsWhy"),
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
